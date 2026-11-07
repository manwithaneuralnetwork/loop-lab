import type { AudioCommand } from './protocol';

export interface Point { x: number; y: number }
export interface Bounds { left: number; top: number; right: number; bottom: number }
export type BoundarySide = 'left' | 'right' | 'top' | 'bottom';

export interface SoundOptions {
  volume?: number;
  rate?: number;
  loop?: boolean;
  pan?: number;
}

export interface BodyOptions {
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  radius?: number;
  width?: number;
  height?: number;
  color?: string;
  bounce?: boolean;
  restitution?: number;
  trail?: number;
  asset?: string;
  text?: string;
  font?: string;
  fontSize?: number;
  align?: CanvasTextAlign;
  rotation?: number;
  opacity?: number;
  name?: string;
  layer?: number;
  visible?: boolean;
  active?: boolean;
  tags?: string[];
}

export interface WorldInput {
  pointer: { x: number; y: number; down: boolean };
  keys: Set<string>;
}

export class Body {
  readonly id: string;
  readonly kind: 'circle' | 'rectangle' | 'sprite' | 'text';
  position: Point;
  velocity: Point;
  radius: number;
  width: number;
  height: number;
  color: string;
  bounce: boolean;
  restitution: number;
  trailLength: number;
  trail: Point[] = [];
  asset: string;
  text: string;
  font: string;
  fontSize: number;
  align: CanvasTextAlign;
  rotation: number;
  opacity: number;
  name: string;
  layer: number;
  visible: boolean;
  active: boolean;
  destroyed = false;
  readonly tags: Set<string>;
  readonly collisions = new Set<BoundarySide>();

  constructor(id: string, kind: 'circle' | 'rectangle' | 'sprite' | 'text', options: BodyOptions = {}) {
    this.id = id;
    this.kind = kind;
    this.position = { x: Number(options.x) || 0, y: Number(options.y) || 0 };
    this.velocity = { x: Number(options.vx) || 0, y: Number(options.vy) || 0 };
    this.radius = Number(options.radius) || 10;
    this.width = Number(options.width) || 20;
    this.height = Number(options.height) || 20;
    this.color = options.color || '#ff6b2c';
    this.bounce = Boolean(options.bounce);
    this.restitution = Number(options.restitution ?? 0.88);
    this.trailLength = Number(options.trail) || 0;
    this.asset = options.asset || '';
    this.text = options.text || '';
    this.font = options.font || 'Manrope, sans-serif';
    this.fontSize = Number(options.fontSize) || 24;
    this.align = options.align || 'center';
    this.rotation = Number(options.rotation) || 0;
    this.opacity = Number(options.opacity ?? 1);
    this.name = options.name || '';
    this.layer = Number(options.layer) || 0;
    this.visible = options.visible ?? true;
    this.active = options.active ?? true;
    this.tags = new Set(options.tags || []);
  }

  bounceInside(bounds: Bounds, restitution = this.restitution): BoundarySide[] {
    const hits: BoundarySide[] = [];
    const rx = this.kind === 'circle' ? this.radius : this.width / 2;
    const ry = this.kind === 'circle' ? this.radius : this.height / 2;
    if (this.position.x - rx < bounds.left) {
      this.position.x = bounds.left + rx;
      this.velocity.x = Math.abs(this.velocity.x) * restitution;
      hits.push('left');
    }
    if (this.position.x + rx > bounds.right) {
      this.position.x = bounds.right - rx;
      this.velocity.x = -Math.abs(this.velocity.x) * restitution;
      hits.push('right');
    }
    if (this.position.y - ry < bounds.top) {
      this.position.y = bounds.top + ry;
      this.velocity.y = Math.abs(this.velocity.y) * restitution;
      hits.push('top');
    }
    if (this.position.y + ry > bounds.bottom) {
      this.position.y = bounds.bottom - ry;
      this.velocity.y = -Math.abs(this.velocity.y) * restitution;
      hits.push('bottom');
    }
    hits.forEach((side) => this.collisions.add(side));
    return hits;
  }

  hit(side: BoundarySide): boolean { return this.collisions.has(side); }
  hasTag(tag: string): boolean { return this.tags.has(tag); }
  destroy(): void { this.destroyed = true; }
}

export class Camera {
  x = 0;
  y = 0;
  zoom = 1;

  constructor(private width: number, private height: number) {}

  centerOn(x: number, y: number): void {
    this.x = x - this.width / (2 * this.zoom);
    this.y = y - this.height / (2 * this.zoom);
  }

  screenToWorld(point: Point): Point {
    return { x: point.x / this.zoom + this.x, y: point.y / this.zoom + this.y };
  }

  resize(width: number, height: number): void { this.width = width; this.height = height; }
}

