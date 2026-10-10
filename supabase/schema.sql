-- Sanchari — Supabase schema
-- Run in the Supabase SQL editor (or as a migration). Requires:
--   Authentication → Providers → "Allow anonymous sign-ins" = ON
-- Every visitor gets an anonymous auth user; Row Level Security keys off auth.uid().

create extension if not exists pgcrypto;

-- ─────────────────────────── Tables ───────────────────────────

create table if not exists public.trips (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  display_name     text not null check (char_length(display_name) between 1 and 30),
  flight_number    text check (flight_number is null or char_length(flight_number) <= 10),
  airport_code     text not null check (airport_code ~ '^[A-Z]{3}$'),
  arrival_time     timestamptz not null,
  destination_id   text,
  destination_name text not null,
  destination_zone text not null,
  destination_lat  numeric(9, 6),
  destination_lng  numeric(9, 6),
  dropoff_address  text check (dropoff_address is null or char_length(dropoff_address) <= 120),
  luggage_count    integer not null default 1 check (luggage_count between 0 and 6),
  preference       text not null check (preference in ('cheapest', 'balanced', 'direct')),
  status           text not null default 'searching' check (status in ('searching', 'matched', 'completed', 'cancelled')),
  created_at       timestamptz not null default now()
);
create index if not exists trips_matching_idx on public.trips (airport_code, arrival_time) where status = 'searching';
create index if not exists trips_user_idx on public.trips (user_id);

create table if not exists public.ride_groups (
  id                      uuid primary key default gen_random_uuid(),
  airport_code            text not null check (airport_code ~ '^[A-Z]{3}$'),
  pickup_point            text not null,
  proposed_departure_time timestamptz not null,
  waiting_deadline        timestamptz not null,
  route_summary           text not null,
  route_details           jsonb,
  selected_preference     text not null check (selected_preference in ('cheapest', 'balanced', 'direct')),
  estimated_total_fare    numeric(10, 2) not null check (estimated_total_fare >= 0),
  status                  text not null default 'confirmed' check (status in ('proposed', 'confirmed', 'departed', 'cancelled')),
  created_by              uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at              timestamptz not null default now()
);

create table if not exists public.ride_members (
  id                   uuid primary key default gen_random_uuid(),
  ride_group_id        uuid not null references public.ride_groups (id) on delete cascade,
  trip_id              uuid not null references public.trips (id) on delete cascade,
  -- Denormalised, non-sensitive display fields so members never need to read each other's trips.
  display_name         text not null,
  destination_name     text not null,
  arrival_time         timestamptz not null,
  pickup_status        text not null default 'not_landed'
                       check (pickup_status in ('not_landed', 'collecting_luggage', 'walking', 'at_pickup', 'delayed', 'departed', 'left')),
  delay_minutes        integer not null default 0 check (delay_minutes between 0 and 180),
  estimated_fare_share numeric(10, 2) not null default 0 check (estimated_fare_share >= 0),
  confirmed            boolean not null default false,
  updated_at           timestamptz not null default now(),
  unique (ride_group_id, trip_id)
);
create index if not exists ride_members_trip_idx on public.ride_members (trip_id);

create table if not exists public.ride_updates (
  id            uuid primary key default gen_random_uuid(),
  ride_group_id uuid not null references public.ride_groups (id) on delete cascade,
  trip_id       uuid references public.trips (id) on delete set null,
  message       text not null check (char_length(message) between 1 and 200),
  kind          text not null default 'info' check (kind in ('info', 'warning', 'success')),
  created_at    timestamptz not null default now()
);
create index if not exists ride_updates_group_idx on public.ride_updates (ride_group_id, created_at desc);

-- ─────────────────────────── Helpers ───────────────────────────

-- True when the caller owns a trip that belongs to the group. SECURITY DEFINER avoids RLS recursion.
create or replace function public.is_ride_member(p_group uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from ride_members m join trips t on t.id = m.trip_id
    where m.ride_group_id = p_group and t.user_id = auth.uid()
  );
$$;

create or replace function public.owns_trip(p_trip uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from trips where id = p_trip and user_id = auth.uid());
$$;

-- Candidate search: other travellers' trips, WITHOUT street address and with
-- coordinates rounded to ~1 km. Only callable by signed-in (incl. anonymous) users.
create or replace function public.find_candidate_trips(p_airport text, p_from timestamptz, p_to timestamptz)
returns table (
  id uuid, display_name text, flight_number text, airport_code text, arrival_time timestamptz,
  destination_id text, destination_name text, destination_zone text,
  destination_lat numeric, destination_lng numeric, dropoff_address text,
  luggage_count integer, preference text, status text
)
language sql stable security definer set search_path = public as $$
  select t.id, t.display_name, null::text, t.airport_code, t.arrival_time,
         t.destination_id, t.destination_name, t.destination_zone,
         round(t.destination_lat, 2), round(t.destination_lng, 2), null::text,
         t.luggage_count, t.preference, t.status
  from trips t
  where auth.uid() is not null
    and t.user_id <> auth.uid()
    and t.status = 'searching'
    and t.airport_code = p_airport
    and t.arrival_time between p_from and p_to
    and p_to - p_from <= interval '6 hours'
  order by t.arrival_time
  limit 50;
$$;

