import type { AudioCommand } from './engine/protocol';

export class AudioEngine {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private limiter: DynamicsCompressorNode | null = null;
  private clipper: WaveShaperNode | null = null;
  private ceiling: GainNode | null = null;
  private readonly buffers = new Map<string, Promise<AudioBuffer>>();
  private readonly voices: Array<{ source: AudioBufferSourceNode; key: string; startedAt: number }> = [];
  private volume = 0.65;
  private muted = false;

  constructor(
    context: AudioContext | null = null,
    private readonly destination: AudioNode | null = null,
    private readonly maxVoices = 24,
    private readonly maxVoicesPerSource = 6
  ) {
    this.context = context;
  }

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

  async preload(sources: string[]): Promise<void> {
    this.ensureContext();
    await Promise.all([...new Set(sources)].map((source) => this.load(source)));
  }

  async play(command: AudioCommand): Promise<void> {
    const context = this.ensureContext();
    if (context.state !== 'running') return;
    try {
      const buffer = await this.load(command.source);
      this.trimVoices(command.source);
      const source = context.createBufferSource();
      const gain = context.createGain();
      const pan = context.createStereoPanner();
      const sameSourceCount = this.voices.filter((voice) => voice.key === command.source).length;
      source.buffer = buffer;
      source.playbackRate.value = command.rate;
      source.loop = command.loop;
      gain.gain.value = command.volume / Math.sqrt(sameSourceCount + 1);
      pan.pan.value = command.pan;
      source.connect(gain).connect(pan).connect(this.master!);
      const voice = { source, key: command.source, startedAt: context.currentTime };
      this.voices.push(voice);
      source.onended = () => {
        const index = this.voices.indexOf(voice);
        if (index >= 0) this.voices.splice(index, 1);
      };
      source.start();
    } catch {
      // Invalid or unsupported audio assets are ignored by the preview mixer.
    }
  }

  dispose(): void {
    void this.context?.close();
    this.context = null;
    this.master = null;
    this.limiter = null;
    this.clipper = null;
    this.ceiling = null;
    this.voices.splice(0).forEach((voice) => { try { voice.source.stop(); } catch { /* already stopped */ } });
    this.buffers.clear();
  }

  private ensureContext(): AudioContext {
    if (this.context && this.master) return this.context;
    this.context ||= new AudioContext();
    this.master = this.context.createGain();
    this.limiter = this.context.createDynamicsCompressor();
    this.limiter.threshold.value = -12;
    this.limiter.knee.value = 6;
    this.limiter.ratio.value = 20;
    this.limiter.attack.value = 0.003;
    this.limiter.release.value = 0.18;
    this.clipper = this.context.createWaveShaper();
    this.clipper.curve = AudioEngine.limiterCurve();
    this.clipper.oversample = '4x';
    this.ceiling = this.context.createGain();
    this.ceiling.gain.value = 0.35;
    this.master.connect(this.limiter).connect(this.clipper).connect(this.ceiling).connect(this.destination || this.context.destination);
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

  private trimVoices(key: string): void {
    const stopOldest = (voices: Array<{ source: AudioBufferSourceNode; key: string; startedAt: number }>) => {
      const oldest = voices.sort((a, b) => a.startedAt - b.startedAt)[0];
      if (!oldest) return;
      try { oldest.source.stop(); } catch { /* already stopped */ }
      const index = this.voices.indexOf(oldest);
      if (index >= 0) this.voices.splice(index, 1);
    };
    while (this.voices.filter((voice) => voice.key === key).length >= this.maxVoicesPerSource) {
      stopOldest(this.voices.filter((voice) => voice.key === key));
    }
    while (this.voices.length >= this.maxVoices) stopOldest([...this.voices]);
  }

  private static limiterCurve(): Float32Array<ArrayBuffer> {
    const samples = 2048;
    const curve = new Float32Array(samples);
    const drive = 2.4;
    const scale = 0.92 / Math.tanh(drive);
    for (let index = 0; index < samples; index += 1) {
      const input = (index / (samples - 1)) * 2 - 1;
      curve[index] = Math.tanh(input * drive) * scale;
    }
    return curve;
  }
}
