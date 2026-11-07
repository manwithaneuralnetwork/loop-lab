export interface Point { x: number; y: number }
export interface Bounds { left: number; top: number; right: number; bottom: number }

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
}

export interface WorldInput {
  pointer: { x: number; y: number; down: boolean };
  keys: Set<string>;
}

export class Body {
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

  constructor(kind: 'circle' | 'rectangle' | 'sprite' | 'text', options: BodyOptions = {}) {
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
  }

  bounceInside(bounds: Bounds, restitution = this.restitution): void {
    const rx = this.kind === 'circle' ? this.radius : this.width / 2;
    const ry = this.kind === 'circle' ? this.radius : this.height / 2;
    if (this.position.x - rx < bounds.left) {
      this.position.x = bounds.left + rx;
      this.velocity.x = Math.abs(this.velocity.x) * restitution;
    }
    if (this.position.x + rx > bounds.right) {
      this.position.x = bounds.right - rx;
      this.velocity.x = -Math.abs(this.velocity.x) * restitution;
    }
    if (this.position.y - ry < bounds.top) {
      this.position.y = bounds.top + ry;
      this.velocity.y = Math.abs(this.velocity.y) * restitution;
    }
    if (this.position.y + ry > bounds.bottom) {
      this.position.y = bounds.bottom - ry;
      this.velocity.y = -Math.abs(this.velocity.y) * restitution;
    }
  }
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
  readonly input: WorldInput = { pointer: { x: 0, y: 0, down: false }, keys: new Set() };
  private randomSource: () => number;
  private readonly assets: Record<string, string>;

  constructor(width: number, height: number, seed = 1, assets: Record<string, string> = {}) {
    this.width = width;
    this.height = height;
    this.bounds = { left: 0, top: 0, right: width, bottom: height };
    this.randomSource = makeRandom(seed);
    this.assets = assets;
  }

  random(min = 0, max = 1): number {
    return min + this.randomSource() * (max - min);
  }

  circle(options: BodyOptions = {}): Body {
    const body = new Body('circle', options);
    this.objects.push(body);
    return body;
  }

  rectangle(options: BodyOptions = {}): Body {
    const body = new Body('rectangle', options);
    this.objects.push(body);
    return body;
  }

  sprite(options: BodyOptions & { asset: string }): Body {
    const body = new Body('sprite', { ...options, asset: this.assets[options.asset] || options.asset });
    this.objects.push(body);
    return body;
  }

  text(options: BodyOptions & { text: string }): Body {
    const body = new Body('text', options);
    this.objects.push(body);
    return body;
  }

  asset(path: string): string {
    const value = this.assets[path];
    if (!value) throw new Error(`Asset not found: ${path}`);
    return value;
  }

  updateInput(pointer?: Partial<WorldInput['pointer']>, key?: string, pressed?: boolean): void {
    if (pointer) Object.assign(this.input.pointer, pointer);
    if (key) { if (pressed) this.input.keys.add(key); else this.input.keys.delete(key); }
  }

  clear(): void { this.objects.length = 0; }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.bounds.right = width;
    this.bounds.bottom = height;
  }

  advance(dt: number): void {
    for (const body of this.objects) {
      if (body.trailLength) {
        body.trail.push({ x: body.position.x, y: body.position.y });
        if (body.trail.length > body.trailLength) body.trail.shift();
      }
      body.position.x += body.velocity.x * dt;
      body.position.y += body.velocity.y * dt;
      if (body.bounce) body.bounceInside(this.bounds);
    }
  }
}
