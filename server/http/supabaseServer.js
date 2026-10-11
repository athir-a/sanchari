import { createClient } from '@supabase/supabase-js';

const url = () => (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim().replace(/\/+$/, '').replace(/\/(rest|auth)\/v1$/, '');
const anon = () => process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';

export const supabaseConfigured = () => Boolean(url() && anon());
export const serviceRoleConfigured = () => Boolean(url() && process.env.SUPABASE_SERVICE_ROLE_KEY);

/** Client that acts as the signed-in user, so Row Level Security applies. */
export function userClient(accessToken) {
  return createClient(url(), anon(), {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

/** Privileged client for server-owned columns (flight verification). Server-side only. */
export function serviceClient() {
  return createClient(url(), process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
}
