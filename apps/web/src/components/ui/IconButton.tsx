'use client';

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@inkprint/ui';

export type IconButtonProps = {
  label: string;
  variant?: 'ghost' | 'secondary';
  size?: 'md' | 'lg';
  children: ReactNode;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className' | 'aria-label'>;

const variantStyles = {
  ghost: 'text-surface-500 hover:bg-surface-100 dark:hover:bg-surface-800',
  secondary:
    'border border-surface-200 bg-surface-50 text-surface-700 hover:bg-surface-100 dark:border-surface-700 dark:bg-surface-800 dark:text-surface-200 dark:hover:bg-surface-700',
} as const;

const sizeStyles = {
  md: 'h-11 w-11',
  lg: 'h-12 w-12',
} as const;

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, variant = 'ghost', size = 'md', children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      className={cn(
        'inline-flex items-center justify-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-700 dark:focus-visible:ring-brand-300 disabled:cursor-not-allowed disabled:opacity-50',
        variantStyles[variant],
        sizeStyles[size],
      )}
      {...rest}
    >
      {children}
    </button>
  );
});
