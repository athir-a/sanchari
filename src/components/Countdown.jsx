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
    <section role="alert" className="reminder" aria-labelledby="reminder-title">
      <span className="icon-box accent"><BellRing size={22} aria-hidden /></span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p className="eyebrow" style={{ marginBottom: '0.3rem' }}>Reminder</p>
        <h3 id="reminder-title">Waiting window ends in <span className="tabnum">{fmtCountdown(remaining)}</span></h3>
        <p>Your shared ride’s waiting window ends at {fmtTime(deadline)}. Check everyone’s status before leaving.</p>
        <span className="vib">
          {vibrated ? <Vibrate size={15} aria-hidden /> : <VibrateOff size={15} aria-hidden />}
          {vibrated
            ? 'Your phone vibrated once.'
            : reminder.vibration === 'blocked'
              ? 'This browser blocked vibration — this banner is your reminder.'
              : 'Vibration isn’t supported here — this banner is your reminder.'}
        </span>
      </div>
      <button onClick={onDismiss} className="icon-button" aria-label="Dismiss reminder">
        <X size={18} />
      </button>
    </section>
  );
}
