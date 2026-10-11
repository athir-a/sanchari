import { createClient } from '@supabase/supabase-js';

// Accept common copy-paste variants ("…supabase.co/", "…supabase.co/rest/v1/") — the client needs the bare project URL.
const url = (import.meta.env.VITE_SUPABASE_URL || '').trim().replace(/\/+$/, '').replace(/\/(rest|auth)\/v1$/, '');
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/** Live mode only when both public Supabase values are configured. */
export const IS_LIVE = Boolean(url && anonKey);

export const supabase = IS_LIVE
  ? createClient(url, anonKey, { auth: { persistSession: true, autoRefreshToken: true } })
  : null;

let sessionPromise = null;

/**
 * Live mode uses Supabase anonymous sign-in so every trip has an owner and
 * Row Level Security can protect it. Enable "Anonymous sign-ins" in the
 * Supabase dashboard (Authentication → Providers).
 */
export function ensureSession() {
  if (!IS_LIVE) return Promise.resolve(null);
  if (!sessionPromise) {
    sessionPromise = (async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) return data.session;
      const res = await supabase.auth.signInAnonymously();
      if (res.error) throw new Error(`Could not start a session: ${res.error.message}`);
      return res.data.session;
    })().catch((e) => {
      sessionPromise = null;
      throw e;
    });
  }
  return sessionPromise;
}
