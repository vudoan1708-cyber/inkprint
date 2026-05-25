import { describe, it, expect } from 'vitest';
import type { Stroke } from './strokeMath';
import {
  strokesEntryDirection,
  strokesEntryPoint,
  strokesExitDirection,
  strokesExitPoint,
  strokesXBounds,
  tightRightOffsetX,
} from './ligature';

const stroke = (...pts: Array<[number, number]>): Stroke =>
  pts.map(([x, y]) => ({ x, y, pressure: 0.7 }));

describe('strokesExitPoint / strokesEntryPoint', () => {
  it('returns null when there are no strokes', () => {
    expect(strokesExitPoint([])).toBeNull();
    expect(strokesEntryPoint([])).toBeNull();
  });

  it('skips empty strokes when finding endpoints', () => {
    const strokes = [stroke([10, 10], [20, 20]), [], stroke([30, 30], [40, 40])];
    expect(strokesExitPoint(strokes)).toMatchObject({ x: 40, y: 40 });
    expect(strokesEntryPoint(strokes)).toMatchObject({ x: 10, y: 10 });
  });
});

describe('exit / entry direction', () => {
  it('falls back to rightwards for single-point strokes', () => {
    expect(strokesExitDirection([stroke([10, 10])])).toEqual({ dx: 1, dy: 0 });
    expect(strokesEntryDirection([stroke([10, 10])])).toEqual({ dx: 1, dy: 0 });
  });

  it('captures the last segment direction on exit', () => {
    const dir = strokesExitDirection([stroke([0, 0], [10, 0], [20, 10])]);
    expect(dir.dx).toBeCloseTo(Math.SQRT1_2);
    expect(dir.dy).toBeCloseTo(Math.SQRT1_2);
  });

  it('captures the first segment direction on entry', () => {
    const dir = strokesEntryDirection([stroke([0, 0], [10, 0])]);
    expect(dir).toEqual({ dx: 1, dy: 0 });
  });
});

describe('strokesXBounds', () => {
  it('returns null when there are no points', () => {
    expect(strokesXBounds([])).toBeNull();
  });

  it('captures the min and max x across all strokes', () => {
    const bounds = strokesXBounds([stroke([100, 0], [300, 50]), stroke([50, 100])]);
    expect(bounds).toEqual({ min: 50, max: 300 });
  });
});

describe('tightRightOffsetX', () => {
  it('falls back to GLYPH_UPM when either side is empty', () => {
    expect(tightRightOffsetX([], [stroke([0, 0])])).toBe(1000);
    expect(tightRightOffsetX([stroke([0, 0])], [])).toBe(1000);
  });

  it('positions the right glyph so its ink starts targetGap after the left ink ends', () => {
    const left = [stroke([100, 500], [800, 500])];
    const right = [stroke([200, 500], [900, 500])];
    expect(tightRightOffsetX(left, right, 50)).toBe(800 - 200 + 50);
  });
});
