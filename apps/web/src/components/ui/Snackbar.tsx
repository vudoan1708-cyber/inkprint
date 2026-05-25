'use client';

import type { ReactNode } from 'react';
import { Button } from './Button';

export type SnackbarAction = {
  label: string;
  onClick: () => void;
  isLoading?: boolean;
  leadingIcon?: ReactNode;
};

type Props = {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: SnackbarAction;
};

// Two-row action banner: title (with optional icon) spans the full width,
// then description and the action share the second row. Designed to sit
// inside a sonner toast but works standalone too.
export function Snackbar({ icon, title, description, action }: Props) {
  return (
    <div className="flex w-full max-w-160 flex-col gap-3 rounded-2xl border border-surface-200 bg-surface-50/95 p-4 shadow-lg backdrop-blur-md dark:border-surface-700 dark:bg-surface-900/95">
      <div className="flex items-center gap-3">
        {icon ? <span className="shrink-0">{icon}</span> : null}
        <p className="text-sm font-semibold text-surface-900 dark:text-surface-50">{title}</p>
      </div>
      {description || action ? (
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1 text-surface-700 dark:text-surface-200">{description}</div>
          {action ? (
            <Button
              variant="primary"
              size="md"
              onClick={action.onClick}
              isLoading={action.isLoading}
              disabled={action.isLoading}
              leadingIcon={action.leadingIcon}
            >
              <span className="whitespace-nowrap">{action.label}</span>
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
