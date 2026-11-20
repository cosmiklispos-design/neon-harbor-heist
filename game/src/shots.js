// The screenshot scenes behind ?shot=start|play|end. Each one plays the real
// rules forward from a fresh world, steered by a simple autopilot, so the
// frame is what a short game really looks like and the same seed always
// gives the same frame.
import { ROADS_X, ROADS_Y, STEP } from './config.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE } from './render.js';

const START_SECONDS = 5;
const PLAY_SECONDS = 26;
const END_LIMIT_SECONDS = 90;

function angleDiff(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function nearestRoad(roads, v) {
  return roads.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a), roads[0]);
}

function nearestParked(state) {
  let best = null;
  let bestD = Infinity;
  for (const car of state.cars) {
    if (car.kind !== 'parked' || !car.active) continue;
    const d = Math.hypot(car.x - state.player.x, car.y - state.player.y);
    if (d < bestD) { bestD = d; best = car; }
  }
  return { car: best, dist: bestD };
}

/**
 * An autopilot with memory: on foot it walks to the nearest parked car and
 * steals it; driving, it follows the road grid — nearest intersection, along
 * a road to the target's intersection, then to the target itself — instead
 * of ramming straight through buildings.
 */
function createAutopilot() {
  let waypoints = null;
  let waypointIndex = 0;
  let lastTarget = null;

  return function autopilot(state) {
    const p = state.player;
    const target = state.mission?.target ?? { x: 1400, y: 550 };
    if (!p.inCar) {
      waypoints = null;
      const { car, dist: d } = nearestParked(state);
      const goal = car && d < 900 ? car : target;
      const dx = goal.x - p.x;
      const dy = goal.y - p.y;
      const len = Math.hypot(dx, dy) || 1;
      return { vector: { x: dx / len, y: dy / len }, actions: d < 60 && car ? 4 : 0 };
    }
    if (!waypoints || lastTarget !== target) {
      lastTarget = target;
      const ix = nearestRoad(ROADS_X, target.x);
      const iy = nearestRoad(ROADS_Y, target.y);
      const px = nearestRoad(ROADS_X, p.x);
      const py = nearestRoad(ROADS_Y, p.y);
      waypoints = [{ x: px, y: py }, { x: ix, y: py }, { x: ix, y: iy }, { x: target.x, y: target.y }];
      waypointIndex = 0;
    }
    while (waypointIndex < waypoints.length && Math.hypot(waypoints[waypointIndex].x - p.x, waypoints[waypointIndex].y - p.y) < 70) waypointIndex += 1;
    const wp = waypoints[Math.min(waypointIndex, waypoints.length - 1)];
    const desired = Math.atan2(wp.y - p.y, wp.x - p.x);
    const steer = Math.max(-1, Math.min(1, angleDiff(p.angle, desired) * 1.5));
    // Slow down for sharp turns so the car does not drift off the road.
    return { vector: { x: steer, y: Math.abs(steer) > 0.7 ? 0.35 : 1 }, actions: 0 };
  };
}

export function stageShot(name, world) {
  world.reset();
  const state = world.state;
  if (name !== 'play' && name !== 'end') {
    for (let i = 0; i < START_SECONDS / STEP; i += 1) {
      world.step(STEP, { vector: { x: 0, y: 0 }, actions: 0 }, true);
    }
    return { screen: SCREEN_TITLE, best: 0 };
  }
  if (name === 'end') {
    // Drop the player on foot next to the police station, five stars hot.
    state.player.x = 2050;
    state.player.y = 400;
    state.wanted = 5;
    state.lastCrime = 0;
    for (let i = 0; i < END_LIMIT_SECONDS / STEP; i += 1) {
      // Flee from the nearest police car.
      let nearest = null;
      let bestD = Infinity;
      for (const car of state.cars) {
        if (car.kind !== 'police' || !car.active) continue;
        const d = Math.hypot(car.x - state.player.x, car.y - state.player.y);
        if (d < bestD) { bestD = d; nearest = car; }
      }
      let v = { x: 0, y: -1 };
      if (nearest) {
        const dx = state.player.x - nearest.x;
        const dy = state.player.y - nearest.y;
        const len = Math.hypot(dx, dy) || 1;
        v = { x: dx / len, y: dy / len };
      }
      if (world.step(STEP, { vector: v, actions: 0 }, false) & 4) break;
    }
    return { screen: SCREEN_OVER, best: state.score };
  }
  const autopilot = createAutopilot();
  for (let i = 0; i < PLAY_SECONDS / STEP; i += 1) {
    world.step(STEP, autopilot(state), false);
  }
  return { screen: SCREEN_PLAY, best: state.score };
}
