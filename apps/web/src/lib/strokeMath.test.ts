import { describe, it, expect } from 'vitest';
import { pointsToSubpath } from './strokeMath';

describe('pointsToSubpath', () => {
  it('returns empty for an empty stroke', () => {
    expect(pointsToSubpath([])).toBe('');
  });

  it('emits a bare move for a single-point stroke', () => {
    expect(pointsToSubpath([{ x: 10, y: 20, pressure: 1 }])).toBe('M10 20');
  });

  it('emits a polyline (M + L per subsequent point) for multi-point strokes', () => {
    const out = pointsToSubpath([
      { x: 0, y: 0, pressure: 1 },
      { x: 50, y: 50, pressure: 1 },
      { x: 100, y: 0, pressure: 1 },
    ]);
    expect(out).toBe('M0 0L50 50L100 0');
  });

  it('does not emit cubic or quadratic commands (locality is the contract)', () => {
    const out = pointsToSubpath([
      { x: 0, y: 0, pressure: 1 },
      { x: 50, y: 50, pressure: 1 },
      { x: 100, y: 0, pressure: 1 },
      { x: 200, y: 50, pressure: 1 },
    ]);
    expect(out).not.toMatch(/[CQ]/);
  });
});
