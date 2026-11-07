import { describe, expect, it } from 'vitest';
import { defaultsFromSchema, normalizeParameters } from './parameters';

describe('parameter normalization', () => {
  const schema = {
    count: { value: 14, min: 1, max: 50 },
    running: true,
    color: { value: '#ff6b2c', type: 'color' as const }
  };

  it('extracts values from shorthand and full definitions', () => {
    expect(defaultsFromSchema(schema)).toEqual({ count: 14, running: true, color: '#ff6b2c' });
  });

  it('applies known overrides without admitting stale keys', () => {
    expect(normalizeParameters(schema, { count: 8, stale: 99 })).toEqual({
      count: 8,
      running: true,
      color: '#ff6b2c'
    });
  });
});
