'use client';

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from './cn';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export type ButtonProps = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  isActive?: boolean;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
  fullWidth?: boolean;
  children: ReactNode;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'>;

const baseStyles =
  'inline-flex items-center justify-center gap-2 rounded-full font-medium transition-colors select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand-700 dark:focus-visible:ring-brand-300 disabled:cursor-not-allowed disabled:opacity-50';

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    'bg-brand-900 text-surface-50 hover:bg-brand-700 dark:bg-brand-100 dark:text-brand-900 dark:hover:bg-brand-200',
  secondary:
    'border border-surface-200 bg-surface-50 text-surface-700 hover:bg-surface-100 dark:border-surface-700 dark:bg-surface-800 dark:text-surface-200 dark:hover:bg-surface-700',
  ghost:
    'text-surface-700 hover:bg-surface-100 dark:text-surface-200 dark:hover:bg-surface-800',
  danger: 'bg-danger-600 text-surface-50 hover:bg-danger-700',
};

const activeVariantStyles: Partial<Record<ButtonVariant, string>> = {
  secondary:
    'border-brand-900 bg-brand-900 text-surface-50 hover:bg-brand-900 dark:border-brand-100 dark:bg-brand-100 dark:text-brand-900 dark:hover:bg-brand-100',
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: 'h-9 min-w-9 px-3 text-sm',
  md: 'h-11 min-w-11 px-4 text-sm',
  lg: 'h-12 min-w-12 px-6 text-base',
};

function resolveVariantClasses(variant: ButtonVariant, isActive: boolean): string {
  if (isActive && activeVariantStyles[variant]) return activeVariantStyles[variant]!;
  return variantStyles[variant];
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    isLoading = false,
    isActive = false,
    leadingIcon,
    trailingIcon,
    fullWidth = false,
    children,
    disabled,
    ...rest
  },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cn(
        baseStyles,
        resolveVariantClasses(variant, isActive),
        sizeStyles[size],
        fullWidth && 'w-full',
      )}
      disabled={disabled || isLoading}
      aria-busy={isLoading || undefined}
      {...rest}
    >
      {isLoading ? <Spinner /> : leadingIcon}
      <span>{children}</span>
      {!isLoading && trailingIcon}
    </button>
  );
});

function Spinner() {
  return (
    <span
      aria-hidden
      className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent"
    />
  );
}
