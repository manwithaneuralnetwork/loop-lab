import { createProjectState, type ProjectState } from './project-store';
import { BOUNCING_BALLS_CODE, BOUNCING_BALLS_HELPERS } from './samples/bouncing-balls';
import neonBreakoutCode from '../projects/neon-breakout/simulation.js?raw';
import neonBreakoutBot from '../projects/neon-breakout/bot.js?raw';
import particleCascadeCode from '../projects/particle-cascade/simulation.js?raw';

export interface ProjectTemplate {
  id: string;
  name: string;
  description: string;
  accent: string;
  create(projectName: string): ProjectState;
}

export interface StarterProject extends ProjectTemplate { tags: string[] }

const BLANK_CODE = `// A minimal Loop Lab project.
export const parameters = {
  seed: { value: 1, min: 1, max: 999, step: 1, group: "Simulation" }
};

export function setup(world) {
  world.background = "#121315";
}

export function update(world, dt, params) {
  // Build your loop here.
}
`;

const POINTER_CODE = `// Pointer Field — move or press inside the viewport.
export const parameters = {
  count: { value: 80, min: 10, max: 400, step: 10, group: "Simulation" },
  pull: { value: 3.2, min: 0.2, max: 12, step: 0.1, group: "Motion" },
  color: { value: "#ff6b2c", type: "color", group: "Appearance" }
};

export function setup(world, params) {
  world.background = "#121315";
  for (let i = 0; i < params.count; i++) {
    world.circle({
      x: world.random(0, world.width), y: world.random(0, world.height),
      radius: world.random(2, 7), color: params.color,
      vx: world.random(-20, 20), vy: world.random(-20, 20), bounce: true
    });
  }
}

export function update(world, dt, params) {
  for (const dot of world.objects) {
    const dx = world.input.pointer.x - dot.position.x;
    const dy = world.input.pointer.y - dot.position.y;
    const distance = Math.max(40, Math.hypot(dx, dy));
    dot.velocity.x += (dx / distance) * params.pull;
    dot.velocity.y += (dy / distance) * params.pull;
    dot.velocity.x *= 0.992; dot.velocity.y *= 0.992;
  }
}
`;

export const PROJECT_TEMPLATES: ProjectTemplate[] = [
  {
    id: 'blank', name: 'Blank Loop', description: 'A clean canvas with the lifecycle and one exposed parameter.', accent: '#84909f',
    create: (name) => createProjectState(name, BLANK_CODE)
  },
  {
    id: 'bouncing-balls', name: 'Bouncing Balls', description: 'Physics, collisions, trails, parameters, and optional collision audio.', accent: '#ff6b2c',
    create: (name) => createProjectState(name, BOUNCING_BALLS_CODE, [{ path: 'helpers.js', content: BOUNCING_BALLS_HELPERS }])
  },
  {
    id: 'pointer-field', name: 'Pointer Field', description: 'An interactive particle field for testing mouse and touch input.', accent: '#62d6a5',
    create: (name) => createProjectState(name, POINTER_CODE, [], { width: 960, height: 540 })
  }
];

export const STARTER_PROJECTS: StarterProject[] = [
  {
    id: 'neon-breakout-starter', name: 'Neon Breakout',
    description: 'A complete playable game with deterministic physics, bot automation, scoring, effects, and video export.',
    accent: '#ff6b2c', tags: ['Game', 'Bot', 'Export'],
    create: (name) => {
      const project = createProjectState(name, neonBreakoutCode, [{ path: 'bot.js', content: neonBreakoutBot }], { width: 720, height: 960 });
      project.botMode = true; return project;
    }
  },
  {
    id: 'particle-cascade-starter', name: 'Particle Cascade',
    description: 'A polished generative chain reaction with exposed motion, timing, color, and reaction controls.',
    accent: '#62d6a5', tags: ['Generative', 'Particles', 'Export'],
    create: (name) => createProjectState(name, particleCascadeCode, [], { width: 900, height: 900 })
  }
];
