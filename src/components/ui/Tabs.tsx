'use client';

import type { ReactNode } from 'react';
import { Button, type ButtonSize } from './Button';
import { cn } from '@/lib/cn';

export type TabOption<T extends string> = {
  value: T;
  label: ReactNode;
  disabled?: boolean;
};

export type TabsProps<T extends string> = {
  options: readonly TabOption<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
  size?: ButtonSize;
  className?: string;
};

export function Tabs<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  size = 'sm',
  className,
}: TabsProps<T>) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn(
        'inline-flex gap-1 rounded-full border border-surface-200 p-0.5 dark:border-surface-700',
        className,
      )}
    >
      {options.map((option) => (
        <Button
          key={option.value}
          variant="secondary"
          size={size}
          isActive={value === option.value}
          aria-pressed={value === option.value}
          disabled={option.disabled}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </Button>
      ))}
    </div>
  );
}
