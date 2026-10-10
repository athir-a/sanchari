/**
 * Vibrate once if the browser supports it. Returns what actually happened so
 * the UI never claims a vibration that didn't occur.
 *  'vibrated'    – navigator.vibrate accepted the pattern
 *  'blocked'     – API exists but the browser refused (no user gesture, setting off, iOS…)
 *  'unsupported' – no Vibration API
 */
export function vibrateOnce(pattern = [220, 120, 220]) {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return 'unsupported';
  try {
    return navigator.vibrate(pattern) ? 'vibrated' : 'blocked';
  } catch {
    return 'blocked';
  }
}
