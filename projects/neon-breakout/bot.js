// Export automation for Neon Breakout.
// Video rendering runs this update before the simulation's update on every fixed step.
import { readBotState, applyBotInput } from "./simulation.js";

export function update(world) {
  const state = readBotState(world);
  if (!state || state.finished) return;

  let target = null;
  if (state.ball.vy > 0 && state.bricks.length) {
    if (state.bricks.length <= 6) {
      // Endgame: deliberately pick off the closest surviving brick.
      target = state.bricks.reduce((best, brick) => {
        const distance = Math.hypot(brick.x - state.ball.x, brick.y - state.ball.y);
        const bestDistance = best ? Math.hypot(best.x - state.ball.x, best.y - state.ball.y) : Infinity;
        return distance < bestDistance ? brick : best;
      }, null);
    } else {
      // Opening/midgame: shoot through the clearer side channel so the ball
      // can travel behind the wall and clear several bricks from above.
      const columnWidth = state.layout.brickWidth * 0.45;
      const leftCount = state.bricks.filter((brick) => Math.abs(brick.x - state.layout.leftColumnX) < columnWidth).length;
      const rightCount = state.bricks.filter((brick) => Math.abs(brick.x - state.layout.rightColumnX) < columnWidth).length;
      const openSide = leftCount === 0 ? "left" : rightCount === 0 ? "right" : null;
      if (openSide) {
        const useLeft = openSide === "left";
        const brickEdge = useLeft
          ? state.layout.leftColumnX - state.layout.brickWidth / 2
          : state.layout.rightColumnX + state.layout.brickWidth / 2;
        target = {
          x: useLeft ? brickEdge * 0.5 : state.world.width - (state.world.width - brickEdge) * 0.5,
          y: 140
        };
      } else {
        // Build toward a tunnel while keeping the reliable low-row clear.
        target = state.bricks.reduce((best, brick) => {
          if (!best || brick.y > best.y) return brick;
          if (brick.y === best.y && Math.abs(brick.x - state.ball.x) < Math.abs(best.x - state.ball.x)) return brick;
          return best;
        }, null);
      }
    }
  }
  applyBotInput(world, {
    paddleX: state.ball.x,
    aimX: target?.x,
    aimY: target?.y
  });
}
