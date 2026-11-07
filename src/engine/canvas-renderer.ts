import type { World } from './world';

export class CanvasRenderer {
  private readonly context: OffscreenCanvasRenderingContext2D;
  private pixelWidth = 1;
  private pixelHeight = 1;

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
    ctx.setTransform(this.pixelWidth / world.width, 0, 0, this.pixelHeight / world.height, 0, 0);
    ctx.fillStyle = world.background;
    ctx.fillRect(0, 0, world.width, world.height);
    for (const body of world.objects) {
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
      if (body.kind === 'circle') {
        ctx.beginPath();
        ctx.arc(body.position.x, body.position.y, body.radius, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillRect(
          body.position.x - body.width / 2,
          body.position.y - body.height / 2,
          body.width,
          body.height
        );
      }
    }
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
}
