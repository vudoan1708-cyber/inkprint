import { describe, it, expect } from 'vitest';
import type { Stroke } from './strokeMath';
import { smoothStroke, smoothStrokes } from './smoothing';

const stroke = (...pts: Array<[number, number, number?]>): Stroke =>
  pts.map(([x, y, pressure = 0.5]) => ({ x, y, pressure }));

describe('smoothStroke', () => {
  it('returns a copy without anchors for strokes shorter than 3 points', () => {
    const input: Stroke = [
      { x: 10, y: 10, pressure: 0.5, isAnchor: true },
      { x: 20, y: 20, pressure: 0.5 },
    ];
    const result = smoothStroke(input);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ x: 10, y: 10, pressure: 0.5 });
    expect(result[0]).not.toHaveProperty('isAnchor');
  });

  it('pins the first and last point across all iterations', () => {
    const input = stroke([0, 0], [50, 100], [100, 0]);
    const result = smoothStroke(input, 3);
    expect(result[0]).toMatchObject({ x: 0, y: 0 });
    expect(result[result.length - 1]).toMatchObject({ x: 100, y: 0 });
  });

  it('produces 2 * (n - 1) interior points after one iteration', () => {
    const input = stroke([0, 0], [10, 10], [20, 0]);
    const result = smoothStroke(input, 1);
    expect(result.length).toBe(2 + 2 * (3 - 1));
  });

  it('rounds a sharp corner — the Chaikin Q points lie 1/4 and 3/4 along the segments', () => {
    const input = stroke([0, 0], [10, 10], [20, 0]);
    const result = smoothStroke(input, 1);
    expect(result[1]).toMatchObject({ x: 2.5, y: 2.5 });
    expect(result[2]).toMatchObject({ x: 7.5, y: 7.5 });
    expect(result[3]).toMatchObject({ x: 12.5, y: 7.5 });
    expect(result[4]).toMatchObject({ x: 17.5, y: 2.5 });
  });

  it('interpolates pressure between adjacent points', () => {
    const input = stroke([0, 0, 0.2], [10, 0, 1.0], [20, 0, 0.2]);
    const result = smoothStroke(input, 1);
    expect(result[1]!.pressure).toBeCloseTo(0.2 * 0.75 + 1.0 * 0.25);
    expect(result[2]!.pressure).toBeCloseTo(0.2 * 0.25 + 1.0 * 0.75);
  });

  it('strips isAnchor flags from the output', () => {
    const input: Stroke = [
      { x: 0, y: 0, pressure: 0.5, isAnchor: true },
      { x: 10, y: 10, pressure: 0.5, isAnchor: true },
      { x: 20, y: 0, pressure: 0.5, isAnchor: true },
    ];
    const result = smoothStroke(input);
    for (const p of result) expect(p).not.toHaveProperty('isAnchor');
  });
});

describe('smoothStrokes', () => {
  it('maps over each stroke independently', () => {
    const input = [stroke([0, 0], [10, 10], [20, 0]), stroke([100, 100])];
    const result = smoothStrokes(input, 1);
    expect(result).toHaveLength(2);
    expect(result[1]).toHaveLength(1);
  });
});
