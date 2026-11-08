import type { AudioCommand, ParameterValues } from '../engine/protocol';

export type ExportWorkerRequest =
  | {
      type: 'preflight'; files: Record<string, string>; assets?: Record<string, string>; entry?: string;
      params: ParameterValues; worldWidth: number; worldHeight: number; limitSeconds: number;
    }
  | {
      type: 'start';
      code: string;
      files?: Record<string, string>;
      assets?: Record<string, string>;
      entry?: string;
      params: ParameterValues;
      worldWidth: number;
      worldHeight: number;
      outputWidth: number;
      outputHeight: number;
      fps: number;
      totalFrames: number;
    }
  | { type: 'next' };

export type ExportWorkerResponse =
  | { type: 'preflight'; finished: boolean; duration: number; frames: number; reason: string }
  | { type: 'frame'; bitmap: ImageBitmap; frame: number; totalFrames: number; audio: AudioCommand[] }
  | { type: 'complete'; frames: number; finished: boolean }
  | { type: 'error'; message: string };
