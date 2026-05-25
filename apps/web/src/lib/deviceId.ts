'use client';

import { generateUuid, isUuid } from '@/lib/uuid';

const STORAGE_KEY = 'inkprint:device-id';

// Stable per-browser identifier for active-device tracking. Survives reloads
// and sign-out/sign-in cycles; only resets on localStorage wipe.
export function getOrCreateDeviceId(): string {
  try {
    const existing = window.localStorage.getItem(STORAGE_KEY);
    if (existing && isUuid(existing)) return existing;
    const fresh = generateUuid();
    window.localStorage.setItem(STORAGE_KEY, fresh);
    return fresh;
  } catch (error) {
    console.error('[getOrCreateDeviceId] failed', error);
    // Fall back to an in-memory id so the app still functions; the device
    // will appear "new" on every reload but won't crash.
    return generateUuid();
  }
}
