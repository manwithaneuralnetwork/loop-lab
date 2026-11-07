import type { ParameterValues } from '../engine/protocol';

export type ExportWorkerRequest =
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
  | { type: 'frame'; bitmap: ImageBitmap; frame: number; totalFrames: number }
  | { type: 'complete' }
  | { type: 'error'; message: string };
