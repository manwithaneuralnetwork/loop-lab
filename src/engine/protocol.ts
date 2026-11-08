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

export interface AudioCommand {
  id: string;
  source: string;
  volume: number;
  rate: number;
  loop: boolean;
  pan: number;
}

export interface RuntimeProfile {
  fps: number;
  updateMs: number;
  renderMs: number;
  frameMs: number;
  objects: number;
  maxObjects: number;
  longFrames: number;
}

export type HostToRuntimeMessage =
  | { type: 'init'; canvas: OffscreenCanvas; width: number; height: number }
  | { type: 'run'; code: string; params: ParameterValues; files?: Record<string, string>; assets?: Record<string, string>; entry?: string; botEntry?: string }
  | { type: 'restart' }
  | { type: 'play'; playing: boolean }
  | { type: 'speed'; rate: number }
  | { type: 'seek'; seconds: number }
  | { type: 'input'; pointer?: { x?: number; y?: number; down?: boolean }; key?: string; pressed?: boolean }
  | { type: 'step' }
  | { type: 'params'; params: ParameterValues }
  | { type: 'resize'; width: number; height: number };

export type RuntimeToHostMessage =
  | { type: 'ready' }
  | { type: 'parameters'; schema: ParameterSchema; params: ParameterValues }
  | { type: 'log'; level: 'ok' | 'info' | 'warning'; message: string }
  | { type: 'profile'; profile: RuntimeProfile }
  | { type: 'audio'; command: AudioCommand }
  | { type: 'finished'; reason: string; elapsed: number; frame: number }
  | { type: 'error'; message: string; stack?: string; file?: string; line?: number; column?: number }
  | { type: 'status'; playing: boolean }
  | { type: 'time'; elapsed: number; frame: number; objectCount: number };
