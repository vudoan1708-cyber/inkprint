import { cn } from '@/lib/cn';

type Props = {
  value: number;
  max: number;
  label?: string;
  valueText?: string;
  className?: string;
};

export function ProgressBar({ value, max, label, valueText, className }: Props) {
  const percent = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {(label || valueText) && (
        <div className="flex items-baseline justify-between text-sm">
          {label ? <span className="text-surface-700 dark:text-surface-200">{label}</span> : <span />}
          {valueText ? <span className="font-mono text-surface-500">{valueText}</span> : null}
        </div>
      )}
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-label={label}
        className="h-2 w-full overflow-hidden rounded-full bg-surface-200 dark:bg-surface-800"
      >
        <div
          className="h-full bg-brand-900 transition-[width] duration-300 dark:bg-brand-100"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
