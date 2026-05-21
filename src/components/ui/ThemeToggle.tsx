'use client';

import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { Button } from './Button';

const ORDER = ['system', 'light', 'dark'] as const;
type Mode = (typeof ORDER)[number];

const LABELS: Record<Mode, string> = {
  system: 'Auto',
  light: 'Light',
  dark: 'Dark',
};

function nextMode(current: Mode): Mode {
  const index = ORDER.indexOf(current);
  const safe = index === -1 ? 0 : index;
  return ORDER[(safe + 1) % ORDER.length]!;
}

function isMode(value: string | undefined): value is Mode {
  return value === 'system' || value === 'light' || value === 'dark';
}

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    queueMicrotask(() => setMounted(true));
  }, []);

  const current: Mode = mounted && isMode(theme) ? theme : 'system';
  const label = mounted ? `Theme: ${LABELS[current]}` : 'Theme';

  return (
    <Button
      variant="secondary"
      size="sm"
      onClick={() => setTheme(nextMode(current))}
      aria-label={`${label}. Tap to change.`}
    >
      {label}
    </Button>
  );
}
