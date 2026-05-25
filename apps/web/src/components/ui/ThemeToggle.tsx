'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from '@/components/providers/ThemeProvider';
import { cn } from '@inkprint/ui';

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    queueMicrotask(() => setMounted(true));
  }, []);

  const lightActive = mounted && resolvedTheme === 'light';
  const darkActive = mounted && resolvedTheme === 'dark';

  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className="inline-flex items-center gap-0.5 rounded-full border border-surface-200 bg-surface-50 p-0.5 dark:border-surface-700 dark:bg-surface-900"
    >
      <ThemeOption label="Light theme" active={lightActive} onClick={() => setTheme('light')}>
        <Sun className="size-4" aria-hidden />
      </ThemeOption>
      <ThemeOption label="Dark theme" active={darkActive} onClick={() => setTheme('dark')}>
        <Moon className="size-4" aria-hidden />
      </ThemeOption>
    </div>
  );
}

type ThemeOptionProps = {
  label: string;
  active: boolean;
  onClick: () => void;
  children: ReactNode;
};

function ThemeOption({ label, active, onClick, children }: ThemeOptionProps) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      aria-label={label}
      onClick={onClick}
      className={cn(
        'flex h-7 w-7 items-center justify-center rounded-full transition-colors',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-700 dark:focus-visible:ring-brand-300',
        active
          ? 'bg-surface-900 text-surface-50 dark:bg-surface-50 dark:text-surface-900'
          : 'text-surface-400 hover:text-surface-700 dark:text-surface-500 dark:hover:text-surface-200',
      )}
    >
      {children}
    </button>
  );
}
