'use client';

import { GLYPH_BASELINE_RATIO, GLYPH_UPM, type Stroke } from '@/lib/strokeMath';
import {
  strokesEntryDirection,
  strokesEntryPoint,
  strokesExitDirection,
  strokesExitPoint,
  tightRightOffsetX,
} from '@/lib/ligature';

type Props = {
  glyphsByCodePoint: Map<number, string>;
  strokesByCodePoint: Map<number, Stroke[]>;
  sampleText?: string;
};

const PANGRAM = 'The quick brown fox jumps over the lazy dog.';

const BOX_PX = 40;
const DESCENDER_PX = BOX_PX * (1 - GLYPH_BASELINE_RATIO);
const BASELINE_Y = GLYPH_UPM * GLYPH_BASELINE_RATIO;
const STROKE_WIDTH = 28;
const KERN_GAP = 30;
const FLOW_BASELINE_BAND = 150;
const FLOW_MIN_GAP = 10;
const FLOW_TANGENT_REACH_MIN = 30;
const FLOW_TANGENT_REACH_MAX = 70;

const isLetter = (ch: string): boolean => /\p{L}/u.test(ch);
const upmToPx = (upm: number): number => (upm / GLYPH_UPM) * BOX_PX;
const r = (n: number): string => (Math.round(n * 100) / 100).toString();

type RunItem = {
  char: string;
  codePoint: number;
  svgPath: string;
  strokes: Stroke[];
};

type Token =
  | { kind: 'run'; items: RunItem[] }
  | { kind: 'space' }
  | { kind: 'glyph'; char: string; svgPath: string }
  | { kind: 'missing'; char: string };

function tokenize(
  text: string,
  glyphs: Map<number, string>,
  strokesMap: Map<number, Stroke[]>,
): Token[] {
  const tokens: Token[] = [];
  let run: RunItem[] = [];

  const flushRun = (): void => {
    if (run.length > 0) {
      tokens.push({ kind: 'run', items: run });
      run = [];
    }
  };

  for (const ch of text) {
    if (ch === ' ') {
      flushRun();
      tokens.push({ kind: 'space' });
      continue;
    }
    const codePoint = ch.codePointAt(0)!;
    const svgPath = glyphs.get(codePoint);
    if (!svgPath) {
      flushRun();
      tokens.push({ kind: 'missing', char: ch });
      continue;
    }
    const strokes = strokesMap.get(codePoint);
    if (isLetter(ch) && strokes && strokes.length > 0) {
      run.push({ char: ch, codePoint, svgPath, strokes });
      continue;
    }
    flushRun();
    tokens.push({ kind: 'glyph', char: ch, svgPath });
  }
  flushRun();
  return tokens;
}

export function FontPreview({
  glyphsByCodePoint,
  strokesByCodePoint,
  sampleText = PANGRAM,
}: Props) {
  if (glyphsByCodePoint.size === 0) {
    return (
      <p className="text-sm italic text-surface-500">
        Draw a few glyphs to see a live preview of your handwriting here.
      </p>
    );
  }

  const tokens = tokenize(sampleText, glyphsByCodePoint, strokesByCodePoint);
  const baselineOffset = { verticalAlign: `-${DESCENDER_PX}px` } as const;

  return (
    <div className="flex flex-wrap items-baseline gap-y-3 leading-none">
      {tokens.map((token, index) => {
        if (token.kind === 'space') {
          return <span key={index} className="inline-block w-3" aria-hidden />;
        }
        if (token.kind === 'missing') {
          return (
            <MissingGlyphBox key={index} char={token.char} baselineOffset={baselineOffset} />
          );
        }
        if (token.kind === 'glyph') {
          return <SingleGlyph key={index} svgPath={token.svgPath} baselineOffset={baselineOffset} />;
        }
        return <LetterRun key={index} items={token.items} baselineOffset={baselineOffset} />;
      })}
      <span className="sr-only">{sampleText}</span>
    </div>
  );
}

