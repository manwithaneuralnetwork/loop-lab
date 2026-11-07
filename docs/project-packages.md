# Project storage and `.looplab` packages

Loop Lab stores the active project in the browser’s IndexedDB database. This includes code, folders, imported asset data, open tabs, parameter overrides, world dimensions, and export history. Existing `localStorage` projects are migrated automatically when no IndexedDB project exists.

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
