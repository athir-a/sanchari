// Safe localStorage wrapper. Storage can be unavailable (private mode, blocked
// site data) — the app keeps working in memory in that case.
const PREFIX = 'sanchari:v1:';
const memory = new Map();

export function readJSON(key, fallback) {
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    return raw == null ? (memory.has(key) ? memory.get(key) : fallback) : JSON.parse(raw);
  } catch {
    return memory.has(key) ? memory.get(key) : fallback;
  }
}

export function writeJSON(key, value) {
  memory.set(key, value);
  try {
    window.localStorage.setItem(PREFIX + key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function removeKey(key) {
  memory.delete(key);
  try {
    window.localStorage.removeItem(PREFIX + key);
  } catch {
    /* ignore */
  }
}

export const storageKey = (key) => PREFIX + key;

export function uuid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}
