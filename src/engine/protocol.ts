export type ParameterValue = number | string | boolean;

export interface ParameterDefinition {
  value: ParameterValue;
  min?: number;
  max?: number;
  step?: number;
  type?: 'color';
  group?: string;
}

export type ParameterSchema = Record<string, ParameterDefinition | ParameterValue>;
export type ParameterValues = Record<string, ParameterValue>;

export type HostToRuntimeMessage =
  | { type: 'init'; canvas: OffscreenCanvas; width: number; height: number }
  | { type: 'run'; code: string; params: ParameterValues }
  | { type: 'restart' }
  | { type: 'play'; playing: boolean }
  | { type: 'step' }
  | { type: 'params'; params: ParameterValues }
  | { type: 'resize'; width: number; height: number };

export type RuntimeToHostMessage =
  | { type: 'ready' }
  | { type: 'parameters'; schema: ParameterSchema; params: ParameterValues }
  | { type: 'log'; level: 'ok' | 'info'; message: string }
  | { type: 'error'; message: string; stack?: string }
  | { type: 'status'; playing: boolean }
  | { type: 'time'; elapsed: number; frame: number; objectCount: number };
