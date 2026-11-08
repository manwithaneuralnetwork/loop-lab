// Neon Breakout — a compact playable Loop Lab game.
export const parameters = {
  seed:        { value: 7, min: 1, max: 999, step: 1, group: "Game" },
  columns:     { value: 8, min: 5, max: 12, step: 1, group: "Game" },
  rows:        { value: 4, min: 3, max: 9, step: 1, group: "Game" },
  lives:       { value: 3, min: 1, max: 7, step: 1, group: "Game" },
  ballSpeed:   { value: 860, min: 260, max: 900, step: 20, group: "Motion" },
  paddleWidth: { value: 150, min: 80, max: 240, step: 10, group: "Motion" },
  brickGap:    { value: 8, min: 2, max: 18, step: 1, group: "Layout" },
  ballColor:   { value: "#f6f3ea", type: "color", group: "Appearance" },
  paddleColor: { value: "#ff6b2c", type: "color", group: "Appearance" }
};

const palette = ["#ff6b2c", "#ff8f5a", "#ffc45f", "#62d6a5", "#59baf7", "#a988ff"];

function addText(world, name, text, x, y, size, color, align = "left", layer = 8) {
  return world.text({ name, text, x, y, fontSize: size, font: "DM Mono, monospace", color, align, layer });
}

function resetBall(world, state, frames = 48) {
  state.serveFrames = frames;
  state.ball.position.x = state.paddle.position.x;
  state.ball.position.y = state.paddle.position.y - 30;
  state.ball.velocity.x = 0;
  state.ball.velocity.y = 0;
  state.hint.text = state.lives === state.startingLives ? "MOVE TO AIM  ·  ARROWS OR POINTER" : "READY";
  state.hint.opacity = 1;
}

function launch(world, state, params) {
  const direction = world.random(-0.62, 0.62);
  state.ball.velocity.x = Math.sin(direction) * params.ballSpeed;
  state.ball.velocity.y = -Math.cos(direction) * params.ballSpeed;
  state.hint.opacity = 0;
}

function burst(world, state, brick) {
  const echo = world.rectangle({
    x: brick.position.x, y: brick.position.y, width: brick.width, height: brick.height,
    color: brick.color, opacity: 0.78, collidable: false, active: false, layer: 4
  });
  state.effects.push({ body: echo, kind: "echo", age: 0, duration: 0.46, width: brick.width, height: brick.height });
  for (let index = 0; index < 7; index++) {
    const angle = (Math.PI * 2 * index) / 7 + world.random(-0.18, 0.18);
    const speed = world.random(105, 215);
    const shard = world.rectangle({
      x: brick.position.x + Math.cos(angle) * brick.width * 0.16,
      y: brick.position.y + Math.sin(angle) * brick.height * 0.18,
      vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
      width: world.random(5, 10), height: world.random(2, 5),
      rotation: angle, color: brick.color, opacity: 0.9,
      collidable: false, layer: 5
    });
    state.effects.push({ body: shard, kind: "shard", age: 0, duration: world.random(0.34, 0.56) });
  }
}

function updateEffects(state, dt) {
  for (const effect of state.effects) {
    effect.age += dt;
    const progress = Math.min(1, effect.age / effect.duration);
    const easeOut = 1 - Math.pow(1 - progress, 3);
    if (effect.kind === "echo") {
      effect.body.width = effect.width * (1 + easeOut * 0.42);
      effect.body.height = effect.height * (1 + easeOut * 0.5);
      effect.body.opacity = Math.pow(1 - progress, 2) * 0.78;
    } else {
      const damping = Math.pow(0.035, dt);
      effect.body.velocity.x *= damping;
      effect.body.velocity.y *= damping;
      effect.body.rotation += dt * 5.5;
      effect.body.opacity = Math.pow(1 - progress, 1.65) * 0.9;
    }
    if (progress >= 1) effect.body.destroy();
  }
  state.effects = state.effects.filter((effect) => !effect.body.destroyed);
}

function playHit(world, state, volume, rate) {
  if (!world.hasAsset("assets/collision.mp3") || state.soundGate > 0) return;
  world.playSound("assets/collision.mp3", { volume, rate, pan: 0 });
  state.soundGate = 2;
}

