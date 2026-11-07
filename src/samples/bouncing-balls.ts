export const BOUNCING_BALLS_CODE = `// Loop Lab — Bouncing Balls
// Edit a value or behavior, then click Run code.

import { spawnBalls } from "./helpers.js";

export const parameters = {
  seed:        { value: 42, min: 1, max: 999, step: 1, group: "Simulation" },
  count:       { value: 14, min: 1, max: 50, step: 1, group: "Simulation" },
  gravity:     { value: 520, min: 0, max: 1200, step: 10, group: "Physics" },
  restitution: { value: 0.88, min: 0.2, max: 1, step: 0.01, group: "Physics" },
  speed:       { value: 1, min: 0.25, max: 2, step: 0.05, group: "Physics" },
  trails:      { value: true, group: "Appearance" },
  ballColor:   { value: "#ff6b2c", type: "color", group: "Appearance" },
  collisionVolume: { value: 0.28, min: 0, max: 1, step: 0.05, group: "Audio" }
};

export function setup(world, params) {
  world.background = "#121315";
  spawnBalls(world, params);
  world.text({ x: world.width / 2, y: 28, text: "CLICK TO ATTRACT", color: "#747a82", fontSize: 13 });
}

export function update(world, dt, params) {
  for (const ball of world.objects) {
    if (ball.kind !== "circle") continue;
    if (ball.hit("bottom") && world.hasAsset("assets/collision.mp3")) {
      world.playSound("assets/collision.mp3", {
        volume: params.collisionVolume,
        rate: world.random(0.92, 1.08),
        pan: (ball.position.x / world.width) * 2 - 1
      });
    }
    ball.velocity.y += params.gravity * dt;
    ball.restitution = params.restitution;
    if (world.input.pointer.down) {
      ball.velocity.x += (world.input.pointer.x - ball.position.x) * dt * 1.8;
      ball.velocity.y += (world.input.pointer.y - ball.position.y) * dt * 1.8;
    }
  }
}`;

export const BOUNCING_BALLS_HELPERS = `export function spawnBalls(world, params) {
  for (let i = 0; i < params.count; i++) {
    world.circle({
      x: world.random(30, world.width - 30),
      y: world.random(50, world.height * 0.48),
      radius: world.random(7, 15),
      color: i % 5 === 0 ? "#f4f3ef" : params.ballColor,
      vx: world.random(-170, 170) * params.speed,
      vy: world.random(-40, 80) * params.speed,
      bounce: true,
      trail: params.trails ? 18 : 0
    });
  }
}`;