function LetterRun({
  items,
  baselineOffset,
}: {
  items: RunItem[];
  baselineOffset: React.CSSProperties;
}) {
  const positions: number[] = [0];
  for (let i = 1; i < items.length; i++) {
    const prev = items[i - 1]!;
    const cur = items[i]!;
    positions.push(positions[i - 1]! + tightRightOffsetX(prev.strokes, cur.strokes, KERN_GAP));
  }
  const totalWidthUpm = positions[positions.length - 1]! + GLYPH_UPM;

  const flowPaths: string[] = [];
  for (let i = 0; i < items.length - 1; i++) {
    const flow = computeFlowPath(items[i]!, items[i + 1]!, positions[i]!, positions[i + 1]!);
    if (flow) flowPaths.push(flow);
  }

  return (
    <span
      aria-hidden
      className="inline-block h-10 text-surface-900 dark:text-surface-50"
      style={{ ...baselineOffset, width: `${upmToPx(totalWidthUpm)}px` }}
    >
      <svg
        viewBox={`0 0 ${totalWidthUpm} ${GLYPH_UPM}`}
        preserveAspectRatio="xMidYMid meet"
        className="h-full w-full"
      >
        <g
          fill="none"
          stroke="currentColor"
          strokeWidth={STROKE_WIDTH}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {items.map((item, i) => (
            <g key={i} transform={`translate(${positions[i]} 0)`}>
              <path d={item.svgPath} />
            </g>
          ))}
          {flowPaths.map((d, i) => (
            <path key={`flow-${i}`} d={d} />
          ))}
        </g>
      </svg>
    </span>
  );
}

function SingleGlyph({
  svgPath,
  baselineOffset,
}: {
  svgPath: string;
  baselineOffset: React.CSSProperties;
}) {
  return (
    <span
      aria-hidden
      className="inline-block h-10 w-10 text-surface-900 dark:text-surface-50"
      style={baselineOffset}
    >
      <svg viewBox={`0 0 ${GLYPH_UPM} ${GLYPH_UPM}`} className="h-full w-full">
        <path
          d={svgPath}
          fill="none"
          stroke="currentColor"
          strokeWidth={STROKE_WIDTH}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

function MissingGlyphBox({
  char,
  baselineOffset,
}: {
  char: string;
  baselineOffset: React.CSSProperties;
}) {
  return (
    <span
      aria-hidden
      className="inline-block h-10 w-7 rounded-sm border border-dashed border-surface-300 text-surface-300 dark:border-surface-700 dark:text-surface-700"
      style={baselineOffset}
    >
      <svg viewBox={`0 0 ${GLYPH_UPM} ${GLYPH_UPM}`} className="h-full w-full">
        <text
          x={GLYPH_UPM / 2}
          y={BASELINE_Y}
          textAnchor="middle"
          dominantBaseline="alphabetic"
          fontSize={GLYPH_UPM * 0.45}
          fill="currentColor"
        >
          {char}
        </text>
      </svg>
    </span>
  );
}

function computeFlowPath(
  left: RunItem,
  right: RunItem,
  leftX: number,
  rightX: number,
): string | null {
  const exit = strokesExitPoint(left.strokes);
  const entryLocal = strokesEntryPoint(right.strokes);
  if (!exit || !entryLocal) return null;

  const exitGlobal = { x: exit.x + leftX, y: exit.y };
  const entryGlobal = { x: entryLocal.x + rightX, y: entryLocal.y };

  if (Math.abs(exitGlobal.y - BASELINE_Y) > FLOW_BASELINE_BAND) return null;
  if (Math.abs(entryGlobal.y - BASELINE_Y) > FLOW_BASELINE_BAND) return null;

  const gap = entryGlobal.x - exitGlobal.x;
  if (gap < FLOW_MIN_GAP) return null;

  const exitDir = strokesExitDirection(left.strokes);
  const entryDir = strokesEntryDirection(right.strokes);
  const reach = Math.max(FLOW_TANGENT_REACH_MIN, Math.min(gap * 0.25, FLOW_TANGENT_REACH_MAX));

  const c1 = {
    x: exitGlobal.x + exitDir.dx * reach,
    y: exitGlobal.y + exitDir.dy * reach,
  };
  const c2 = {
    x: entryGlobal.x - entryDir.dx * reach,
    y: entryGlobal.y - entryDir.dy * reach,
  };

  return `M${r(exitGlobal.x)} ${r(exitGlobal.y)}C${r(c1.x)} ${r(c1.y)},${r(c2.x)} ${r(c2.y)},${r(entryGlobal.x)} ${r(entryGlobal.y)}`;
}