// Stable automation boundary: bots can inspect only the state the game chooses to expose.
export function readBotState(world) {
  const state = world.gameState;
  if (!state) return null;
  return {
    ball: {
      x: state.ball.position.x, y: state.ball.position.y,
      vx: state.ball.velocity.x, vy: state.ball.velocity.y
    },
    paddle: { x: state.paddle.position.x, width: state.paddle.width },
    bricks: world.tagged("brick").map((brick) => ({
      x: brick.position.x, y: brick.position.y,
      width: brick.width, height: brick.height
    })),
    world: { width: world.width, height: world.height },
    layout: state.layout,
    score: state.score, lives: state.lives, remaining: state.remaining, elapsed: world.elapsed,
    serving: state.serveFrames > 0, finished: state.finished
  };
}

// Bots submit intent through the game rather than mutating bodies directly.
export function applyBotInput(world, input) {
  if (!world.gameState || !input || !Number.isFinite(input.paddleX)) return;
  world.gameState.botPaddleX = input.paddleX;
  if (Number.isFinite(input.aimX) && Number.isFinite(input.aimY)) {
    world.gameState.botAim = { x: input.aimX, y: input.aimY };
  }
}

export function setup(world, params) {
  world.background = "#0f1114";
  for (let x = 0; x <= world.width; x += 72) {
    world.rectangle({ x, y: world.height / 2, width: 1, height: world.height, color: "#2b2f35", opacity: 0.22, collidable: false, layer: -5 });
  }
  for (let y = 0; y <= world.height; y += 72) {
    world.rectangle({ x: world.width / 2, y, width: world.width, height: 1, color: "#2b2f35", opacity: 0.22, collidable: false, layer: -5 });
  }
  world.rectangle({ x: world.width / 2, y: 96, width: world.width - 72, height: 1, color: "#ff6b2c", opacity: 0.34, collidable: false, layer: -3 });

  const scoreLabel = addText(world, "score", "SCORE  000000", 42, 47, 22, "#f2f0ea");
  const livesLabel = addText(world, "lives", "LIVES  03", world.width - 42, 47, 22, "#f2f0ea", "right");
  addText(world, "title", "NEON BREAKOUT", world.width / 2, 48, 16, "#ff6b2c", "center");
  const hint = addText(world, "hint", "", world.width / 2, world.height - 122, 14, "#747b84", "center", 9);

  const paddle = world.rectangle({
    name: "paddle", tags: ["paddle"], x: world.width / 2, y: world.height - 72,
    width: params.paddleWidth, height: 16, color: params.paddleColor,
    static: true, restitution: 1, layer: 3
  });
  const ball = world.circle({
    name: "ball", tags: ["ball"], x: world.width / 2, y: paddle.position.y - 30,
    radius: 11, color: params.ballColor, restitution: 1, bounce: true,
    trail: 26, mass: 120, layer: 5
  });

  const margin = 42;
  const top = 140;
  const usableWidth = world.width - margin * 2;
  const brickWidth = (usableWidth - params.brickGap * (params.columns - 1)) / params.columns;
  const brickHeight = 36;
  let remaining = 0;
  for (let row = 0; row < params.rows; row++) {
    for (let column = 0; column < params.columns; column++) {
      world.rectangle({
        name: "brick-" + row + "-" + column, tags: ["brick"],
        x: margin + brickWidth / 2 + column * (brickWidth + params.brickGap),
        y: top + row * (brickHeight + params.brickGap), width: brickWidth, height: brickHeight,
        color: palette[row % palette.length], static: true, restitution: 1, layer: 1
      });
      remaining += 1;
    }
  }

  world.gameState = {
    score: 0, lives: params.lives, startingLives: params.lives, remaining,
    paddle, ball, scoreLabel, livesLabel, hint,
    serveFrames: 0, soundGate: 0, effects: [], finished: false, endFrames: 0, endReason: "",
    botPaddleX: null, botAim: null,
    layout: {
      top,
      leftColumnX: margin + brickWidth / 2,
      rightColumnX: world.width - margin - brickWidth / 2,
      brickWidth, brickHeight
    }
  };
  resetBall(world, world.gameState, 70);
}

