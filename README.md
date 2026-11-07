# Loop Lab

Loop Lab is a browser-based creative studio for building programmable 2D games, simulations, and visual experiments.

The current repository contains the approved workspace shell and the first engine vertical slice: editable JavaScript runs in a sandboxed Web Worker, renders to an `OffscreenCanvas`, exposes code-declared parameters in the UI, and supports deterministic playback controls.

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

See `handoff.md` for the product brief and longer-term scope.
