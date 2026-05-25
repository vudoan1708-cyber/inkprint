'use client';

import { useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';

export type AuthState =
  | { status: 'loading'; user: null }
  | { status: 'signed-out'; user: null }
  | { status: 'signed-in'; user: User };

const INITIAL: AuthState = { status: 'loading', user: null };

function stateFor(user: User | null): AuthState {
  return user ? { status: 'signed-in', user } : { status: 'signed-out', user: null };
}

export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>(INITIAL);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    let cancelled = false;

    // Microtask defer — same reason as useUserId. Avoids React 19 flagging
    // the one-time mount-init setState as a cascading render.
    queueMicrotask(async () => {
      const { data } = await supabase.auth.getUser();
      if (cancelled) return;
      setState(stateFor(data.user));
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setState(stateFor(session?.user ?? null));
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  return state;
}
