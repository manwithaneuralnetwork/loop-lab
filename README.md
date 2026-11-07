# Loop Lab

Loop Lab is a browser-based creative studio for building programmable 2D games, simulations, and visual experiments.

The current repository contains the approved workspace shell and the first engine vertical slice: JavaScript edited in CodeMirror runs in a disposable Web Worker, renders to an `OffscreenCanvas`, exposes code-declared parameters in the UI, and supports deterministic playback controls. Complete projects and imported assets autosave to IndexedDB with rotating recovery checkpoints.

The implementation is split into typed boundaries:

- `src/engine/` owns world state, parameter normalization, simulation lifecycle, rendering, and the worker protocol.
- `src/runtime-bridge.ts` is the browser host boundary for creating and replacing the worker.
- `src/main.ts` coordinates workspace UI state without owning engine behavior.
- `src/project-store.ts`, `src/code-editor.ts`, and `src/samples/` keep storage, editing, and starter code independent.

Video export is local-only in this version. The export dialog snapshots the current code and parameter values, supports per-export overrides and randomized creative parameters, and renders deterministic WebM video in a separate worker. Output can use 24, 30, or 60 fps with 720p, 1080p, or original-size bounds; no project or cloud data is involved.

The workspace now persists multiple code files, folders, imported assets, open tabs, and export history. `simulation.js` is the protected runtime entry file, and relative modules can import one another with standard JavaScript syntax. Preview controls support deterministic seeking, 0.25×–4× playback, stepping, pointer/keyboard input, runtime status, fullscreen presentation, and master audio controls. The engine now renders circles, rectangles, text, and imported-image sprites, with stable object identities, lifecycle helpers, render layers, a camera, spatial queries, boundary-hit events, and Web Audio playback for imported sounds. WebM exports offer naming, 720p/1080p/original bounds, 24/30/60 fps, asset preloading, progress/ETA, and cancellation. See [`docs/runtime-api.md`](docs/runtime-api.md) for the programming model.

## Rendering and physics roadmap

Loop Lab currently uses its own small Canvas 2D renderer. **PixiJS is not planned as a default dependency.** The present renderer matches the intended project scale; PixiJS will only be reconsidered if real profiling shows that sprite count, filters, or batching have become a concrete limitation.

**Matter.js is not currently installed.** It is on the evaluation list as an optional rigid-body physics backend, not a default dependency. The present lightweight body and boundary helpers are sufficient for simple simulations. Matter.js should be added when we commit to rotation, constraints, compound bodies, and robust collision solving, ideally behind an opt-in `@loop/physics` adapter.

## Project durability

Projects are saved in IndexedDB rather than browser key/value storage, allowing substantially larger imported assets. Autosave keeps up to ten rotating recovery checkpoints, and users can create explicit checkpoints from the Explorer menu. Complete projects can be downloaded and reopened as readable, versioned `.looplab` JSON packages. See [`docs/project-packages.md`](docs/project-packages.md).

## Local development

```bash
npm install
npm run dev
```

Then open the local URL printed by Vite.

## Validation

```bash
npm run build
```

Run unit tests with:

```bash
npm test
```

Run type checking, tests, and the production build together with:

```bash
npm run check
```

See `handoff.md` for the product brief and longer-term scope.
