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
    expect(ball.hit('right')).toBe(true);
  });

  it('supports stable lifecycle helpers, tags, and deferred destruction', () => {
    const world = new World(100, 100);
    const player = world.circle({ name: 'player', tags: ['actor'], layer: 2 });
    const wall = world.rectangle({ x: 5, y: 5, width: 20, height: 20, tags: ['solid'] });
    expect(player.id).toBe('body-1');
    expect(world.find('player')).toBe(player);
    expect(world.tagged('solid')).toEqual([wall]);
    expect(world.queryPoint(5, 5)).toContain(wall);
    player.destroy();
    world.advance(0);
    expect(world.objects).toEqual([wall]);
  });

  it('queries overlaps and bounds', () => {
    const world = new World(100, 100);
    const first = world.circle({ x: 20, y: 20, radius: 10 });
    const second = world.rectangle({ x: 28, y: 20, width: 10, height: 10 });
    expect(world.overlaps(first, second)).toBe(true);
    expect(world.queryBounds({ left: 0, top: 0, right: 25, bottom: 25 })).toContain(first);
    expect(world.remove(second.id)).toBe(true);
    expect(world.objects).toEqual([first]);
  });

  it('maps pointer coordinates through the camera', () => {
    const world = new World(200, 100);
    world.camera.zoom = 2;
    world.camera.centerOn(100, 50);
    world.updateInput({ x: 100, y: 50, down: true });
    expect(world.input.pointer).toEqual({ x: 100, y: 50, down: true });
  });

  it('queues resolved audio commands with safe playback values', () => {
    const world = new World(100, 100, 1, { 'assets/hit.mp3': 'data:audio/mpeg;base64,abc' });
    world.playSound('assets/hit.mp3', { volume: 3, rate: 0.1, pan: -2 });
    expect(world.drainAudio()).toEqual([{
      id: 'sound-1', source: 'data:audio/mpeg;base64,abc', volume: 1, rate: 0.25, loop: false, pan: -1
    }]);
    expect(world.drainAudio()).toEqual([]);
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