-- Create a ride group atomically. The caller must own p_my_trip_id; other trips
-- must be searching at the same airport. Only the caller is auto-confirmed.
create or replace function public.create_ride_group(
  p_my_trip_id uuid, p_other_trip_ids uuid[], p_pickup_point text,
  p_proposed_departure timestamptz, p_waiting_deadline timestamptz,
  p_route_summary text, p_route_details jsonb, p_selected_preference text,
  p_estimated_total_fare numeric, p_fare_shares jsonb
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_me trips;
  v_group uuid;
  v_count int;
begin
  select * into v_me from trips where id = p_my_trip_id and user_id = auth.uid();
  if not found then raise exception 'You can only create a ride for your own trip'; end if;
  if coalesce(array_length(p_other_trip_ids, 1), 0) not between 1 and 3 then
    raise exception 'A ride needs 1 to 3 co-passengers';
  end if;
  select count(*) into v_count from trips
   where id = any(p_other_trip_ids) and status = 'searching' and airport_code = v_me.airport_code and user_id <> auth.uid();
  if v_count <> array_length(p_other_trip_ids, 1) then
    raise exception 'One of the selected travellers is no longer available';
  end if;

  insert into ride_groups (airport_code, pickup_point, proposed_departure_time, waiting_deadline,
                           route_summary, route_details, selected_preference, estimated_total_fare, created_by)
  values (v_me.airport_code, p_pickup_point, p_proposed_departure, p_waiting_deadline,
          p_route_summary, p_route_details, p_selected_preference, p_estimated_total_fare, auth.uid())
  returning id into v_group;

  insert into ride_members (ride_group_id, trip_id, display_name, destination_name, arrival_time, estimated_fare_share, confirmed)
  select v_group, t.id, t.display_name, t.destination_name, t.arrival_time,
         coalesce((p_fare_shares ->> t.id::text)::numeric, 0), t.id = p_my_trip_id
  from trips t where t.id = p_my_trip_id or t.id = any(p_other_trip_ids);

  update trips set status = 'matched' where id = p_my_trip_id or id = any(p_other_trip_ids);

  insert into ride_updates (ride_group_id, trip_id, message, kind)
  values (v_group, p_my_trip_id, left(v_me.display_name || ' proposed this shared ride', 200), 'success');
  return v_group;
end;
$$;

-- ─────────────────────────── Row Level Security ───────────────────────────

alter table public.trips        enable row level security;
alter table public.ride_groups  enable row level security;
alter table public.ride_members enable row level security;
alter table public.ride_updates enable row level security;

-- trips: owners only. Others are reachable solely through find_candidate_trips().
drop policy if exists trips_select_own on public.trips;
create policy trips_select_own on public.trips for select to authenticated using (user_id = auth.uid());
drop policy if exists trips_insert_own on public.trips;
create policy trips_insert_own on public.trips for insert to authenticated with check (user_id = auth.uid());
drop policy if exists trips_update_own on public.trips;
create policy trips_update_own on public.trips for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists trips_delete_own on public.trips;
create policy trips_delete_own on public.trips for delete to authenticated using (user_id = auth.uid());

-- ride_groups: members read and update; creation only via create_ride_group().
drop policy if exists groups_select_member on public.ride_groups;
create policy groups_select_member on public.ride_groups for select to authenticated using (public.is_ride_member(id));
drop policy if exists groups_update_member on public.ride_groups;
create policy groups_update_member on public.ride_groups for update to authenticated using (public.is_ride_member(id)) with check (public.is_ride_member(id));

-- ride_members: members see the group; each person updates only their own row.
drop policy if exists members_select_member on public.ride_members;
create policy members_select_member on public.ride_members for select to authenticated using (public.is_ride_member(ride_group_id));
drop policy if exists members_update_own on public.ride_members;
create policy members_update_own on public.ride_members for update to authenticated using (public.owns_trip(trip_id)) with check (public.owns_trip(trip_id));

-- ride_updates: members read; members post as themselves.
drop policy if exists updates_select_member on public.ride_updates;
create policy updates_select_member on public.ride_updates for select to authenticated using (public.is_ride_member(ride_group_id));
drop policy if exists updates_insert_member on public.ride_updates;
create policy updates_insert_member on public.ride_updates for insert to authenticated
  with check (public.is_ride_member(ride_group_id) and (trip_id is null or public.owns_trip(trip_id)));

-- Column-level limits on top of RLS.
revoke all on public.trips, public.ride_groups, public.ride_members, public.ride_updates from anon;
revoke insert, update, delete on public.ride_groups, public.ride_members from authenticated;
grant select, insert, update, delete on public.trips to authenticated;
grant select on public.ride_groups, public.ride_members, public.ride_updates to authenticated;
grant update (proposed_departure_time, waiting_deadline, status) on public.ride_groups to authenticated;
grant update (pickup_status, delay_minutes, confirmed, updated_at) on public.ride_members to authenticated;
grant insert (ride_group_id, trip_id, message, kind) on public.ride_updates to authenticated;

revoke all on function public.find_candidate_trips(text, timestamptz, timestamptz) from public, anon;
revoke all on function public.create_ride_group(uuid, uuid[], text, timestamptz, timestamptz, text, jsonb, text, numeric, jsonb) from public, anon;
grant execute on function public.find_candidate_trips(text, timestamptz, timestamptz) to authenticated;
grant execute on function public.create_ride_group(uuid, uuid[], text, timestamptz, timestamptz, text, jsonb, text, numeric, jsonb) to authenticated;

-- ─────────────────────────── Realtime ───────────────────────────
-- Realtime respects the RLS policies above.
do $$
begin
  begin alter publication supabase_realtime add table public.ride_members; exception when others then null; end;
  begin alter publication supabase_realtime add table public.ride_groups;  exception when others then null; end;
  begin alter publication supabase_realtime add table public.ride_updates; exception when others then null; end;
end $$;
