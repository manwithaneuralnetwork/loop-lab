# Loop Lab runtime API

Loop Lab projects execute `simulation.js` as their entry module. Relative JavaScript and TypeScript-style module paths can be split across project files:

```js
// simulation.js
import { createPlayer } from "./player.js";

export function setup(world) {
  createPlayer(world);
}
```

Supported module syntax includes named, default, namespace, and side-effect imports plus ordinary named/default exports. Relative paths may omit `.js` or `.ts`. External npm packages are intentionally unavailable until Loop Lab introduces a dependency system.

## Lifecycle

```js
export const parameters = {
  speed: { value: 1, min: 0.25, max: 4, group: "Motion" }
};

export function setup(world, params) {}
export function update(world, dt, params) {}
```

`setup` runs once on start or restart. `update` runs at a fixed 60 Hz simulation step. Preview speed changes how quickly fixed steps are consumed; it does not change `dt`.

## World

- `world.width`, `world.height`, and `world.bounds`
- `world.objects`
- `world.random(min, max)` — deterministic seeded random numbers
- `world.circle(options)`
- `world.rectangle(options)`
- `world.sprite({ asset, x, y, width, height, rotation, opacity })`
- `world.text({ text, x, y, fontSize, font, color, align })`
- `world.asset(path)` — resolves an imported asset to its local data URL
- `world.clear()`

All renderable objects expose `position`, `velocity`, `color`, `rotation`, and `opacity`. Circles and rectangles may set `bounce`, `restitution`, and `trail`.

## Input

Pointer coordinates use world space:

```js
if (world.input.pointer.down) {
  player.position.x = world.input.pointer.x;
  player.position.y = world.input.pointer.y;
}

if (world.input.keys.has("ArrowLeft")) player.velocity.x -= 10;
```

Keyboard input is ignored while the user is typing in the editor or a form control.

## Assets

Imported images and other binary files are stored under their project path. Images can be rendered directly:

```js
world.sprite({
  asset: "assets/player.png",
  x: world.width / 2,
  y: world.height / 2,
  width: 64,
  height: 64
});
```

Sprites are preloaded before video export begins. Audio playback is not part of this runtime slice yet.
