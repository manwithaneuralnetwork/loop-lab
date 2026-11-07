import type { World } from './world';

export class CanvasRenderer {
  private readonly context: OffscreenCanvasRenderingContext2D;
  private pixelWidth = 1;
  private pixelHeight = 1;
  private readonly images = new Map<string, ImageBitmap | Promise<ImageBitmap>>();

  private loadImage(source: string): Promise<ImageBitmap> {
    const cached = this.images.get(source);
    if (cached instanceof ImageBitmap) return Promise.resolve(cached);
    if (cached) return cached;
    const loading = fetch(source).then((response) => response.blob()).then((blob) => createImageBitmap(blob));
    this.images.set(source, loading);
    void loading.then((bitmap) => this.images.set(source, bitmap)).catch(() => this.images.delete(source));
    return loading;
  }

  private image(source: string): ImageBitmap | null {
    if (!source) return null;
    const cached = this.images.get(source);
    if (cached instanceof ImageBitmap) return cached;
    if (!cached) void this.loadImage(source);
    return null;
  }

  async preload(world: World): Promise<void> {
    const sources = [...new Set(world.objects.filter((body) => body.kind === 'sprite' && body.asset).map((body) => body.asset))];
    await Promise.all(sources.map((source) => this.loadImage(source)));
  }

  constructor(private readonly canvas: OffscreenCanvas) {
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas 2D is unavailable.');
    this.context = context;
  }

  resize(width: number, height: number): void {
    this.canvas.width = width;
    this.canvas.height = height;
    this.pixelWidth = width;
    this.pixelHeight = height;
  }

  render(world: World): void {
    const ctx = this.context;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.pixelWidth, this.pixelHeight);
    ctx.fillStyle = world.background;
    ctx.fillRect(0, 0, this.pixelWidth, this.pixelHeight);
    const scaleX = this.pixelWidth / world.width;
    const scaleY = this.pixelHeight / world.height;
    ctx.setTransform(scaleX * world.camera.zoom, 0, 0, scaleY * world.camera.zoom, -world.camera.x * scaleX * world.camera.zoom, -world.camera.y * scaleY * world.camera.zoom);
    const objects = world.objects.filter((body) => body.visible && !body.destroyed).map((body, index) => ({ body, index })).sort((a, b) => a.body.layer - b.body.layer || a.index - b.index);
    for (const { body } of objects) {
      if (body.trail.length) {
        body.trail.forEach((point, index) => {
          ctx.globalAlpha = ((index + 1) / body.trail.length) * 0.23;
          ctx.fillStyle = body.color;
          ctx.beginPath();
          ctx.arc(point.x, point.y, Math.max(1, body.radius * 0.42), 0, Math.PI * 2);
          ctx.fill();
        });
        ctx.globalAlpha = 1;
      }
      ctx.shadowColor = body.color;
      ctx.shadowBlur = 13;
      ctx.fillStyle = body.color;
      ctx.save();
      ctx.translate(body.position.x, body.position.y);
      ctx.rotate(body.rotation);
      ctx.globalAlpha = body.opacity;
      if (body.kind === 'circle') {
        ctx.beginPath();
        ctx.arc(0, 0, body.radius, 0, Math.PI * 2);
        ctx.fill();
      } else if (body.kind === 'rectangle') {
        ctx.fillRect(-body.width / 2, -body.height / 2, body.width, body.height);
      } else if (body.kind === 'sprite') {
        ctx.shadowBlur = 0;
        const bitmap = this.image(body.asset);
        if (bitmap) ctx.drawImage(bitmap, -body.width / 2, -body.height / 2, body.width, body.height);
        else { ctx.globalAlpha *= .2; ctx.fillRect(-body.width / 2, -body.height / 2, body.width, body.height); }
      } else if (body.kind === 'text') {
        ctx.font = `${body.fontSize}px ${body.font}`;
        ctx.textAlign = body.align;
        ctx.textBaseline = 'middle';
        ctx.fillText(body.text, 0, 0);
      }
      ctx.restore();
    }
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
}
