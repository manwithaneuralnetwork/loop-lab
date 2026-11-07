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
});
