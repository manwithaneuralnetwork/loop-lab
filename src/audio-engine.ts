import type { AudioCommand } from './engine/protocol';

export class AudioEngine {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private readonly buffers = new Map<string, Promise<AudioBuffer>>();
  private volume = 0.65;
  private muted = false;

  async resume(): Promise<void> {
    const context = this.ensureContext();
    if (context.state === 'suspended') await context.resume();
  }

  setVolume(value: number): void {
    this.volume = Math.max(0, Math.min(1, value));
    this.updateGain();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.updateGain();
  }

  isMuted(): boolean { return this.muted; }

  async play(command: AudioCommand): Promise<void> {
    const context = this.ensureContext();
    if (context.state !== 'running') return;
    try {
      const buffer = await this.load(command.source);
      const source = context.createBufferSource();
      const gain = context.createGain();
      const pan = context.createStereoPanner();
      source.buffer = buffer;
      source.playbackRate.value = command.rate;
      source.loop = command.loop;
      gain.gain.value = command.volume;
      pan.pan.value = command.pan;
      source.connect(gain).connect(pan).connect(this.master!);
      source.start();
    } catch {
      // Invalid or unsupported audio assets are ignored by the preview mixer.
    }
  }

  dispose(): void {
    void this.context?.close();
    this.context = null;
    this.master = null;
    this.buffers.clear();
  }

  private ensureContext(): AudioContext {
    if (this.context && this.master) return this.context;
    this.context = new AudioContext();
    this.master = this.context.createGain();
    this.master.connect(this.context.destination);
    this.updateGain();
    return this.context;
  }

  private updateGain(): void {
    if (this.master && this.context) this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume, this.context.currentTime, 0.015);
  }

  private load(source: string): Promise<AudioBuffer> {
    const cached = this.buffers.get(source);
    if (cached) return cached;
    const context = this.ensureContext();
    const loading = fetch(source).then((response) => {
      if (!response.ok) throw new Error(`Unable to load audio (${response.status}).`);
      return response.arrayBuffer();
    }).then((data) => context.decodeAudioData(data));
    this.buffers.set(source, loading);
    void loading.catch(() => this.buffers.delete(source));
    return loading;
  }
}
