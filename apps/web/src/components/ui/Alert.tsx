'use client';

import { type ReactNode } from 'react';
import { IconButton } from './IconButton';
import { cn } from '@inkprint/ui';

export type AlertVariant = 'error' | 'info' | 'success';

type Props = {
  variant: AlertVariant;
  title?: string;
  children: ReactNode;
  onDismiss?: () => void;
  className?: string;
};

const variantStyles: Record<AlertVariant, string> = {
  error:
    'border-danger-200 bg-danger-50 text-danger-700 dark:border-danger-700 dark:bg-danger-900/30 dark:text-danger-200',
  info: 'border-brand-200 bg-brand-50 text-brand-700 dark:border-brand-700 dark:bg-brand-900/30 dark:text-brand-200',
  success:
    'border-success-200 bg-success-50 text-success-700 dark:border-success-700 dark:bg-success-900/30 dark:text-success-200',
};

export function Alert({ variant, title, children, onDismiss, className }: Props) {
  return (
    <div
      role={variant === 'error' ? 'alert' : 'status'}
      className={cn(
        'flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm',
        variantStyles[variant],
        className,
      )}
    >
      <div className="flex-1">
        {title ? <p className="font-semibold">{title}</p> : null}
        <div className={cn(title && 'mt-0.5')}>{children}</div>
      </div>
      {onDismiss ? (
        <IconButton label="Dismiss" onClick={onDismiss}>
          <span aria-hidden className="text-xl leading-none">×</span>
        </IconButton>
      ) : null}
    </div>
  );
}
