import type { ParameterSchema, ParameterValues } from './protocol';
import type { World } from './world';

export type ProjectSources = Record<string, string>;

export interface SimulationHooks {
  parameters: ParameterSchema;
  setup: ((world: World, params: ParameterValues) => void) | null;
  update: ((world: World, dt: number, params: ParameterValues) => void) | null;
}

function normalizePath(path: string): string {
  const parts: string[] = [];
  path.replace(/\\/g, '/').split('/').forEach((part) => {
    if (!part || part === '.') return;
    if (part === '..') parts.pop(); else parts.push(part);
  });
  return parts.join('/');
}

export function resolveModulePath(importer: string, request: string, sources: ProjectSources): string {
  if (!request.startsWith('.')) throw new Error(`External package imports are not available yet: ${request}`);
  const base = importer.includes('/') ? importer.slice(0, importer.lastIndexOf('/') + 1) : '';
  const candidate = normalizePath(`${base}${request}`);
  const choices = [candidate, `${candidate}.js`, `${candidate}.ts`, `${candidate}/index.js`, `${candidate}/index.ts`];
  const resolved = choices.find((path) => Object.hasOwn(sources, path));
  if (!resolved) throw new Error(`Cannot resolve "${request}" from ${importer}`);
  return resolved;
}

function importBinding(specifier: string, request: string): string {
  const requireCall = `require(${JSON.stringify(request)})`;
  const spec = specifier.trim();
  if (spec.startsWith('{')) {
    const bindings = spec.slice(1, -1).split(',').map((part) => part.trim().replace(/\s+as\s+/, ': ')).filter(Boolean).join(', ');
    return `const { ${bindings} } = ${requireCall};`;
  }
  if (spec.startsWith('* as ')) return `const ${spec.slice(5).trim()} = ${requireCall};`;
  const comma = spec.indexOf(',');
  if (comma >= 0) {
    const defaultName = spec.slice(0, comma).trim();
    const rest = spec.slice(comma + 1).trim();
    return `const ${defaultName} = ${requireCall}.default;\n${importBinding(rest, request)}`;
  }
  return `const ${spec} = ${requireCall}.default;`;
}

export function transformModule(source: string): string {
  const exported = new Set<string>();
  let code = source
    .replace(/\bimport\s+([\s\S]*?)\s+from\s+(['"])(.*?)\2\s*;?/g, (_match, specifier: string, _quote: string, request: string) => importBinding(specifier, request))
    .replace(/\bimport\s+(['"])(.*?)\1\s*;?/g, (_match, _quote: string, request: string) => `require(${JSON.stringify(request)});`)
    .replace(/\bexport\s+default\s+/g, 'exports.default = ')
    .replace(/\bexport\s+(const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/g, (_match, kind: string, name: string) => {
      exported.add(name); return `${kind} ${name}`;
    })
    .replace(/\bexport\s*\{([^}]+)\}\s*;?/g, (_match, list: string) => {
      const assignments = list.split(',').map((item) => {
        const [local, publicName = local] = item.trim().split(/\s+as\s+/); return `${JSON.stringify(publicName)}: ${local}`;
      });
      return `Object.assign(exports, { ${assignments.join(', ')} });`;
    });
  if (exported.size) code += `\nObject.assign(exports, { ${[...exported].join(', ')} });`;
  return code;
}

export function compileProject(
  sources: ProjectSources,
  entry: string,
  world: World,
  params: ParameterValues
): SimulationHooks {
  const normalizedSources = Object.fromEntries(Object.entries(sources).map(([path, source]) => [normalizePath(path), source]));
  const cache = new Map<string, Record<string, unknown>>();
  const execute = (path: string): Record<string, unknown> => {
    const normalized = normalizePath(path);
    const cached = cache.get(normalized); if (cached) return cached;
    const source = normalizedSources[normalized];
    if (source == null) throw new Error(`Project module not found: ${normalized}`);
    const exports: Record<string, unknown> = {}; cache.set(normalized, exports);
    const localRequire = (request: string) => execute(resolveModulePath(normalized, request, normalizedSources));
    const factory = new Function('exports', 'require', 'world', 'params', `"use strict";\n${transformModule(source)}\n//# sourceURL=loop:///${normalized}`) as (
      exports: Record<string, unknown>, require: (request: string) => Record<string, unknown>, world: World, params: ParameterValues
    ) => void;
    factory(exports, localRequire, world, params);
    return exports;
  };
  const exports = execute(normalizePath(entry));
  return {
    parameters: (exports.parameters || {}) as ParameterSchema,
    setup: typeof exports.setup === 'function' ? exports.setup as SimulationHooks['setup'] : null,
    update: typeof exports.update === 'function' ? exports.update as SimulationHooks['update'] : null
  };
}