export function update(world, dt, params) {
  const state = world.gameState;
  if (!state) return;
  const { paddle, ball } = state;

  state.scoreLabel.text = "SCORE  " + String(state.score).padStart(6, "0");
  state.livesLabel.text = "LIVES  " + String(state.lives).padStart(2, "0");
  state.soundGate = Math.max(0, state.soundGate - 1);
  updateEffects(state, dt);

  if (state.finished) {
    state.endFrames -= 1;
    if (state.endFrames <= 0) world.finish(state.endReason);
    return;
  }

  if (Number.isFinite(state.botPaddleX)) {
    paddle.position.x = state.botPaddleX;
    state.botPaddleX = null;
  } else {
    if (world.input.pointer.x > 0) paddle.position.x = world.input.pointer.x;
    if (world.input.keys.has("ArrowLeft") || world.input.keys.has("a")) paddle.position.x -= 620 * dt;
    if (world.input.keys.has("ArrowRight") || world.input.keys.has("d")) paddle.position.x += 620 * dt;
  }
  paddle.width = params.paddleWidth;
  paddle.color = params.paddleColor;
  paddle.position.x = Math.max(paddle.width / 2 + 18, Math.min(world.width - paddle.width / 2 - 18, paddle.position.x));

  if (state.serveFrames > 0) {
    state.serveFrames -= 1;
    ball.position.x = paddle.position.x;
    ball.position.y = paddle.position.y - 30;
    if (state.serveFrames === 0) launch(world, state, params);
    return;
  }

  ball.color = params.ballColor;
  if (ball.touches(paddle) && ball.position.y < paddle.position.y) {
    if (state.botAim) {
      const dx = state.botAim.x - ball.position.x;
      const dy = state.botAim.y - ball.position.y;
      const length = Math.max(1, Math.hypot(dx, dy));
      ball.velocity.x = (dx / length) * params.ballSpeed;
      ball.velocity.y = (dy / length) * params.ballSpeed;
      state.botAim = null;
    } else {
      const offset = (ball.position.x - paddle.position.x) / (paddle.width / 2);
      ball.velocity.x = offset * params.ballSpeed * 0.82;
      ball.velocity.y = -Math.abs(ball.velocity.y);
    }
    playHit(world, state, 0.16, 1.18);
  }

  let bricksHit = 0;
  for (const brick of world.tagged("brick")) {
    if (!ball.touches(brick)) continue;
    brick.destroy(); burst(world, state, brick);
    state.score += 100 + Math.max(0, Math.floor((world.height - brick.position.y) / 20));
    state.remaining -= 1; bricksHit += 1;
  }
  if (bricksHit) playHit(world, state, 0.12, 1.35 + Math.min(0.35, bricksHit * 0.04));

  if (state.remaining <= 0) {
    state.finished = true; state.endFrames = 60; state.endReason = "All bricks cleared"; ball.visible = false;
    addText(world, "result", "FIELD CLEARED", world.width / 2, world.height / 2 - 12, 46, "#62d6a5", "center", 12);
    addText(world, "final-score", "FINAL SCORE  " + state.score, world.width / 2, world.height / 2 + 48, 18, "#f2f0ea", "center", 12);
    return;
  }

  if (ball.hit("bottom")) {
    state.lives -= 1; playHit(world, state, 0.1, 0.72);
    if (state.lives <= 0) {
      state.finished = true; state.endFrames = 60; state.endReason = "No lives remaining"; ball.visible = false;
      addText(world, "result", "SIGNAL LOST", world.width / 2, world.height / 2 - 12, 46, "#ff6b2c", "center", 12);
      addText(world, "final-score", "FINAL SCORE  " + state.score, world.width / 2, world.height / 2 + 48, 18, "#f2f0ea", "center", 12);
      return;
    }
    resetBall(world, state, 58); return;
  }

  const speed = Math.hypot(ball.velocity.x, ball.velocity.y);
  if (speed > 0) {
    ball.velocity.x = (ball.velocity.x / speed) * params.ballSpeed;
    ball.velocity.y = (ball.velocity.y / speed) * params.ballSpeed;
    if (Math.abs(ball.velocity.y) < params.ballSpeed * 0.28) {
      ball.velocity.y = Math.sign(ball.velocity.y || -1) * params.ballSpeed * 0.34;
    }
  }
}
