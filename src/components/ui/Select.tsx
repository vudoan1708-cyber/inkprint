'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  FloatingFocusManager,
  FloatingPortal,
  autoUpdate,
  flip,
  offset,
  shift,
  size,
  useClick,
  useDismiss,
  useFloating,
  useInteractions,
  useListNavigation,
  useRole,
  useTypeahead,
} from '@floating-ui/react';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/cn';

export type SelectOption<T extends string> = {
  value: T;
  label: string;
  // Rendered to the right of the label in both trigger (when selected) and option rows.
  badge?: ReactNode;
};

type Props<T extends string> = {
  options: readonly SelectOption<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
  // Small unobtrusive dot on the trigger when a non-current option has a badge.
  showOtherIndicator?: boolean;
  className?: string;
};

export function Select<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  showOtherIndicator = false,
  className,
}: Props<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [referenceEl, setReferenceEl] = useState<HTMLButtonElement | null>(null);
  const [floatingEl, setFloatingEl] = useState<HTMLUListElement | null>(null);
  const listRef = useRef<Array<HTMLLIElement | null>>([]);
  const labelsRef = useRef<Array<string>>(options.map((o) => o.label));
  useEffect(() => {
    labelsRef.current = options.map((o) => o.label);
  }, [options]);

  const current = options.find((o) => o.value === value);
  const othersHaveBadge =
    showOtherIndicator && options.some((o) => o.value !== value && o.badge != null);
  const selectedIndex = options.findIndex((o) => o.value === value);

  const { floatingStyles, context } = useFloating({
    open: isOpen,
    onOpenChange: setIsOpen,
    placement: 'bottom-start',
    elements: { reference: referenceEl, floating: floatingEl },
    whileElementsMounted: autoUpdate,
    middleware: [
      offset(8),
      flip({ padding: 8 }),
      shift({ padding: 8 }),
      size({
        apply({ rects, elements, availableHeight }) {
          Object.assign(elements.floating.style, {
            minWidth: `${rects.reference.width}px`,
            maxHeight: `${Math.min(availableHeight - 8, 400)}px`,
          });
        },
        padding: 8,
      }),
    ],
  });

  const click = useClick(context);
  const dismiss = useDismiss(context, { outsidePressEvent: 'click' });
  const role = useRole(context, { role: 'listbox' });
  const listNav = useListNavigation(context, {
    listRef,
    activeIndex,
    selectedIndex,
    onNavigate: setActiveIndex,
    loop: true,
  });
  const typeahead = useTypeahead(context, {
    listRef: labelsRef,
    activeIndex,
    selectedIndex,
    onMatch: setActiveIndex,
    onTypingChange() {},
  });

  const { getReferenceProps, getFloatingProps, getItemProps } = useInteractions([
    click,
    dismiss,
    role,
    listNav,
    typeahead,
  ]);

  const handleSelect = (next: T): void => {
    onChange(next);
    setIsOpen(false);
  };

  return (
    <div className={cn('relative inline-block', className)}>
      <button
        ref={setReferenceEl}
        type="button"
        aria-label={ariaLabel}
        className={cn(
          'inline-flex h-11 min-w-44 items-center justify-between gap-3 rounded-full px-4 text-sm font-medium',
          'border border-surface-200 bg-surface-50 text-surface-700',
          'hover:bg-surface-100',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-700',
          'dark:border-surface-700 dark:bg-surface-800 dark:text-surface-200 dark:hover:bg-surface-700',
          'dark:focus-visible:ring-brand-300',
        )}
        {...getReferenceProps()}
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate">{current?.label ?? ''}</span>
          {current?.badge}
        </span>
        <span className="flex shrink-0 items-center gap-2">
          {othersHaveBadge ? (
            <span
              aria-label="Other options have updates"
              className="size-2 rounded-full bg-amber-400"
            />
          ) : null}
          <ChevronDown
            className={cn('size-4 transition-transform', isOpen && 'rotate-180')}
            aria-hidden
          />
        </span>
      </button>
      {isOpen ? (
        <FloatingPortal>
          <FloatingFocusManager context={context} modal={false}>
            <ul
              ref={setFloatingEl}
              style={floatingStyles}
              className={cn(
                'z-50 overflow-y-auto rounded-2xl border py-1 shadow-xl backdrop-blur-md',
                'border-surface-200 bg-surface-50/95 text-surface-700',
                'dark:border-surface-700 dark:bg-surface-900/95 dark:text-surface-200',
              )}
              {...getFloatingProps()}
            >
              {options.map((option, index) => {
                const isSelected = option.value === value;
                const isActive = activeIndex === index;
                return (
                  <li
                    key={option.value}
                    ref={(el) => {
                      listRef.current[index] = el;
                    }}
                    role="option"
                    aria-selected={isSelected}
                    tabIndex={isActive ? 0 : -1}
                    className={cn(
                      'flex cursor-pointer items-center justify-between gap-3 px-3 py-2.5 text-sm outline-none',
                      isActive && 'bg-surface-100 dark:bg-surface-800',
                      isSelected && 'font-semibold text-surface-900 dark:text-surface-50',
                    )}
                    {...getItemProps({
                      onClick: () => handleSelect(option.value),
                      onKeyDown: (event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          handleSelect(option.value);
                        }
                      },
                    })}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      {isSelected ? (
                        <Check
                          className="size-4 shrink-0 text-brand-700 dark:text-brand-300"
                          aria-hidden
                        />
                      ) : (
                        <span aria-hidden className="size-4 shrink-0" />
                      )}
                      <span className="truncate">{option.label}</span>
                    </span>
                    {option.badge}
                  </li>
                );
              })}
            </ul>
          </FloatingFocusManager>
        </FloatingPortal>
      ) : null}
    </div>
  );
}
