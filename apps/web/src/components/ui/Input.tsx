'use client';

import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@inkprint/ui';

export type InputProps = {
  label: string;
  description?: ReactNode;
  errorMessage?: string;
  leadingAddon?: ReactNode;
  trailingAddon?: ReactNode;
  fullWidth?: boolean;
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'className'>;

function resolveBorderClasses(hasError: boolean): string {
  if (hasError) return 'border-danger-500 focus-within:border-danger-600';
  return 'border-surface-200 dark:border-surface-700';
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, description, errorMessage, leadingAddon, trailingAddon, fullWidth = true, id, ...rest },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const describedById = description ? `${inputId}-desc` : undefined;
  const errorId = errorMessage ? `${inputId}-error` : undefined;

  return (
    <div className={cn('flex flex-col gap-1', fullWidth && 'w-full')}>
      <label htmlFor={inputId} className="text-sm font-medium text-surface-700 dark:text-surface-200">
        {label}
      </label>
      {description ? (
        <p id={describedById} className="text-xs text-surface-500">
          {description}
        </p>
      ) : null}
      <div
        className={cn(
          'flex items-center gap-2 rounded-full border bg-surface-50 px-4 transition-colors focus-within:border-brand-700 dark:bg-surface-900 dark:focus-within:border-brand-300',
          resolveBorderClasses(Boolean(errorMessage)),
        )}
      >
        {leadingAddon ? <span className="text-surface-400">{leadingAddon}</span> : null}
        <input
          ref={ref}
          id={inputId}
          aria-describedby={[describedById, errorId].filter(Boolean).join(' ') || undefined}
          aria-invalid={errorMessage ? true : undefined}
          className="h-11 w-full bg-transparent text-sm text-surface-900 placeholder:text-surface-400 focus:outline-none dark:text-surface-50"
          {...rest}
        />
        {trailingAddon ? <span className="text-surface-400">{trailingAddon}</span> : null}
      </div>
      {errorMessage ? (
        <p id={errorId} role="alert" className="text-xs text-danger-600">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
});
