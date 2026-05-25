'use client';

import { forwardRef, useEffect, useRef, useState, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from './cn';

export type SliderProps = {
  label?: ReactNode;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (next: number) => void;
  valueSuffix?: string;
  fullWidth?: boolean;
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'className' | 'onChange' | 'value' | 'type'>;

// Track uses `background` shorthand because the value is a linear-gradient.
const trackStyles =
  '[&::-webkit-slider-runnable-track]:h-2 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:[background:var(--inkprint-slider-bg)] [&::-moz-range-track]:h-2 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:[background:var(--inkprint-slider-bg)]';

const thumbStyles =
  '[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:-mt-[4px] [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-brand-900 [&::-webkit-slider-thumb]:shadow-sm [&::-webkit-slider-thumb]:transition-transform hover:[&::-webkit-slider-thumb]:scale-110 dark:[&::-webkit-slider-thumb]:bg-brand-100 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-brand-900 dark:[&::-moz-range-thumb]:bg-brand-100';

export const Slider = forwardRef<HTMLInputElement, SliderProps>(function Slider(
  {
    label,
    value,
    min = 0,
    max = 100,
    step = 1,
    onChange,
    valueSuffix,
    fullWidth = true,
    id,
    ...rest
  },
  ref,
) {
  const percent = ((value - min) / (max - min)) * 100;
  const trackBg = `linear-gradient(to right, var(--inkprint-slider-fill) 0%, var(--inkprint-slider-fill) ${percent}%, var(--inkprint-slider-rail) ${percent}%, var(--inkprint-slider-rail) 100%)`;

  return (
    <label
      htmlFor={id}
      className={cn('flex flex-col gap-1.5', fullWidth ? 'w-full' : undefined)}
    >
      <span className="flex items-baseline justify-between text-xs text-surface-600 dark:text-surface-300">
        <span>{label}</span>
        <EditableValue
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={onChange}
          suffix={valueSuffix}
        />
      </span>
      <input
        ref={ref}
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.currentTarget.value))}
        style={
          {
            '--inkprint-slider-bg': trackBg,
            '--inkprint-slider-fill': 'var(--color-brand-700)',
            '--inkprint-slider-rail': 'var(--color-surface-200)',
          } as React.CSSProperties
        }
        className={cn(
          'h-4 w-full appearance-none bg-transparent outline-none focus-visible:[&::-webkit-slider-thumb]:ring-2 focus-visible:[&::-webkit-slider-thumb]:ring-brand-700 focus-visible:[&::-webkit-slider-thumb]:ring-offset-2 dark:[--inkprint-slider-rail:var(--color-surface-700)] dark:[--inkprint-slider-fill:var(--color-brand-300)]',
          trackStyles,
          thumbStyles,
        )}
        {...rest}
      />
    </label>
  );
});

function EditableValue({
  value,
  min,
  max,
  step,
  onChange,
  suffix,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (next: number) => void;
  suffix?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<string>(String(value));

  // Keep draft in sync with external value unless user is actively editing.
  useEffect(() => {
    if (document.activeElement !== inputRef.current) setDraft(String(value));
  }, [value]);

  const commit = (raw: string): void => {
    const n = Number(raw);
    if (!Number.isFinite(n)) {
      setDraft(String(value));
      return;
    }
    const clamped = Math.max(min, Math.min(max, n));
    onChange(clamped);
    setDraft(String(clamped));
  };

  return (
    <span className="inline-flex items-center gap-0.5 rounded-md border border-surface-300 bg-surface-50 px-1.5 py-0.5 font-mono text-xs tabular-nums text-surface-900 transition-colors focus-within:border-brand-700 focus-within:ring-2 focus-within:ring-brand-700/30 hover:border-surface-400 dark:border-surface-600 dark:bg-surface-800 dark:text-surface-50 dark:focus-within:border-brand-300 dark:focus-within:ring-brand-300/30 dark:hover:border-surface-500">
      <input
        ref={inputRef}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        step={step}
        value={draft}
        onChange={(e) => {
          const raw = e.currentTarget.value;
          setDraft(raw);
          const n = Number(raw);
          if (Number.isFinite(n) && n >= min && n <= max) onChange(n);
        }}
        onBlur={(e) => commit(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            commit(e.currentTarget.value);
            e.currentTarget.blur();
          }
        }}
        onClick={(e) => e.stopPropagation()}
        className="w-9 bg-transparent text-right outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield]"
      />
      {suffix ? <span className="text-surface-500 dark:text-surface-400">{suffix}</span> : null}
    </span>
  );
}
