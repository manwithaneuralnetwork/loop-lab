import { describe, expect, it } from 'vitest';
import { buildExportPlan, randomizeParameters } from './export-options';

describe('export options', () => {
  it('fits output to a 720px maximum side while preserving aspect ratio', () => {
    expect(buildExportPlan(1920, 1080, 720, 30, 2)).toEqual({
      width: 720,
      height: 406,
      fps: 30,
      duration: 2,
      totalFrames: 60
    });
  });

  it('randomizes every exposed creative parameter independently of export length', () => {
    const schema = {
      duration: { value: 20, min: 1, max: 120 },
      count: { value: 10, min: 1, max: 20, step: 1 },
      trails: { value: true },
      color: { value: '#ff6b2c', type: 'color' as const }
    };
    const values = randomizeParameters(schema, { duration: 8 }, () => 0.25);
    expect(values.duration).toBeGreaterThanOrEqual(1);
    expect(values.count).toBeGreaterThanOrEqual(1);
    expect(values.count).toBeLessThanOrEqual(20);
    expect(values.trails).toBe(false);
    expect(values.color).toMatch(/^#[0-9a-f]{6}$/);
  });
});
