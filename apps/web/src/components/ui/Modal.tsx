'use client';

import { useEffect, type ReactNode } from 'react';
import { cn } from '@inkprint/ui';

type ModalSize = 'sm' | 'md' | 'lg' | 'xl';

const SIZE_CLASS: Record<ModalSize, string> = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-3xl',
};

type Props = {
  isOpen: boolean;
  ariaLabelledBy?: string;
  ariaDescribedBy?: string;
  // Defaults to 'dialog'. Use 'alertdialog' for modals that must be resolved.
  role?: 'dialog' | 'alertdialog';
  size?: ModalSize;
  // When provided, Escape and overlay click dismiss. Omit to make the modal
  // non-dismissable — consumers must offer their own way out.
  onClose?: () => void;
  panelClassName?: string;
  children: ReactNode;
};

export function Modal({
  isOpen,
  ariaLabelledBy,
  ariaDescribedBy,
  role = 'dialog',
  size = 'md',
  onClose,
  panelClassName,
  children,
}: Props) {
  useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !onClose) return;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleOverlayClick = (event: React.MouseEvent<HTMLDivElement>): void => {
    if (!onClose) return;
    if (event.target === event.currentTarget) onClose();
  };

  return (
    <div
      role={role}
      aria-modal="true"
      aria-labelledby={ariaLabelledBy}
      aria-describedby={ariaDescribedBy}
      onClick={handleOverlayClick}
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto overscroll-contain bg-brand-900/60 p-4 backdrop-blur-sm"
    >
      <div
        className={cn(
          'flex max-h-[90vh] w-full flex-col gap-4 rounded-3xl bg-surface-50 p-6 shadow-2xl dark:bg-surface-900',
          SIZE_CLASS[size],
          panelClassName,
        )}
      >
        {children}
      </div>
    </div>
  );
}
