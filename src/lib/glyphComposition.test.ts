import { describe, it, expect } from 'vitest';
import {
  COMPOSABLE_TARGETS,
  COMPOSITION_RECIPES,
  composeAll,
  composeGlyph,
  strokesBoundingBox,
} from './glyphComposition';
import type { Stroke } from './strokeMath';

const point = (x: number, y: number, pressure = 0.7) => ({ x, y, pressure });

const baseO: Stroke[] = [
  [point(400, 500), point(380, 600), point(420, 720), point(580, 720), point(620, 600), point(600, 500), point(500, 480), point(400, 500)],
];

const baseI: Stroke[] = [
  [point(500, 450), point(500, 720)],     // stem
  [point(490, 380), point(510, 390)],     // tittle (small, above)
];

const baseU: Stroke[] = [
  [point(420, 480), point(420, 680), point(500, 730), point(580, 680), point(580, 480)],
];

const acute: Stroke[] = [[point(450, 400), point(520, 360)]];
const grave: Stroke[] = [[point(450, 360), point(520, 400)]];
const circumflex: Stroke[] = [[point(440, 400), point(500, 360), point(560, 400)]];
const tilde: Stroke[] = [[point(430, 400), point(470, 360), point(530, 400), point(570, 360)]];
const hookAbove: Stroke[] = [[point(490, 360), point(490, 410), point(520, 420)]];
const dotBelow: Stroke[] = [[point(495, 400), point(505, 400)]];
const horn: Stroke[] = [[point(480, 400), point(520, 380), point(540, 410)]];

const HOOK_CP = 0xe000;
const DOT_CP = 0xe001;
const HORN_CP = 0xe002;

function makeLookup(record: Record<number, Stroke[]>): (cp: number) => Stroke[] | null {
  return (cp) => record[cp] ?? null;
}

describe('strokesBoundingBox', () => {
  it('returns null when no strokes have points', () => {
    expect(strokesBoundingBox([])).toBeNull();
    expect(strokesBoundingBox([[]])).toBeNull();
  });

  it('spans every point across every stroke', () => {
    const box = strokesBoundingBox(baseO);
    expect(box).toEqual({ minX: 380, minY: 480, maxX: 620, maxY: 720 });
  });
});

describe('composeGlyph — single mark', () => {
  it('returns the missing dependencies when an input is absent', () => {
    expect(composeGlyph(0x00e1, makeLookup({ 0x61: baseO }))).toEqual({
      ok: false,
      missing: [0x00b4],
    });
  });

  it('centres an above-mark over the base and gaps it above the top', () => {
    const result = composeGlyph(0x00f3, makeLookup({ 0x6f: baseO, 0x00b4: acute }));
    if (!result.ok) throw new Error('composition should succeed');
    const accentBox = strokesBoundingBox(result.strokes.slice(baseO.length));
    const baseBox = strokesBoundingBox(baseO);
    if (!accentBox || !baseBox) throw new Error('unreachable');
    expect((accentBox.minX + accentBox.maxX) / 2).toBeCloseTo(
      (baseBox.minX + baseBox.maxX) / 2,
      5,
    );
    expect(accentBox.maxY).toBeLessThan(baseBox.minY);
  });

  it('centres a below-mark and gaps it below the bottom', () => {
    const result = composeGlyph(0x1ee5, makeLookup({ 0x75: baseU, [DOT_CP]: dotBelow }));
    if (!result.ok) throw new Error('composition should succeed');
    const markBox = strokesBoundingBox(result.strokes.slice(baseU.length));
    const baseBox = strokesBoundingBox(baseU);
    if (!markBox || !baseBox) throw new Error('unreachable');
    expect(markBox.minY).toBeGreaterThan(baseBox.maxY);
  });

  it('places horn at the upper-right of the base', () => {
    const result = composeGlyph(0x01a1, makeLookup({ 0x6f: baseO, [HORN_CP]: horn }));
    if (!result.ok) throw new Error('composition should succeed');
    const markBox = strokesBoundingBox(result.strokes.slice(baseO.length));
    const baseBox = strokesBoundingBox(baseO);
    if (!markBox || !baseBox) throw new Error('unreachable');
    expect(markBox.minX).toBeGreaterThan(baseBox.maxX - 50);
    expect(markBox.maxY).toBeLessThan((baseBox.minY + baseBox.maxY) / 2);
  });
});