function makeRandom(seed: number): () => number {
  let state = (Number(seed) || 1) >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export class World {
  objects: Body[] = [];
  background = '#121315';
  width: number;
  height: number;
  bounds: Bounds;
  readonly camera: Camera;
  readonly input: WorldInput = { pointer: { x: 0, y: 0, down: false }, keys: new Set() };
  private randomSource: () => number;
  private readonly assets: Record<string, string>;
  private nextObjectId = 1;
  private nextSoundId = 1;
  private audioQueue: AudioCommand[] = [];

  constructor(width: number, height: number, seed = 1, assets: Record<string, string> = {}) {
    this.width = width;
    this.height = height;
    this.bounds = { left: 0, top: 0, right: width, bottom: height };
    this.camera = new Camera(width, height);
    this.randomSource = makeRandom(seed);
    this.assets = assets;
  }

  random(min = 0, max = 1): number {
    return min + this.randomSource() * (max - min);
  }

  circle(options: BodyOptions = {}): Body {
    const body = new Body(`body-${this.nextObjectId++}`, 'circle', options);
    this.objects.push(body);
    return body;
  }

  rectangle(options: BodyOptions = {}): Body {
    const body = new Body(`body-${this.nextObjectId++}`, 'rectangle', options);
    this.objects.push(body);
    return body;
  }

  sprite(options: BodyOptions & { asset: string }): Body {
    const body = new Body(`body-${this.nextObjectId++}`, 'sprite', { ...options, asset: this.assets[options.asset] || options.asset });
    this.objects.push(body);
    return body;
  }

  text(options: BodyOptions & { text: string }): Body {
    const body = new Body(`body-${this.nextObjectId++}`, 'text', options);
    this.objects.push(body);
    return body;
  }

  asset(path: string): string {
    const value = this.assets[path];
    if (!value) throw new Error(`Asset not found: ${path}`);
    return value;
  }

  hasAsset(path: string): boolean { return Boolean(this.assets[path]); }

  playSound(path: string, options: SoundOptions = {}): string {
    const id = `sound-${this.nextSoundId++}`;
    this.audioQueue.push({
      id,
      source: this.asset(path),
      volume: Math.max(0, Math.min(1, Number(options.volume ?? 1))),
      rate: Math.max(0.25, Math.min(4, Number(options.rate ?? 1))),
      loop: Boolean(options.loop),
      pan: Math.max(-1, Math.min(1, Number(options.pan ?? 0)))
    });
    return id;
  }

  drainAudio(): AudioCommand[] {
    const commands = this.audioQueue;
    this.audioQueue = [];
    return commands;
  }

  remove(target: Body | string): boolean {
    const index = this.objects.findIndex((body) => body === target || body.id === target || body.name === target);
    if (index < 0) return false;
    this.objects.splice(index, 1);
    return true;
  }

  find(idOrName: string): Body | undefined {
    return this.objects.find((body) => body.id === idOrName || body.name === idOrName);
  }

  tagged(tag: string): Body[] { return this.objects.filter((body) => body.hasTag(tag) && !body.destroyed); }

  overlaps(first: Body, second: Body): boolean {
    const a = this.bodyBounds(first); const b = this.bodyBounds(second);
    return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
  }

  queryPoint(x: number, y: number): Body[] {
    return this.objects.filter((body) => {
      if (body.destroyed) return false;
      if (body.kind === 'circle') return Math.hypot(x - body.position.x, y - body.position.y) <= body.radius;
      const bounds = this.bodyBounds(body);
      return x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom;
    });
  }

  queryBounds(bounds: Bounds): Body[] {
    return this.objects.filter((body) => {
      const bodyBounds = this.bodyBounds(body);
      return !body.destroyed && bodyBounds.left < bounds.right && bodyBounds.right > bounds.left && bodyBounds.top < bounds.bottom && bodyBounds.bottom > bounds.top;
    });
  }

  private bodyBounds(body: Body): Bounds {
    const rx = body.kind === 'circle' ? body.radius : body.width / 2;
    const ry = body.kind === 'circle' ? body.radius : body.height / 2;
    return { left: body.position.x - rx, top: body.position.y - ry, right: body.position.x + rx, bottom: body.position.y + ry };
  }

  updateInput(pointer?: Partial<WorldInput['pointer']>, key?: string, pressed?: boolean): void {
    if (pointer) {
      const next = pointer.x == null || pointer.y == null
        ? pointer
        : { ...pointer, ...this.camera.screenToWorld({ x: pointer.x, y: pointer.y }) };
      Object.assign(this.input.pointer, next);
    }
    if (key) { if (pressed) this.input.keys.add(key); else this.input.keys.delete(key); }
  }

  clear(): void { this.objects.length = 0; }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.bounds.right = width;
    this.bounds.bottom = height;
    this.camera.resize(width, height);
  }

  advance(dt: number): void {
    for (const body of this.objects) {
      body.collisions.clear();
      if (!body.active || body.destroyed) continue;
      if (body.trailLength) {
        body.trail.push({ x: body.position.x, y: body.position.y });
        if (body.trail.length > body.trailLength) body.trail.shift();
      }
      body.position.x += body.velocity.x * dt;
      body.position.y += body.velocity.y * dt;
      if (body.bounce) body.bounceInside(this.bounds);
    }
    this.objects = this.objects.filter((body) => !body.destroyed);
  }
}
