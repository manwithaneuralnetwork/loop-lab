import { describe, expect, it } from 'vitest';
import { World } from './world';

describe('World', () => {
  it('produces a deterministic random sequence for a seed', () => {
    const first = new World(100, 100, 42);
    const second = new World(100, 100, 42);
    expect([first.random(), first.random(), first.random()]).toEqual([
      second.random(), second.random(), second.random()
    ]);
  });

  it('advances bodies and resolves a boundary bounce', () => {
    const world = new World(100, 100);
    const ball = world.circle({ x: 94, y: 50, vx: 20, radius: 5, bounce: true, restitution: 0.5 });
    world.advance(0.1);
    expect(ball.position.x).toBe(95);
    expect(ball.velocity.x).toBe(-10);
  });

  it('updates world dimensions without discarding objects', () => {
    const world = new World(100, 100);
    world.circle();
    world.resize(320, 180);
    expect(world.bounds).toEqual({ left: 0, top: 0, right: 320, bottom: 180 });
    expect(world.objects).toHaveLength(1);
  });

  it('creates sprites and text while resolving project assets', () => {
    const world = new World(100, 100, 1, { 'assets/star.png': 'data:image/png;base64,abc' });
    const sprite = world.sprite({ asset: 'assets/star.png', width: 24, height: 24 });
    const label = world.text({ text: 'Score', fontSize: 18 });
    expect(sprite.asset).toBe('data:image/png;base64,abc');
    expect(label.text).toBe('Score');
    expect(() => world.asset('assets/missing.png')).toThrow(/Asset not found/);
  });

  it('tracks pointer and keyboard input', () => {
    const world = new World(100, 100);
    world.updateInput({ x: 20, y: 30, down: true });
    world.updateInput(undefined, 'ArrowLeft', true);
    expect(world.input.pointer).toEqual({ x: 20, y: 30, down: true });
    expect(world.input.keys.has('ArrowLeft')).toBe(true);
    world.updateInput(undefined, 'ArrowLeft', false);
    expect(world.input.keys.has('ArrowLeft')).toBe(false);
  });
});
