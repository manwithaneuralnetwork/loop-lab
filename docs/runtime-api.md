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

Simulation lifetime is code-owned. Call `world.finish(reason)` when a goal, failure state, score, object count, or any other condition completes the simulation:

```js
export function update(world) {
  if (world.tagged("target").length === 0) world.finish("All targets cleared");
}
```

`world.elapsed` and `world.frame` are available when time is part of that condition, but a `duration` parameter has no special engine behavior. The export dialog runs the project without drawing or audio when it opens and after render settings change, then shows both the exact frame where `world.finish()` is called and the preflight's wall-clock cost. Edits are debounced and stale preflight workers are cancelled. A project that cannot finish within 60 simulated seconds is rejected rather than producing a truncated video.

## Export bots

Interactive projects that read `world.input` must include a root `bot.js` before video export is allowed. During export, its `update(world, dt, params)` runs before the simulation update on every fixed step. The **Bot** control beside the viewport switches preview to the same provider: the runtime ignores live pointer and keyboard messages and lets `bot.js` supply all input. Switching it off restores live user input.

Games should expose a narrow automation boundary instead of asking bots to know internal object names:

```js
// simulation.js
export function readBotState(world) { return { ballX: world.game.ball.position.x }; }
export function applyBotInput(world, input) { world.game.botPaddleX = input.paddleX; }

// bot.js
import { readBotState, applyBotInput } from "./simulation.js";
export function update(world) {
  const state = readBotState(world);
  applyBotInput(world, { paddleX: state.ballX });
}
```

This keeps exported video deterministic and makes the bot reusable by preview, later replay, testing, and evaluation tools.

## World

- `world.width`, `world.height`, and `world.bounds`
- `world.objects`
- `world.random(min, max)` — deterministic seeded random numbers
- `world.circle(options)`
- `world.rectangle(options)`
- `world.sprite({ asset, x, y, width, height, rotation, opacity })`
- `world.text({ text, x, y, fontSize, font, color, align })`
- `world.asset(path)` — resolves an imported asset to its local data URL
- `world.hasAsset(path)` — checks whether an optional asset exists
- `world.remove(bodyOrId)`, `body.destroy()` — immediate or deferred removal
- `world.find(idOrName)`, `world.tagged(tag)` — object lookup
- `world.overlaps(a, b)`, `world.queryPoint(x, y)`, `world.queryBounds(bounds)`
- `world.playSound(path, { volume, rate, pan, loop })` — preview audio
- `world.clear()`

All renderable objects expose a stable `id`, plus `position`, `velocity`, `color`, `rotation`, `opacity`, `name`, `layer`, `visible`, `active`, and `tags`. Circles and rectangles may set `bounce`, `restitution`, and `trail`. `body.hit("bottom")` and the other boundary names report the previous fixed step's boundary contact.

Circles and axis-aligned rectangles collide with one another by default. Set `static: true` for immovable walls, `mass` to override area-based mass, or `collidable: false` for decorative shapes. `body.touches(other)` reports object contact during the previous fixed step. Loop Lab resolves these lightweight collisions internally without requiring a physics dependency; rotated collision shapes and constraints remain outside this solver.

Objects render from the lowest layer to the highest. Insertion order is preserved inside a layer.

## Camera

The camera defaults to the world origin at 1× zoom. Pointer coordinates remain in world space while the camera moves:

```js
world.camera.zoom = 1.5;
world.camera.centerOn(player.position.x, player.position.y);
```

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

Sprites are preloaded before video export begins. Imported audio can be triggered from deterministic simulation events:

```js
if (ball.hit("bottom") && world.hasAsset("assets/collision.mp3")) {
  world.playSound("assets/collision.mp3", { volume: 0.3, pan: 0 });
}
```

The transport bar controls preview mute and master volume. Browsers require a Run, Play, or viewport click before audio starts. The mixer allows up to 32 simultaneous voices per sound and 64 for the project, normalizes dense repeats, then runs the mix through a fast compressor and a soft-clipped ceiling of approximately −9.8 dBFS. Playing voices are never stolen or truncated; only excess new voices are declined under pathological load. Timing is preserved without a collision cooldown.

Local WebM exports include project audio through an Opus track when the browser supports it. The export renderer uses the same voice management and output limiter as the live preview.
