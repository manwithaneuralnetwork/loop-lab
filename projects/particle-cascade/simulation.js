// Particle Cascade — a timed collision-driven contest between two teams.
export const parameters = {
  seed: { value: 23, min: 1, max: 999, step: 1, group: "Simulation" },
  particleCount: { value: 86, min: 30, max: 180, step: 2, group: "Simulation" },
  duration: { value: 12, min: 6, max: 30, step: 1, group: "Simulation" },
  drift: { value: 48, min: 10, max: 110, step: 2, group: "Motion" },
  chainRadius: { value: 94, min: 45, max: 150, step: 5, group: "Reaction" },
  blueColor: { value: "#4da3ff", type: "color", group: "Appearance" },
  redColor: { value: "#ff4f66", type: "color", group: "Appearance" },
  effectColor: { value: "#62d6a5", type: "color", group: "Appearance" }
};

function addWave(world, state, x, y, radius, color) {
  const body = world.circle({ x, y, radius: 3, color, static: true, collidable: false, opacity: 0.9, layer: 2 });
  state.waves.push({ body, age: 0, previousRadius: 0, maxRadius: radius });
}

function spawnParticle(world, state, params) {
  const angle = world.random(0, Math.PI * 2);
  const speed = world.random(params.drift * 0.55, params.drift * 1.2);
  const index = state.nextParticleId++;
  const team = index % 2 === 0 ? "blue" : "red";
  return world.circle({
    name: "particle-" + index, tags: ["particle", team], x: world.random(28, world.width - 28), y: world.random(72, world.height - 28),
    radius: world.random(5, 9), color: team === "blue" ? params.blueColor : params.redColor,
    vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, bounce: true, restitution: 1, trail: 4, collidable: true, layer: 1
  });
}

function burst(world, state, particle, params) {
  for (let index = 0; index < 4; index += 1) {
    const angle = world.random(0, Math.PI * 2);
    const speed = world.random(34, 92);
    const body = world.circle({
      x: particle.position.x, y: particle.position.y, radius: world.random(1.5, 3.2), color: params.effectColor,
      vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, trail: 5, collidable: false, layer: 3
    });
    state.sparks.push({ body, age: 0, life: world.random(0.45, 0.8) });
  }
}

export function setup(world, params) {
  world.background = "#0e1115";
  const title = world.text({ text: "CASCADE ARENA", x: 28, y: 34, fontSize: 16, font: "DM Mono, monospace", color: "#f2f0ea", align: "left", layer: 8 });
  const blueCounter = world.text({ text: "BLUE  000", x: world.width / 2 - 76, y: 34, fontSize: 13, font: "DM Mono, monospace", color: params.blueColor, align: "right", layer: 8 });
  const timer = world.text({ text: "00:00", x: world.width / 2, y: 34, fontSize: 14, font: "DM Mono, monospace", color: "#f2f0ea", align: "center", layer: 8 });
  const redCounter = world.text({ text: "RED  000", x: world.width / 2 + 76, y: 34, fontSize: 13, font: "DM Mono, monospace", color: params.redColor, align: "left", layer: 8 });
  world.gameState = {
    waves: [], sparks: [], title, blueCounter, redCounter, timer, result: null,
    reactions: 0, collisions: 0, spawnClock: 0, nextParticleId: 0,
    lastSpawnInterval: 0, finishing: false, resultAge: 0
  };
}

function updateEffects(world, state, dt, params, canDetonate) {
  const blastTriggered = [];
  for (const wave of state.waves) {
    wave.age += dt; wave.previousRadius = wave.body.radius;
    wave.body.radius = Math.min(wave.maxRadius, wave.maxRadius * (1 - Math.pow(1 - Math.min(1, wave.age / 0.72), 3)));
    wave.body.opacity = Math.max(0, 0.72 * (1 - wave.age / 0.9));
    for (const particle of canDetonate ? world.tagged("particle") : []) {
      const distance = Math.hypot(particle.position.x - wave.body.position.x, particle.position.y - wave.body.position.y);
      if (distance < wave.previousRadius - particle.radius || distance > wave.body.radius + particle.radius) continue;
      particle.destroy(); blastTriggered.push(particle); state.reactions += 1; burst(world, state, particle, params);
    }
    if (wave.age >= 0.9) wave.body.destroy();
  }
  state.waves = state.waves.filter((wave) => !wave.body.destroyed);

  const available = Math.max(0, 18 - state.waves.length);
  blastTriggered.slice(0, Math.min(available, 4)).forEach((particle, index) => {
    if (index === 0 || world.random() < 0.62) addWave(world, state, particle.position.x, particle.position.y, params.chainRadius * world.random(0.72, 1.05), params.effectColor);
  });

  for (const spark of state.sparks) {
    spark.age += dt; spark.body.opacity = Math.max(0, 1 - spark.age / spark.life);
    if (spark.age >= spark.life) spark.body.destroy();
  }
  state.sparks = state.sparks.filter((spark) => !spark.body.destroyed);
}

function finishMatch(world, state, params) {
  state.finishing = true; state.resultAge = 0; state.timer.text = "00:00";
  for (const particle of world.tagged("particle")) { particle.velocity.x = 0; particle.velocity.y = 0; }
  const blue = world.tagged("blue").length; const red = world.tagged("red").length;
  const message = blue === red ? "DRAW" : blue > red ? "BLUE WINS" : "RED WINS";
  const color = blue === red ? params.effectColor : blue > red ? params.blueColor : params.redColor;
  state.result = world.text({ text: message, x: world.width / 2, y: world.height / 2, fontSize: 38, font: "DM Mono, monospace", color, align: "center", layer: 10 });
  state.title.text = "FINAL  " + blue + " — " + red;
}

export function update(world, dt, params) {
  const state = world.gameState;
  if (state.finishing) {
    state.resultAge += dt;
    updateEffects(world, state, dt, params, false);
    if (state.resultAge >= 1 && state.waves.length === 0 && state.sparks.length === 0) world.finish("Cascade complete");
    return;
  }

  state.spawnClock -= dt;
  let activeCount = world.tagged("particle").length;
  let spawned = 0;
  while (state.spawnClock <= 0 && activeCount < params.particleCount && spawned < 2) {
    spawnParticle(world, state, params); activeCount += 1; spawned += 1;
    const density = activeCount / Math.max(1, params.particleCount);
    state.lastSpawnInterval = 0.11 + Math.pow(density, 1.35) * 0.42;
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
      addWave(world, state, x, y, params.chainRadius, params.effectColor);
      break;
    }
  }

  updateEffects(world, state, dt, params, true);
  const remaining = Math.max(0, params.duration - world.elapsed);
  const minutes = Math.floor(remaining / 60); const seconds = Math.ceil(remaining % 60);
  state.timer.text = String(minutes).padStart(2, "0") + ":" + String(seconds).padStart(2, "0");
  state.blueCounter.text = "BLUE  " + String(world.tagged("blue").length).padStart(3, "0");
  state.redCounter.text = "RED  " + String(world.tagged("red").length).padStart(3, "0");

  if (world.elapsed >= params.duration) finishMatch(world, state, params);
}
