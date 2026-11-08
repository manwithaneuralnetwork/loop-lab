# Project storage and `.looplab` packages

Loop Lab stores production/browser projects in IndexedDB. This includes code, folders, imported asset data, open tabs, parameter overrides, world dimensions, and export history. Existing `localStorage` projects are migrated automatically when no IndexedDB project exists.

## Development project directories

During local Vite development, projects under `projects/<slug>/` are the source of truth. Each directory contains a versioned `project.json` manifest, ordinary source files, and ordinary binary assets. The browser hydrates its IndexedDB cache from these directories at startup and writes browser edits back through the development server.

```text
projects/neon-breakout/
  project.json
  simulation.js
  bot.js
  assets/
```

The manifest uses the same `ProjectState` record as IndexedDB and `.looplab` packages, while file contents remain outside the record. A future database adapter can store the manifest as a project row and source/assets as related records or object storage without changing workspace code or runtime messages.

## Recovery

While a project changes, Loop Lab periodically saves the preceding state as a recovery checkpoint. Up to ten checkpoints are retained. The Explorer’s project-actions menu can also create a manual checkpoint or open Recovery history.

Restoring a checkpoint first saves the current project as another checkpoint. This makes recovery reversible.

## Portable packages

“Download project” creates a versioned `.looplab` file containing the complete project. The format is readable JSON:

```json
{
  "format": "loop-lab-project",
  "version": 1,
  "exportedAt": "2026-11-07T16:00:00.000Z",
  "project": {
    "files": [],
    "folders": [],
    "parameterValues": {},
    "worldWidth": 1080,
    "worldHeight": 1080
  }
}
```

Binary assets are represented by their local data URLs, so a package has no external dependencies. Packages are validated before opening, must contain `simulation.js`, cannot contain parent-directory paths, and are limited to 100 MB in the browser UI.

Opening a package shows its file count, asset count, and world dimensions before asking for confirmation. The current project is checkpointed before replacement.
