# Loop Lab

Loop Lab is a browser-based creative studio for building programmable 2D games, simulations, and visual experiments.

The current repository contains the approved workspace shell and the first engine vertical slice: JavaScript edited in CodeMirror runs in a disposable Web Worker, renders to an `OffscreenCanvas`, exposes code-declared parameters in the UI, and supports deterministic playback controls. Project code and parameter overrides autosave locally between sessions.

The implementation is split into typed boundaries:

- `src/engine/` owns world state, parameter normalization, simulation lifecycle, rendering, and the worker protocol.
- `src/runtime-bridge.ts` is the browser host boundary for creating and replacing the worker.
- `src/main.ts` coordinates workspace UI state without owning engine behavior.
- `src/project-store.ts`, `src/code-editor.ts`, and `src/samples/` keep storage, editing, and starter code independent.

Video export is local-only in this version. The export dialog snapshots the current code and parameter values, supports per-export overrides and randomized creative parameters, and renders deterministic WebM video in a separate worker. Output can use 24, 30, or 60 fps with 720p, 1080p, or original-size bounds; no project or cloud data is involved.

The workspace now persists multiple code files, folders, imported assets, open tabs, and export history. `simulation.js` is the protected runtime entry file; cross-file JavaScript imports are intentionally deferred until a project bundler is introduced. Preview controls support deterministic seeking, 0.25×–4× playback, stepping, runtime status, and fullscreen presentation. WebM exports offer naming, 720p/1080p/original bounds, 24/30/60 fps, progress/ETA, and cancellation.

## Rendering and physics roadmap

Loop Lab currently uses its own small Canvas 2D renderer. **PixiJS is not integrated yet.** Before adding image/sprite APIs, we will evaluate adopting PixiJS as the rendering backend; the engine-facing API should remain Loop Lab’s so projects are not coupled directly to PixiJS.

**Matter.js is not currently installed.** It is on the evaluation list as an optional rigid-body physics backend, not a default dependency. The present lightweight body and boundary helpers are sufficient for simple simulations. Matter.js should be added when we commit to rotation, constraints, compound bodies, and robust collision solving, ideally behind an opt-in `@loop/physics` adapter.

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
