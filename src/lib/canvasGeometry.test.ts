import { describe, it, expect } from 'vitest';
import {
  distPointToSegment,
  distPointToStroke,
  findClosestAnchor,
  findClosestStrokeIndex,
  findNextAnchorIdx,
  findPrevAnchorIdx,
  interpolatePressure,
  projectPointOntoStroke,
} from './canvasGeometry';
import type { Stroke } from './strokeMath';

describe('distPointToSegment', () => {
  it('returns 0 when the point lies on the segment', () => {
    expect(distPointToSegment(5, 0, 0, 0, 10, 0)).toBe(0);
  });
  it('clamps to nearest endpoint when projection falls outside [0,1]', () => {
    expect(distPointToSegment(-5, 0, 0, 0, 10, 0)).toBe(5);
    expect(distPointToSegment(15, 0, 0, 0, 10, 0)).toBe(5);
  });
  it('returns perpendicular distance for points off the line', () => {
    expect(distPointToSegment(5, 3, 0, 0, 10, 0)).toBe(3);
  });
  it('handles degenerate (zero-length) segments', () => {
    expect(distPointToSegment(3, 4, 0, 0, 0, 0)).toBe(5);
  });
});

describe('distPointToStroke', () => {
  it('returns Infinity for an empty stroke', () => {
    expect(distPointToStroke(0, 0, [])).toBe(Infinity);
  });
  it('falls back to point distance for a single-point stroke', () => {
    expect(distPointToStroke(3, 4, [{ x: 0, y: 0, pressure: 1 }])).toBe(5);
  });
  it('returns the min over all segments', () => {
    const s: Stroke = [
      { x: 0, y: 0, pressure: 1 },
      { x: 100, y: 0, pressure: 1 },
      { x: 100, y: 100, pressure: 1 },
    ];
    expect(distPointToStroke(50, 5, s)).toBe(5);
    expect(distPointToStroke(95, 50, s)).toBe(5);
  });
});

describe('findClosestStrokeIndex', () => {
  const s1: Stroke = [
    { x: 0, y: 0, pressure: 1 },
    { x: 100, y: 0, pressure: 1 },
  ];
  const s2: Stroke = [
    { x: 0, y: 200, pressure: 1 },
    { x: 100, y: 200, pressure: 1 },
  ];

  it('returns the closer stroke', () => {
    expect(findClosestStrokeIndex({ x: 50, y: 10 }, [s1, s2], 30)).toBe(0);
    expect(findClosestStrokeIndex({ x: 50, y: 190 }, [s1, s2], 30)).toBe(1);
  });
  it('returns null when no stroke is within the threshold', () => {
    expect(findClosestStrokeIndex({ x: 50, y: 100 }, [s1, s2], 30)).toBe(null);
  });
  it('prefers the more recently drawn stroke on ties', () => {
    const a: Stroke = [
      { x: 0, y: 0, pressure: 1 },
      { x: 100, y: 0, pressure: 1 },
    ];
    const b: Stroke = [
      { x: 0, y: 0, pressure: 1 },
      { x: 100, y: 0, pressure: 1 },
    ];
    expect(findClosestStrokeIndex({ x: 50, y: 0 }, [a, b], 30)).toBe(1);
  });
});

describe('findClosestAnchor', () => {
  it('returns the closest anchor across all strokes, skipping non-anchor samples', () => {
    const s1: Stroke = [
      { x: 0, y: 0, pressure: 1 },
      { x: 50, y: 0, pressure: 1 },
      { x: 100, y: 0, pressure: 1, isAnchor: true },
    ];
    const s2: Stroke = [
      { x: 0, y: 100, pressure: 1, isAnchor: true },
      { x: 100, y: 100, pressure: 1 },
    ];
    expect(findClosestAnchor([s1, s2], { x: 102, y: 1 }, 20)).toEqual({
      strokeIndex: 0,
      vertexIndex: 2,
    });
    expect(findClosestAnchor([s1, s2], { x: 2, y: 102 }, 20)).toEqual({
      strokeIndex: 1,
      vertexIndex: 0,
    });
  });
  it('returns null when no anchor is within the threshold', () => {
    const s: Stroke = [{ x: 0, y: 0, pressure: 1, isAnchor: true }];
    expect(findClosestAnchor([s], { x: 100, y: 100 }, 20)).toBe(null);
  });
  it('returns null when there are no anchors at all', () => {
    const s: Stroke = [
      { x: 0, y: 0, pressure: 1 },
      { x: 100, y: 0, pressure: 1 },
    ];
    expect(findClosestAnchor([s], { x: 50, y: 0 }, 20)).toBe(null);
  });
  it('prefers the more recently drawn stroke on ties', () => {
    const a: Stroke = [{ x: 0, y: 0, pressure: 1, isAnchor: true }];
    const b: Stroke = [{ x: 0, y: 0, pressure: 1, isAnchor: true }];
    expect(findClosestAnchor([a, b], { x: 0, y: 0 }, 20)).toEqual({
      strokeIndex: 1,
      vertexIndex: 0,
    });
  });
});

