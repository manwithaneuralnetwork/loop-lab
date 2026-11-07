export const BOUNCING_BALLS_CODE = `// Loop Lab — Bouncing Balls
// Edit a value or behavior, then click Run code.

export const parameters = {
  seed:        { value: 42, min: 1, max: 999, step: 1, group: "Simulation" },
  count:       { value: 14, min: 1, max: 50, step: 1, group: "Simulation" },
  duration:    { value: 20, min: 1, max: 120, step: 1, group: "Simulation" },
  autoRestart: { value: true, group: "Simulation" },
  gravity:     { value: 520, min: 0, max: 1200, step: 10, group: "Physics" },
  restitution: { value: 0.88, min: 0.2, max: 1, step: 0.01, group: "Physics" },
  speed:       { value: 1, min: 0.25, max: 2, step: 0.05, group: "Physics" },
  trails:      { value: true, group: "Appearance" },
  ballColor:   { value: "#ff6b2c", type: "color", group: "Appearance" }
};

export function setup(world, params) {
  world.background = "#121315";

  for (let i = 0; i < params.count; i++) {
    world.circle({
      x: world.random(30, world.width - 30),
      y: world.random(30, world.height * 0.48),
      radius: world.random(7, 15),
      color: i % 5 === 0 ? "#f4f3ef" : params.ballColor,
      vx: world.random(-170, 170) * params.speed,
      vy: world.random(-40, 80) * params.speed,
      bounce: true,
      trail: params.trails ? 18 : 0
    });
  }
}

export function update(world, dt, params) {
  for (const ball of world.objects) {
    ball.velocity.y += params.gravity * dt;
    ball.restitution = params.restitution;
  }
}`;
