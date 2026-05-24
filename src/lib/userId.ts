'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/useAuth';

export const ANON_USER_ID_STORAGE_KEY = 'inkprint:user-id';
const STORAGE_KEY = ANON_USER_ID_STORAGE_KEY;

export function clearAnonUserId(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.error('[clearAnonUserId] failed to remove anon user id', error);
  }
}

export type UserIdResult =
  | { userId: string; error: null }
  | { userId: null; error: string | null };

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

// LAN-IP dev (http://192.168.x.x) isn't a secure context, so crypto.randomUUID is undefined on mobile.
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

function readExistingUserId(): UserIdResult {
  try {
    const existing = window.localStorage.getItem(STORAGE_KEY);
    if (existing && isUuid(existing)) return { userId: existing, error: null };
    return { userId: null, error: null };
  } catch (error) {
    const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    console.error('[useUserId] failed to read user id', error);
    return { userId: null, error: message };
  }
}

function readOrMintUserId(): UserIdResult {
  const existing = readExistingUserId();
  if (existing.userId || existing.error) return existing;
  try {
    const fresh = generateUuid();
    window.localStorage.setItem(STORAGE_KEY, fresh);
    return { userId: fresh, error: null };
  } catch (error) {
    const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    console.error('[useUserId] failed to mint user id', error);
    return { userId: null, error: message };
  }
}

const INITIAL_RESULT: UserIdResult = { userId: null, error: null };

// While signed-in we read an existing anon UUID but never mint; minting is only
// for anonymous sessions, so post-merge sign-out gets a fresh identity.
export function useUserId(): UserIdResult {
  const auth = useAuth();
  const [result, setResult] = useState<UserIdResult>(INITIAL_RESULT);
  useEffect(() => {
    if (auth.status === 'loading') return;
    queueMicrotask(() => {
      setResult(auth.status === 'signed-in' ? readExistingUserId() : readOrMintUserId());
    });
  }, [auth.status]);
  return result;
}
