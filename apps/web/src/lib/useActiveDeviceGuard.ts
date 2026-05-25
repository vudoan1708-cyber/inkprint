'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { parseEnvelope, postEnvelope } from '@/lib/apiClient';
import { getOrCreateDeviceId } from '@/lib/deviceId';

type ActiveSessionData = { activeDeviceId: string; activeSince: string } | null;
type ClaimData = { activeDeviceId: string; activeSince: string };

export type ActiveGuardState =
  | { isActive: null; activeSince: null }
  | { isActive: true; activeSince: string }
  | { isActive: false; activeSince: string };

const DEBOUNCE_MS = 3000;
const INITIAL: ActiveGuardState = { isActive: null, activeSince: null };

export function useActiveDeviceGuard({ userId }: { userId: string | null }) {
  const [state, setState] = useState<ActiveGuardState>(INITIAL);
  const [claimVersion, setClaimVersion] = useState(0);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const lastCheckRef = useRef<number>(0);

  useEffect(() => {
    queueMicrotask(() => setDeviceId(getOrCreateDeviceId()));
  }, []);

  const check = useCallback(async (): Promise<void> => {
    if (!userId || !deviceId) return;
    const now = Date.now();
    if (now - lastCheckRef.current < DEBOUNCE_MS) return;
    lastCheckRef.current = now;

    try {
      const res = await fetch(`/api/sessions/active?userId=${encodeURIComponent(userId)}`);
      const data = await parseEnvelope<ActiveSessionData>(res);
      if (!data) {
        const claimed = await postEnvelope<ClaimData>('/api/sessions/claim', { userId, deviceId });
        setState({ isActive: true, activeSince: claimed.activeSince });
        return;
      }
      if (data.activeDeviceId === deviceId) {
        setState({ isActive: true, activeSince: data.activeSince });
      } else {
        setState({ isActive: false, activeSince: data.activeSince });
      }
    } catch (error) {
      // Fail open so a flaky network doesn't block drawing.
      console.error('[useActiveDeviceGuard] check failed', error);
      setState({ isActive: true, activeSince: new Date().toISOString() });
    }
  }, [userId, deviceId]);

  useEffect(() => {
    if (!userId || !deviceId) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      void check();
    });

    const onVisibility = (): void => {
      if (document.visibilityState === 'visible') void check();
    };
    const onFocus = (): void => void check();
    const onInteract = (): void => void check();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', onFocus);
    window.addEventListener('pointerdown', onInteract);
    window.addEventListener('keydown', onInteract);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('pointerdown', onInteract);
      window.removeEventListener('keydown', onInteract);
    };
  }, [userId, deviceId, check]);

  const claim = useCallback(async (): Promise<void> => {
    if (!userId || !deviceId) return;
    try {
      const claimed = await postEnvelope<ClaimData>('/api/sessions/claim', { userId, deviceId });
      lastCheckRef.current = Date.now();
      setState({ isActive: true, activeSince: claimed.activeSince });
      setClaimVersion((v) => v + 1);
    } catch (error) {
      console.error('[useActiveDeviceGuard] claim failed', error);
    }
  }, [userId, deviceId]);

  return { state, claim, claimVersion };
}
