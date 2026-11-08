# Loop Lab

Loop Lab is a browser-based creative studio for building programmable 2D games, simulations, and visual experiments.

The current repository contains the approved workspace shell and the first engine vertical slice: JavaScript edited in CodeMirror runs in a disposable Web Worker, renders to an `OffscreenCanvas`, exposes code-declared parameters in the UI, and supports deterministic playback controls. Complete projects and imported assets autosave to IndexedDB with rotating recovery checkpoints.

The implementation is split into typed boundaries:

- `src/engine/` owns world state, parameter normalization, simulation lifecycle, rendering, and the worker protocol.
- `src/runtime-bridge.ts` is the browser host boundary for creating and replacing the worker.
- `src/main.ts` coordinates workspace UI state without owning engine behavior.
- `src/project-store.ts`, `src/code-editor.ts`, and `src/samples/` keep storage, editing, and starter code independent.

Video export is local-only in this version. The export dialog snapshots the current code and parameter values, supports per-export overrides and randomized creative parameters, and renders deterministic WebM video with project audio in a separate worker. Interactive projects must provide `bot.js`; export runs the bot before each simulation step so recorded input is deterministic. Output can use 24, 30, or 60 fps with 720p, 1080p, or original-size bounds; no project or cloud data is involved.

The workspace now has a multi-project dashboard with creation, three starter templates, duplication, and project switching. Each project persists multiple code files, folders, imported assets, open tabs, parameter overrides, preview input mode, and export history. `simulation.js` is the protected runtime entry file, and relative modules can import one another with standard JavaScript syntax. The editor provides Loop Lab API completion, hover documentation, project-aware diagnostics, and search. Preview controls support deterministic seeking, 0.25×–4× playback, stepping, switchable human/`bot.js` input, runtime status, fullscreen presentation, limited master audio, and a live one-second performance profile. The engine now renders circles, rectangles, text, and imported-image sprites, with code-defined completion conditions, stable object identities, lifecycle helpers, render layers, a camera, spatial queries, boundary and object-contact events, lightweight circle/rectangle collision response, and Web Audio playback for imported sounds. WebM export first runs a graphics-free simulation preflight to find the exact completion frame and blocks simulations that do not finish within 60 simulated seconds. It then offers naming, 720p/1080p/original bounds, 24/30/60 fps, audio and asset preloading, progress/ETA, and cancellation. See [`docs/runtime-api.md`](docs/runtime-api.md) for the programming model.

## Rendering and physics roadmap

Loop Lab currently uses its own small Canvas 2D renderer. **PixiJS is not planned as a default dependency.** The present renderer matches the intended project scale; PixiJS will only be reconsidered if real profiling shows that sprite count, filters, or batching have become a concrete limitation.

**Matter.js is not currently installed.** It is on the evaluation list as an optional rigid-body physics backend, not a default dependency. The present lightweight body and boundary helpers are sufficient for simple simulations. Matter.js should be added when we commit to rotation, constraints, compound bodies, and robust collision solving, ideally behind an opt-in `@loop/physics` adapter.

## Project durability

Projects are saved in IndexedDB rather than browser key/value storage, allowing substantially larger imported assets. Autosave keeps up to ten rotating recovery checkpoints, and users can create explicit checkpoints from the Explorer menu. Complete projects can be downloaded and reopened as readable, versioned `.looplab` JSON packages. See [`docs/project-packages.md`](docs/project-packages.md).

Local development additionally uses versioned project directories under `projects/`. Their manifests share the browser project schema while code and assets remain ordinary files, making projects easy to edit, test, commit, and later migrate to a database-backed repository.

## Runtime safety

The default sandbox caps a simulation at 5,000 live objects, 600 trail samples per object, and 256 audio events per frame. Imported files are capped at 25 MB each and 100 MB per import. A host-side watchdog replaces a worker whose update blocks for more than three seconds; export preflight has a five-second CPU ceiling and a 60-second simulated-time ceiling. The Preview header reports measured fps, object count, average update/render time, and long frames without adding work to the simulation worker's hot path.

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
