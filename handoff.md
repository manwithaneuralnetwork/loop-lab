# Loop Lab — Project Handoff for Codex

## 1. Project Overview

**Project name:** Loop Lab

**Concept:** A web-based creative studio where users build, run, customize, and record programmable 2D games, simulations, and visual experiments.

The platform specializes in autonomous, visually engaging simulations that can run continuously or restart automatically. Users can turn these simulations into videos and eventually automate their publication to platforms such as YouTube.

Loop Lab should feel like a creative playground for programmers, artists, hobbyists, and experimenters — not a conventional video editor or generic AI content generator.

**Core philosophy: Build little worlds. Set them in motion.**

## 2. Example Use Cases

The engine should eventually support a wide range of projects, including:

- A Snake game controlled by a programmed bot, restarting automatically after death.
- Bouncing balls inside a rotating circle, with balls multiplying whenever one escapes.
- Physics experiments with collisions, gravity, particles, and synchronized sound effects.
- Neural networks learning to recognize handwritten digits, with visualized training progress.
- Genetic algorithms learning to navigate obstacle courses.
- Procedurally generated visual experiments with randomized parameters.

These examples should inform the engine's flexibility. We are not building a collection of hardcoded simulation templates.

## 3. Core Product Features

### Programmable 2D engine

Users should be able to write JavaScript to define simulation behavior, game rules, and rendering.

The engine should support:

- A consistent simulation lifecycle.
- 2D graphics and animations.
- Physics and collision handling.
- Particles and visual effects.
- Sound effects and audio synchronization.
- Programmable agents and bots.
- Configurable simulation parameters.
- Restarting and looping simulations.
- Seeded randomness and reproducible behavior where practical.

Prefer proven libraries over implementing rendering and physics from scratch. PixiJS and Matter.js are candidates, but evaluate alternatives before committing.

### Browser-based creation environment

Users should eventually have access to:

- A code editor with syntax highlighting.
- A live simulation preview.
- Play, pause, restart, and speed controls.
- Simulation settings and exposed parameters.
- A project gallery or dashboard.
- Video export settings.

Prioritize a code-first workflow initially. A sophisticated drag-and-drop editor is not required for the MVP.

### Video generation

This is a central product capability.

Users should be able to export their simulations as videos, ideally with configurable resolution, frame rate, and duration.

Design the engine to support fixed-timestep simulation, with simulation logic separated from rendering.

Explore deterministic, offline rendering so videos can potentially be generated faster than real time.

Audio should remain synchronized with the exported video.

### Automated publishing — future phase

Users will eventually be able to connect their YouTube accounts through OAuth.

They should be able to configure schedules for automatically generating and publishing videos, including randomized publication intervals.

Support cycling between multiple simulations and generating variations using configurable parameters.

Lower subscription tiers may offer downloadable videos, while higher tiers may include automated publishing.

Consider YouTube API quotas, verification, security, and platform policies.

**Do not implement YouTube integration in the initial MVP.**

### Cloud rendering — future phase

The platform should eventually support backend rendering jobs that run without requiring the user's browser to remain open.

Potential technologies include Google Cloud Run, Cloud Storage, job queues, and FFmpeg.

The founder currently has $300 in Google Cloud credits available for experimentation, but infrastructure should remain economical and avoid unnecessary ongoing costs.

Consider resource limits, isolated execution, retry handling, and usage metering.

### MCP integration — future phase

An MCP server should eventually allow coding agents such as Codex to create, modify, preview, and test Loop Lab simulations.

Possible operations include creating projects, inspecting engine documentation, editing scripts, running simulations, capturing previews, and requesting video exports.

Design the engine and project format to be accessible programmatically, so MCP can be added without redesigning the entire application.

## 4. MVP Scope

The first milestone is deliberately narrow:

**A user can write a JavaScript simulation, preview it in the browser, and export a playable video of the result.**

For the MVP, prioritize:

1. A clean browser-based coding environment.
2. A reusable 2D simulation engine.
3. A live preview with basic playback controls.
4. A reliable video export pipeline.
5. Two or three polished example simulations demonstrating the engine's capabilities.

Suggested examples:

- Bouncing balls with colorful trails and collision effects.
- Snake controlled by a simple autonomous bot.
- A rotating enclosure with increasingly many bouncing objects.

Do not prematurely build subscriptions, user accounts, public project publishing, YouTube integration, distributed rendering, or livestreaming.

Livestreaming is explicitly out of scope for now.

## 5. Engineering Principles

**Separate simulation from rendering.** A simulation should be able to advance independently of real-time browser animation.

**Keep the engine general-purpose.** Avoid hardcoding behaviors that only work for the initial example projects.

**Treat user-authored code as untrusted.** Plan for isolated execution, resource limits, and safe communication between the editor and simulation runtime.

**Prioritize reproducibility.** Fixed timesteps and seeded randomness should be considered early.

**Keep exports consistent with previews.** The same simulation should produce equivalent results in interactive and offline modes, subject to documented limitations.

**Avoid unnecessary complexity.** Start with a local/browser-based implementation and introduce cloud services only when they solve an actual requirement.

**Build for extensibility without overengineering.** Prefer simple, documented interfaces and modular components.

## 6. Design Direction

Loop Lab should have a distinctive, polished visual identity.

The name should inspire the design: experimentation, motion, loops, playfulness, and creativity.

The product should feel welcoming and expressive, while still being a serious tool for programming and building simulations.

Avoid generic AI startup aesthetics, excessive gradients, arbitrary glassmorphism, and cluttered dashboards.

Favor:

- A strong, recognizable visual identity.
- Excellent typography.
- Clear editor and preview layouts.
- Thoughtful motion and microinteractions.
- A restrained, deliberate color palette.
- Simulations as the visual centerpiece.

Do not generate a complete UI before establishing a design direction.

Present a small design system and proposed editor layout for review before implementing substantial frontend UI.

## 7. Product and Business Direction

Loop Lab may eventually become a subscription service.

Possible monetization dimensions include:

- Monthly rendering credits.
- Export resolution and duration.
- Cloud rendering capacity.
- Automated publishing limits.
- Scheduled simulation runs.

These are exploratory ideas, not finalized requirements.

The product should not promise YouTube monetization or passive income. Its value proposition is creative freedom, programmable simulations, and convenient video production.

## 8. Immediate Instructions for Codex

**Do not begin implementing the application yet.**

First:

1. Inspect the current repository and development environment.
2. Propose a practical technology stack for the MVP, explaining major tradeoffs.
3. Propose the simulation engine architecture, including its lifecycle, rendering interface, scripting environment, and export pipeline.
4. Identify the hardest technical risks and recommend small proof-of-concept tests.
5. Propose a minimal project structure.
6. Outline a phased implementation plan with clear, testable milestones.
7. Suggest a visual design direction and how we should establish a design system before building the frontend.

Distinguish between decisions that must be made immediately and those that can be deferred.

Ask for clarification only where a decision would materially affect the architecture or implementation.

**Wait for my approval of the plan before writing application code.**

The goal is not to generate a large application as quickly as possible. The goal is to build a technically sound, polished, extensible creative tool through deliberate iteration.