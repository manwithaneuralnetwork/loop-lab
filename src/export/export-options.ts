import { isParameterDefinition } from '../engine/parameters';
import type { ParameterDefinition, ParameterSchema, ParameterValue, ParameterValues } from '../engine/protocol';

export interface ExportDimensions {
  width: number;
  height: number;
}

export interface ExportPlan extends ExportDimensions {
  fps: number;
  duration: number;
  totalFrames: number;
}

function randomHexColor(random: () => number): string {
  const hue = random();
  const saturation = 0.72 + random() * 0.2;
  const value = 0.9 + random() * 0.1;
  const sector = hue * 6;
  const index = Math.floor(sector);
  const fraction = sector - index;
  const p = value * (1 - saturation);
  const q = value * (1 - fraction * saturation);
  const t = value * (1 - (1 - fraction) * saturation);
  const channels = [
    [value, t, p], [q, value, p], [p, value, t],
    [p, q, value], [t, p, value], [value, p, q]
  ][index % 6];
  return `#${channels.map((channel) => Math.round(channel * 255).toString(16).padStart(2, '0')).join('')}`;
}

function randomNumber(definition: ParameterDefinition, random: () => number): number {
  const value = Number(definition.value);
  const spread = Math.max(Math.abs(value) * 0.5, 1);
  const min = definition.min ?? value - spread;
  const max = definition.max ?? value + spread;
  const step = definition.step ?? Math.max((max - min) / 100, 0.01);
  const steps = Math.max(0, Math.floor((max - min) / step));
  const result = min + Math.floor(random() * (steps + 1)) * step;
  return Number(Math.min(max, result).toFixed(8));
}

export function randomizeParameters(
  schema: ParameterSchema,
  current: ParameterValues,
  random: () => number = Math.random
): ParameterValues {
  return { ...current, ...Object.fromEntries(Object.entries(schema).map(([key, rawDefinition]) => {
    const definition = isParameterDefinition(rawDefinition) ? rawDefinition : { value: rawDefinition };
    const value = definition.value;
    if (key === 'duration' || key === 'autoRestart') return [key, current[key] ?? value];
    if (definition.type === 'color' && typeof value === 'string') return [key, randomHexColor(random)];
    if (typeof value === 'number') return [key, randomNumber(definition, random)];
    if (typeof value === 'boolean') return [key, random() >= 0.5];
    return [key, current[key] ?? value];
  })) };
}

export function buildExportPlan(
  worldWidth: number,
  worldHeight: number,
  params: ParameterValues,
  maxSide = 720,
  fps = 30
): ExportPlan {
  const scale = Math.min(1, maxSide / Math.max(worldWidth, worldHeight));
  const even = (value: number) => Math.max(2, Math.round(value * scale / 2) * 2);
  const durationValue = Number(params.duration);
  const duration = Number.isFinite(durationValue) ? Math.max(0.25, Math.min(300, durationValue)) : 10;
  return {
    width: even(worldWidth),
    height: even(worldHeight),
    fps,
    duration,
    totalFrames: Math.max(1, Math.ceil(duration * fps))
  };
}

export function coerceParameterValue(definition: ParameterDefinition | ParameterValue, raw: string): ParameterValue {
  const normalized = isParameterDefinition(definition) ? definition : { value: definition };
  if (typeof normalized.value === 'number') return Number(raw);
  if (typeof normalized.value === 'boolean') return raw === 'true';
  return raw;
}