describe('composeGlyph — tittle handling on i', () => {
  it('drops the tittle when stacking an above-mark', () => {
    const result = composeGlyph(0x00ed, makeLookup({ 0x69: baseI, 0x00b4: acute }));
    if (!result.ok) throw new Error('composition should succeed');
    expect(result.strokes).toHaveLength(2); // stem + acute, dot dropped
    expect(result.strokes[0]!.length).toBe(baseI[0]!.length);
  });

  it('keeps the tittle when only stacking a below-mark', () => {
    const result = composeGlyph(0x1ecb, makeLookup({ 0x69: baseI, [DOT_CP]: dotBelow }));
    if (!result.ok) throw new Error('composition should succeed');
    expect(result.strokes).toHaveLength(3); // stem + tittle + dot below
  });

  it('does not drop a non-tittle stroke (smallest stroke not above)', () => {
    const baseT: Stroke[] = [
      [point(500, 300), point(500, 750)],   // long stem
      [point(440, 480), point(560, 480)],   // short cross-bar at mid-height
    ];
    const result = composeGlyph(0x00ed, makeLookup({ 0x69: baseT, 0x00b4: acute }));
    if (!result.ok) throw new Error('composition should succeed');
    expect(result.strokes).toHaveLength(3);
  });
});

describe('composeGlyph — multi-mark / stacked', () => {
  it('stacks the second above-mark above the first', () => {
    // ổ = o + circumflex + hook-above. The hook should sit ABOVE the circumflex.
    const lookup = makeLookup({ 0x6f: baseO, 0x02c6: circumflex, [HOOK_CP]: hookAbove });
    const interim = composeGlyph(0x00f4, lookup); // ô first to use as base
    if (!interim.ok) throw new Error('ô should compose');

    const composedO_CP = 0x00f4;
    const lookupWithO = makeLookup({
      0x6f: baseO,
      0x02c6: circumflex,
      [HOOK_CP]: hookAbove,
      [composedO_CP]: interim.strokes,
    });
    const result = composeGlyph(0x1ed5, lookupWithO); // ổ
    if (!result.ok) throw new Error('ổ should compose');

    const baseBox = strokesBoundingBox(interim.strokes);
    const hookBox = strokesBoundingBox(result.strokes.slice(interim.strokes.length));
    if (!baseBox || !hookBox) throw new Error('unreachable');
    expect(hookBox.maxY).toBeLessThan(baseBox.minY);
  });
});

describe('composeAll', () => {
  it('produces every target whose dependencies are present, in one call', () => {
    // Drew the minimum primitives for "a-family fully, o-family fully" coverage.
    const drawn = new Map<number, Stroke[]>([
      [0x61, baseO], // pretend 'a' is shaped like our test 'o'
      [0x6f, baseO],
      [0x65, baseO],
      [0x69, baseI],
      [0x6e, baseO],
      [0x75, baseU],
      [0x79, baseI],
      [0x00b4, acute],
      [0x0060, grave],
      [0x02c6, circumflex],
      [0x00a8, [[point(460, 390), point(470, 400)], [point(530, 390), point(540, 400)]]],
      [0x02dc, tilde],
      [0x02d8, [[point(450, 380), point(490, 410), point(510, 410), point(550, 380)]]],
      [HOOK_CP, hookAbove],
      [DOT_CP, dotBelow],
      [HORN_CP, horn],
    ]);

    const produced = composeAll(drawn, { drawnCodePoints: new Set(drawn.keys()) });
    // Every recipe should be composable given a full primitive set.
    expect(produced.size).toBe(COMPOSABLE_TARGETS.length);
  });

  it('resolves chained dependencies (ô before ổ) in one pass', () => {
    const drawn = new Map<number, Stroke[]>([
      [0x6f, baseO],
      [0x02c6, circumflex],
      [HOOK_CP, hookAbove],
    ]);
    const produced = composeAll(drawn, { drawnCodePoints: new Set(drawn.keys()) });
    expect(produced.has(0x00f4)).toBe(true); // ô
    expect(produced.has(0x1ed5)).toBe(true); // ổ
  });

  it('skips drawn glyphs — never overwrites user strokes', () => {
    const userDrawnAcute = [[point(0, 0)]] as Stroke[];
    const userDrawnATilde = [[point(123, 456)]] as Stroke[];
    const drawn = new Map<number, Stroke[]>([
      [0x61, baseO],
      [0x00b4, userDrawnAcute],
      [0x00e3, userDrawnATilde], // user already drew ã by hand
    ]);
    const produced = composeAll(drawn, { drawnCodePoints: new Set(drawn.keys()) });
    expect(produced.has(0x00e3)).toBe(false);
  });
});

describe('COMPOSABLE_TARGETS', () => {
  it('matches the recipe table', () => {
    expect(COMPOSABLE_TARGETS.length).toBe(Object.keys(COMPOSITION_RECIPES).length);
  });

  it('orders dependent recipes after their base', () => {
    const idx = new Map<number, number>(COMPOSABLE_TARGETS.map((cp, i) => [cp, i]));
    for (const target of COMPOSABLE_TARGETS) {
      const recipe = COMPOSITION_RECIPES[target]!;
      const baseIdx = idx.get(recipe.base);
      if (baseIdx === undefined) continue; // base is a primitive letter, not a target
      expect(baseIdx).toBeLessThan(idx.get(target)!);
    }
  });
});
