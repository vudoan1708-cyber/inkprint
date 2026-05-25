'use client';

import { useTheme } from '@/components/providers/ThemeProvider';
import { Toaster as SonnerToaster } from 'sonner';

// Theme-bridged sonner. Re-exports below let callers do
// `import { toast } from '@/components/ui/Toaster'` instead of pulling sonner
// directly, so style overrides stay funnelled through one place.
export function Toaster() {
  const { resolvedTheme } = useTheme();
  return (
    <SonnerToaster
      theme={resolvedTheme}
      position="bottom-center"
      visibleToasts={4}
      gap={8}
      offset={16}
      style={{ zIndex: 40 }}
      toastOptions={{
        unstyled: false,
        className:
          'rounded-2xl border shadow-lg backdrop-blur-md ' +
          'bg-surface-50/95 border-surface-200 text-surface-900 ' +
          'dark:bg-surface-900/95 dark:border-surface-700 dark:text-surface-50',
        classNames: {
          title: 'text-sm font-semibold',
          description: 'text-xs opacity-80',
          actionButton:
            'rounded-full bg-brand-700 text-surface-50 px-3 h-9 text-sm font-medium ' +
            'hover:bg-brand-900 dark:bg-brand-300 dark:text-brand-900 dark:hover:bg-brand-100',
          cancelButton:
            'rounded-full bg-transparent text-surface-600 px-3 h-9 text-sm ' +
            'hover:text-surface-900 dark:text-surface-300 dark:hover:text-surface-50',
        },
      }}
    />
  );
}

export { toast } from 'sonner';
