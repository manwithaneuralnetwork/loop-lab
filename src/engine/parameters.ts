import type { ParameterDefinition, ParameterSchema, ParameterValues } from './protocol';

export function isParameterDefinition(value: unknown): value is ParameterDefinition {
  return Boolean(value && typeof value === 'object' && 'value' in value);
}

export function defaultsFromSchema(schema: ParameterSchema = {}): ParameterValues {
  return Object.fromEntries(
    Object.entries(schema).map(([key, definition]) => [
      key,
      isParameterDefinition(definition) ? definition.value : definition
    ])
  );
}

export function normalizeParameters(
  schema: ParameterSchema = {},
  overrides: ParameterValues = {}
): ParameterValues {
  const defaults = defaultsFromSchema(schema);
  return Object.fromEntries(
    Object.keys(defaults).map((key) => [key, key in overrides ? overrides[key] : defaults[key]])
  );
}
