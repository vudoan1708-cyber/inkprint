'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/useAuth';
import { generateUuid, isUuid } from '@/lib/uuid';

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
