'use client';

import { forwardRef, useId, type TextareaHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@inkprint/ui';

export type TextareaProps = {
  label: string;
  description?: ReactNode;
  errorMessage?: string;
  fullWidth?: boolean;
  hideLabel?: boolean;
} & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'className'>;

function resolveBorderClasses(hasError: boolean): string {
  if (hasError) return 'border-danger-500 focus-within:border-danger-600';
  return 'border-surface-200 dark:border-surface-700';
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, description, errorMessage, fullWidth = true, hideLabel = false, id, rows = 4, ...rest },
  ref,
) {
  const autoId = useId();
  const textareaId = id ?? autoId;
  const describedById = description ? `${textareaId}-desc` : undefined;
  const errorId = errorMessage ? `${textareaId}-error` : undefined;

  return (
    <div className={cn('flex flex-col gap-1', fullWidth && 'w-full')}>
      <label
        htmlFor={textareaId}
        className={cn(
          'text-sm font-medium text-surface-700 dark:text-surface-200',
          hideLabel && 'sr-only',
        )}
      >
        {label}
      </label>
      {description ? (
        <p id={describedById} className="text-xs text-surface-500">
          {description}
        </p>
      ) : null}
      <div
        className={cn(
          'rounded-2xl border bg-surface-50 px-4 py-3 transition-colors focus-within:border-brand-700 dark:bg-surface-900 dark:focus-within:border-brand-300',
          resolveBorderClasses(Boolean(errorMessage)),
        )}
      >
        <textarea
          ref={ref}
          id={textareaId}
          rows={rows}
          aria-describedby={[describedById, errorId].filter(Boolean).join(' ') || undefined}
          aria-invalid={errorMessage ? true : undefined}
          className="block w-full resize-y bg-transparent text-sm leading-relaxed text-surface-900 placeholder:text-surface-400 focus:outline-none dark:text-surface-50"
          {...rest}
        />
      </div>
      {errorMessage ? (
        <p id={errorId} role="alert" className="text-xs text-danger-600">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
});
