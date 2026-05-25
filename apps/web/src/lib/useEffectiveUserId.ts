'use client';

import { useAuth } from '@/lib/useAuth';
import { useUserId } from '@/lib/userId';

export type EffectiveUserIdState =
  | { status: 'loading'; userId: null; anonUserId: null; error: null }
  | { status: 'error'; userId: null; anonUserId: null; error: string }
  | { status: 'anonymous'; userId: string; anonUserId: null; error: null }
  | { status: 'signed-in'; userId: string; anonUserId: string | null; error: null };

// Auth user when signed in; local UUID when anonymous. anonUserId is the pre-auth UUID for the merge flow, or null if none.
export function useEffectiveUserId(): EffectiveUserIdState {
  const auth = useAuth();
  const local = useUserId();

  if (local.error) {
    return { status: 'error', userId: null, anonUserId: null, error: local.error };
  }
  if (auth.status === 'loading') {
    return { status: 'loading', userId: null, anonUserId: null, error: null };
  }
  if (auth.status === 'signed-in') {
    return {
      status: 'signed-in',
      userId: auth.user.id,
      anonUserId: local.userId,
      error: null,
    };
  }
  if (local.userId === null) {
    return { status: 'loading', userId: null, anonUserId: null, error: null };
  }
  return { status: 'anonymous', userId: local.userId, anonUserId: null, error: null };
}
