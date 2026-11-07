# Loop Lab

Loop Lab is a browser-based creative studio for building programmable 2D games, simulations, and visual experiments.

The current repository contains the approved workspace shell and the first engine vertical slice: JavaScript edited in CodeMirror runs in a disposable Web Worker, renders to an `OffscreenCanvas`, exposes code-declared parameters in the UI, and supports deterministic playback controls. Project code and parameter overrides autosave locally between sessions.

The implementation is split into typed boundaries:

- `src/engine/` owns world state, parameter normalization, simulation lifecycle, rendering, and the worker protocol.
- `src/runtime-bridge.ts` is the browser host boundary for creating and replacing the worker.
- `src/main.ts` coordinates workspace UI state without owning engine behavior.
- `src/project-store.ts`, `src/code-editor.ts`, and `src/samples/` keep storage, editing, and starter code independent.

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
