// Particle Cascade — expanding pulses trigger a field-wide chain reaction.
export const parameters = {
  seed: { value: 23, min: 1, max: 999, step: 1, group: "Simulation" },
  particleCount: { value: 86, min: 30, max: 180, step: 2, group: "Simulation" },
  duration: { value: 12, min: 6, max: 30, step: 1, group: "Simulation" },
  drift: { value: 48, min: 10, max: 110, step: 2, group: "Motion" },
  chainRadius: { value: 94, min: 45, max: 150, step: 5, group: "Reaction" },
  sparkColor: { value: "#ff6b2c", type: "color", group: "Appearance" },
  particleColor: { value: "#62d6a5", type: "color", group: "Appearance" }
};

function addWave(world, state, x, y, radius, color) {
  const body = world.circle({ x, y, radius: 3, color, static: true, collidable: false, opacity: 0.9, layer: 2 });
  state.waves.push({ body, age: 0, previousRadius: 0, maxRadius: radius });
}

function spawnParticle(world, state, params) {
  const angle = world.random(0, Math.PI * 2);
  const speed = world.random(params.drift * 0.55, params.drift * 1.2);
  const index = state.nextParticleId++;
  return world.circle({
    name: "particle-" + index, tags: ["particle"], x: world.random(28, world.width - 28), y: world.random(72, world.height - 28),
    radius: world.random(5, 9), color: index % 7 === 0 ? params.sparkColor : params.particleColor,
    vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, bounce: true, restitution: 1, trail: 4, collidable: true, layer: 1
  });
}

function burst(world, state, particle, params) {
  for (let index = 0; index < 4; index += 1) {
    const angle = world.random(0, Math.PI * 2);
    const speed = world.random(34, 92);
    const body = world.circle({
      x: particle.position.x, y: particle.position.y, radius: world.random(1.5, 3.2), color: params.sparkColor,
      vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, trail: 5, collidable: false, layer: 3
    });
    state.sparks.push({ body, age: 0, life: world.random(0.45, 0.8) });
  }
}

export function setup(world, params) {
  world.background = "#0e1115";
  const title = world.text({ text: "PARTICLE CASCADE", x: 28, y: 34, fontSize: 16, font: "DM Mono, monospace", color: "#f2f0ea", align: "left", layer: 8 });
  const counter = world.text({ text: "ACTIVE  000", x: world.width - 28, y: 34, fontSize: 13, font: "DM Mono, monospace", color: "#8b929a", align: "right", layer: 8 });
  world.gameState = {
    waves: [], sparks: [], title, counter, reactions: 0, collisions: 0,
    spawnClock: 0, nextParticleId: 0, lastSpawnInterval: 0, finishing: false, endFrames: 0
  };
}

export function update(world, dt, params) {
  const state = world.gameState;
  if (state.finishing) {
    state.endFrames -= 1;
    if (state.endFrames <= 0) world.finish("Cascade complete");
    return;
  }

  state.spawnClock -= dt;
  let activeCount = world.tagged("particle").length;
  let spawned = 0;
  while (state.spawnClock <= 0 && activeCount < params.particleCount && spawned < 3) {
    spawnParticle(world, state, params); activeCount += 1; spawned += 1;
    const density = activeCount / Math.max(1, params.particleCount);
    state.lastSpawnInterval = 0.035 + Math.pow(density, 1.35) * 0.28;
    state.spawnClock += state.lastSpawnInterval;
  }

  const particles = world.tagged("particle");
  for (let first = 0; first < particles.length; first += 1) {
    const a = particles[first];
    if (a.destroyed) continue;
    for (let second = first + 1; second < particles.length; second += 1) {
      const b = particles[second];
      if (b.destroyed || !a.touches(b)) continue;
      const x = (a.position.x + b.position.x) / 2; const y = (a.position.y + b.position.y) / 2;
      a.destroy(); b.destroy(); burst(world, state, a, params); burst(world, state, b, params);
      state.reactions += 2; state.collisions += 1;
      addWave(world, state, x, y, params.chainRadius, params.sparkColor);
      break;
    }
  }

  const blastTriggered = [];
  for (const wave of state.waves) {
    wave.age += dt; wave.previousRadius = wave.body.radius;
    wave.body.radius = Math.min(wave.maxRadius, wave.maxRadius * (1 - Math.pow(1 - Math.min(1, wave.age / 0.72), 3)));
    wave.body.opacity = Math.max(0, 0.72 * (1 - wave.age / 0.9));
    for (const particle of world.tagged("particle")) {
      const distance = Math.hypot(particle.position.x - wave.body.position.x, particle.position.y - wave.body.position.y);
      if (distance < wave.previousRadius - particle.radius || distance > wave.body.radius + particle.radius) continue;
      particle.destroy(); blastTriggered.push(particle); state.reactions += 1; burst(world, state, particle, params);
    }
    if (wave.age >= 0.9) wave.body.destroy();
  }
  state.waves = state.waves.filter((wave) => !wave.body.destroyed);

  const available = Math.max(0, 18 - state.waves.length);
  blastTriggered.slice(0, Math.min(available, 4)).forEach((particle, index) => {
    if (index === 0 || world.random() < 0.62) addWave(world, state, particle.position.x, particle.position.y, params.chainRadius * world.random(0.72, 1.05), index % 2 ? params.particleColor : params.sparkColor);
  });

  for (const spark of state.sparks) {
    spark.age += dt; spark.body.opacity = Math.max(0, 1 - spark.age / spark.life);
    if (spark.age >= spark.life) spark.body.destroy();
  }
  state.sparks = state.sparks.filter((spark) => !spark.body.destroyed);
  state.counter.text = "ACTIVE  " + String(world.tagged("particle").length).padStart(3, "0") + "  ·  HITS  " + String(state.collisions).padStart(2, "0");

  if (world.elapsed >= params.duration) {
    state.finishing = true; state.endFrames = 60;
    state.title.text = "CASCADE COMPLETE"; state.title.color = params.sparkColor;
  }
}