describe('projectPointOntoStroke', () => {
  it('returns null for an empty stroke', () => {
    expect(projectPointOntoStroke([], { x: 0, y: 0 })).toBe(null);
  });
  it('returns the lone point for a single-point stroke', () => {
    const result = projectPointOntoStroke([{ x: 10, y: 20, pressure: 1 }], { x: 13, y: 24 });
    expect(result).toEqual({
      segmentIndex: 0,
      t: 0,
      projected: { x: 10, y: 20 },
      distance: 5,
    });
  });
  it('projects onto the closest segment with the correct t', () => {
    const s: Stroke = [
      { x: 0, y: 0, pressure: 1 },
      { x: 100, y: 0, pressure: 1 },
      { x: 100, y: 100, pressure: 1 },
    ];
    const result = projectPointOntoStroke(s, { x: 25, y: 5 });
    expect(result?.segmentIndex).toBe(0);
    expect(result?.t).toBeCloseTo(0.25, 6);
    expect(result?.projected).toEqual({ x: 25, y: 0 });
    expect(result?.distance).toBe(5);
  });
  it('clamps t into [0, 1] when the projection falls past an endpoint', () => {
    const s: Stroke = [
      { x: 0, y: 0, pressure: 1 },
      { x: 100, y: 0, pressure: 1 },
    ];
    const result = projectPointOntoStroke(s, { x: 150, y: 0 });
    expect(result?.t).toBe(1);
    expect(result?.projected).toEqual({ x: 100, y: 0 });
  });
});

describe('findPrevAnchorIdx / findNextAnchorIdx', () => {
  const stroke: Stroke = [
    { x: 0, y: 0, pressure: 1, isAnchor: true }, // 0
    { x: 1, y: 0, pressure: 1 }, // 1
    { x: 2, y: 0, pressure: 1 }, // 2
    { x: 3, y: 0, pressure: 1, isAnchor: true }, // 3
    { x: 4, y: 0, pressure: 1 }, // 4
    { x: 5, y: 0, pressure: 1, isAnchor: true }, // 5
  ];

  it('finds the nearest preceding anchor', () => {
    expect(findPrevAnchorIdx(stroke, 4)).toBe(3);
    expect(findPrevAnchorIdx(stroke, 5)).toBe(3);
  });
  it('falls back to index 0 when no earlier anchor exists', () => {
    const noAnchorsAtStart: Stroke = [
      { x: 0, y: 0, pressure: 1 },
      { x: 1, y: 0, pressure: 1 },
      { x: 2, y: 0, pressure: 1, isAnchor: true },
    ];
    expect(findPrevAnchorIdx(noAnchorsAtStart, 2)).toBe(0);
  });
  it('finds the nearest following anchor', () => {
    expect(findNextAnchorIdx(stroke, 1)).toBe(3);
    expect(findNextAnchorIdx(stroke, 3)).toBe(5);
  });
  it('falls back to the last index when no later anchor exists', () => {
    expect(findNextAnchorIdx(stroke, 5)).toBe(5);
    const noAnchorsAtEnd: Stroke = [
      { x: 0, y: 0, pressure: 1, isAnchor: true },
      { x: 1, y: 0, pressure: 1 },
      { x: 2, y: 0, pressure: 1 },
    ];
    expect(findNextAnchorIdx(noAnchorsAtEnd, 0)).toBe(2);
  });
  it('returns 0 / 0 for an empty stroke at index 0', () => {
    expect(findPrevAnchorIdx([], 0)).toBe(0);
    expect(findNextAnchorIdx([], 0)).toBe(0);
  });
});

describe('interpolatePressure', () => {
  it('interpolates linearly at t=0.5', () => {
    expect(
      interpolatePressure(
        { x: 0, y: 0, pressure: 0.2 },
        { x: 1, y: 1, pressure: 0.8 },
        0.5,
      ),
    ).toBeCloseTo(0.5, 6);
  });
  it('returns the endpoint pressures at t=0 and t=1', () => {
    const a = { x: 0, y: 0, pressure: 0.3 };
    const b = { x: 1, y: 1, pressure: 0.9 };
    expect(interpolatePressure(a, b, 0)).toBeCloseTo(0.3, 6);
    expect(interpolatePressure(a, b, 1)).toBeCloseTo(0.9, 6);
  });
});
