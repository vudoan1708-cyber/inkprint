'use client';

import { useEffect, useState } from 'react';

const MARKER_ATTRIBUTE = 'inkwellInstalled';
const READY_EVENT = 'inkwell:ready';

export function useIsInkwellInstalled(): boolean {
  const [installed, setInstalled] = useState<boolean>(false);

  useEffect(() => {
    let cancelled = false;
    const check = (): void => {
      if (cancelled) return;
      if (document.documentElement.dataset[MARKER_ATTRIBUTE] === '1') setInstalled(true);
    };

    queueMicrotask(check);
    const onReady = (): void => check();
    window.addEventListener(READY_EVENT, onReady);

    return () => {
      cancelled = true;
      window.removeEventListener(READY_EVENT, onReady);
    };
  }, []);

  return installed;
}
