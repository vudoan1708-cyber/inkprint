import { GLYPH_UPM } from '@/lib/strokeMath';
import { cn } from '@/lib/cn';

type Props = {
  svgPath: string;
  className?: string;
  strokeWidth?: number;
};

export function GlyphThumbnail({ svgPath, className, strokeWidth = 28 }: Props) {
  return (
    <svg
      viewBox={`0 0 ${GLYPH_UPM} ${GLYPH_UPM}`}
      className={cn('h-full w-full', className)}
      aria-hidden
    >
      <path
        d={svgPath}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
