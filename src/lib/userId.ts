'use client';

import { useEffect, useState } from 'react';

const STORAGE_KEY = 'inkprint:user-id';

export type UserIdResult =
  | { userId: string; error: null }
  | { userId: null; error: string | null };

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

// crypto.randomUUID requires a secure context (HTTPS / localhost). LAN-IP dev
// (http://192.168.x.x) is not secure on mobile, so fall back to getRandomValues.
function generateUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function readOrMintUserId(): UserIdResult {
  try {
    const existing = window.localStorage.getItem(STORAGE_KEY);
    if (existing && isUuid(existing)) return { userId: existing, error: null };
    const fresh = generateUuid();
    window.localStorage.setItem(STORAGE_KEY, fresh);
    return { userId: fresh, error: null };
  } catch (error) {
    const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    console.error('[useUserId] failed to read/mint user id', error);
    return { userId: null, error: message };
  }
}

const INITIAL_RESULT: UserIdResult = { userId: null, error: null };

export function useUserId(): UserIdResult {
  const [result, setResult] = useState<UserIdResult>(INITIAL_RESULT);
  useEffect(() => {
    // Microtask defer keeps React 19 from flagging the one-time mount-init
    // setState as a cascading render. SSR uses INITIAL_RESULT; the real value
    // is minted on the client after hydration.
    queueMicrotask(() => {
      setResult(readOrMintUserId());
    });
  }, []);
  return result;
}
