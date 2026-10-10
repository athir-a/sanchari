import { useEffect, useState } from 'react';
import { BellRing, X, Vibrate, VibrateOff } from 'lucide-react';
import { fmtCountdown, fmtTime } from '../utils/timeFormatting.js';
import { readJSON, writeJSON } from '../services/storage.js';
import { vibrateOnce } from '../utils/notifications.js';
import { RIDE_CONFIG } from '../data/config.js';

/** Re-render every `ms`; the countdown is always derived from a stored timestamp. */
export function useNow(ms = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    const onVis = () => setNow(Date.now());
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [ms]);
  return now;
}

/**
 * Fires once per deadline when ≤ 2 minutes remain. The record is stored per
 * ride, so reloading the page doesn't vibrate again for the same deadline,
 * while extending the deadline arms a fresh reminder.
 */
export function useDeadlineReminder(ride, now, active) {
  const key = ride ? `reminder:${ride.id}` : null;
  const deadline = ride?.waitingDeadline;
  const remaining = deadline ? new Date(deadline).getTime() - now : Infinity;
  const inWindow = remaining > 0 && remaining <= RIDE_CONFIG.reminderLeadSeconds * 1000;
  const [record, setRecord] = useState(() => (key ? readJSON(key, null) : null));

  useEffect(() => {
    setRecord(key ? readJSON(key, null) : null);
  }, [key]);

  useEffect(() => {
    if (!key || !active || !inWindow) return;
    const existing = readJSON(key, null);
    if (existing?.deadline === deadline) return; // already reminded for this deadline
    const rec = { deadline, at: new Date().toISOString(), vibration: vibrateOnce(), dismissed: false };
    writeJSON(key, rec);
    setRecord(rec);
  }, [key, deadline, inWindow, active]);

  const current = record && record.deadline === deadline && remaining > 0 ? record : null;
  const dismiss = () => {
    if (!current) return;
    const rec = { ...current, dismissed: true };
    writeJSON(key, rec);
    setRecord(rec);
  };
  return { reminder: current && !current.dismissed ? current : null, remaining, dismiss };
}

export function ReminderBanner({ reminder, remaining, deadline, onDismiss }) {
  const vibrated = reminder.vibration === 'vibrated';
  return (
    <section role="alert" className="rise pulse-ring fixed inset-x-0 top-[84px] z-30 mx-auto w-[calc(100%-32px)] max-w-[448px] rounded-3xl border border-amber/30 bg-amber-soft p-4 text-ink shadow-xl">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-amber text-white">
          <BellRing className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-bold">Waiting window ends in {fmtCountdown(remaining)}</p>
          <p className="mt-0.5 text-[14px] text-ink-2">
            Your shared ride’s waiting window ends at {fmtTime(deadline)}. Check everyone’s status before leaving.
          </p>
          <p className="mt-2 inline-flex items-center gap-1.5 text-[12px] font-semibold text-amber">
            {vibrated ? <Vibrate className="size-3.5" aria-hidden /> : <VibrateOff className="size-3.5" aria-hidden />}
            {vibrated
              ? 'Phone vibrated once.'
              : reminder.vibration === 'blocked'
                ? 'This browser blocked vibration — this banner is your reminder.'
                : 'Vibration isn’t supported here — this banner is your reminder.'}
          </p>
        </div>
        <button onClick={onDismiss} className="grid size-9 shrink-0 place-items-center rounded-full hover:bg-ink/5" aria-label="Dismiss reminder">
          <X className="size-4" />
        </button>
      </div>
    </section>
  );
}
