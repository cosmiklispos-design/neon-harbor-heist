// Neon Harbor Heist — the game's rules and state, with no drawing and no
// browser in it. step() advances one fixed step and returns what happened as
// bit flags, so the caller can react (sound, announcements) without the world
// knowing about screens or sound. Nothing here allocates after createWorld.
import {
  CAR, GARAGE, HARBOR, HEALTH, MARKET, MISSION, PLAYER, POLICE_STATION,
  PRICES, ROADS_X, ROADS_Y, ROAD_W, WANTED, WORLD,
} from './config.js';

export const EVENT_HIT = 1;
export const EVENT_MISSION = 2;
export const EVENT_OVER = 4;
export const EVENT_CRIME = 8;
export const EVENT_PICKUP = 16;
export const EVENT_BUY = 32;

const TAU = Math.PI * 2;
const NEON = ['#ff2e88', '#22d3ee', '#facc15', '#4ade80', '#a78bfa'];

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function dist(ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); }
function angleTo(ax, ay, bx, by) { return Math.atan2(by - ay, bx - ax); }
function angleDiff(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= TAU;
  while (d < -Math.PI) d += TAU;
  return d;
}
// Push a circle out of a rectangle; returns true when a collision happened.
function pushOutCircleRect(p, r, rect) {
  const cx = clamp(p.x, rect.x, rect.x + rect.w);
  const cy = clamp(p.y, rect.y, rect.y + rect.h);
  const dx = p.x - cx;
  const dy = p.y - cy;
  const d2 = dx * dx + dy * dy;
  if (d2 >= r * r) return false;
  if (d2 === 0) { p.y = rect.y - r; return true; }
  const d = Math.sqrt(d2);
  p.x = cx + (dx / d) * r;
  p.y = cy + (dy / d) * r;
  return true;
}

export function createWorld(random) {
  // City layout: one building per road cell, fixed plazas for the landmarks.
  const buildings = [];
  const plazas = [
    { x: MARKET.x - 90, y: MARKET.y - 70, w: 180, h: 140 },
    { x: GARAGE.x - 90, y: GARAGE.y - 70, w: 180, h: 140 },
    { x: POLICE_STATION.x - 90, y: POLICE_STATION.y - 70, w: 180, h: 140 },
  ];
  let colorIndex = 0;
  for (let xi = 0; xi < ROADS_X.length - 1; xi += 1) {
    for (let yi = 0; yi < ROADS_Y.length - 1; yi += 1) {
      const x = ROADS_X[xi] + ROAD_W / 2 + 24;
      const y = ROADS_Y[yi] + ROAD_W / 2 + 24;
      const w = ROADS_X[xi + 1] - ROADS_X[xi] - ROAD_W - 48;
      const h = ROADS_Y[yi + 1] - ROADS_Y[yi] - ROAD_W - 48;
      if (y + h > HARBOR.y - 40) continue; // harbour shore stays open
      const rect = { x, y, w, h, neon: NEON[colorIndex % NEON.length] };
      colorIndex += 1;
      if (plazas.some((p) => rect.x < p.x + p.w && rect.x + rect.w > p.x && rect.y < p.y + p.h && rect.y + rect.h > p.y)) continue;
      buildings.push(rect);
    }
  }

  const player = {
    x: 1000, y: 900, angle: -Math.PI / 2, health: HEALTH.max, maxHealth: HEALTH.max,
    inCar: null, punchCooldown: 0, invulnerable: 0, speed: 0,
  };
  const cars = [];
  const peds = [];
  const state = {
    player, cars, peds, buildings,
    money: 0, rep: 0, score: 0, wanted: 0, cargo: 0,
    upgrades: { armor: false, engine: false },
    mission: null, missionTimer: 0, elapsed: 0,
    lastCrime: -999, toast: '', toastTimer: 0,
    stats: { missions: 0, carsStolen: 0, arrests: 0 },
  };

  function toast(text) {
    state.toast = text;
    state.toastTimer = 3.5;
  }

  function addWanted(n, events) {
    state.wanted = Math.min(WANTED.max, state.wanted + n);
    state.lastCrime = state.elapsed;
    return events | EVENT_CRIME;
  }

  function spawnCar(kind, x, y, angle, color) {
    const car = {
      kind, x, y, angle, speed: 0, color: color ?? '#e2e8f0',
      axis: 'x', dir: 1, lane: 0, hp: 100, active: true, flee: 0,
    };
    cars.push(car);
    return car;
  }

  function spawnTrafficCar() {
    const horizontal = random() < 0.5;
    let car;
    if (horizontal) {
      const y = ROADS_Y[Math.floor(random() * ROADS_Y.length)];
      car = spawnCar('traffic', random() * WORLD.width, y, random() < 0.5 ? 0 : Math.PI, ['#e2e8f0', '#facc15', '#f87171', '#93c5fd'][Math.floor(random() * 4)]);
      car.axis = 'x';
      car.dir = car.angle === 0 ? 1 : -1;
      car.lane = (random() < 0.5 ? -1 : 1) * 22;
    } else {
      const x = ROADS_X[Math.floor(random() * ROADS_X.length)];
      car = spawnCar('traffic', x, random() * WORLD.height, random() < 0.5 ? Math.PI / 2 : -Math.PI / 2, ['#e2e8f0', '#facc15', '#f87171', '#93c5fd'][Math.floor(random() * 4)]);
      car.axis = 'y';
      car.dir = car.angle > 0 ? 1 : -1;
      car.lane = (random() < 0.5 ? -1 : 1) * 22;
    }
    car.speed = 120 + random() * 80;
    return car;
  }

  function spawnPed() {
    const x = ROADS_X[Math.floor(random() * ROADS_X.length)] + (random() < 0.5 ? -70 : 70);
    const y = ROADS_Y[Math.floor(random() * ROADS_Y.length)] + (random() < 0.5 ? -70 : 70);
    peds.push({ x: clamp(x, 40, WORLD.width - 40), y: clamp(y, 40, HARBOR.y - 40), angle: random() * TAU, speed: 40 + random() * 30, hp: 50, active: true, flee: 0, changeTimer: 2 + random() * 3 });
  }

  function spawnPolice() {
    const car = spawnCar('police', POLICE_STATION.x, POLICE_STATION.y + 120, Math.PI / 2, '#3b82f6');
    car.speed = 0;
    return car;
  }

  function newMission(type) {
    if (type === 'cargo') {
      state.mission = { type: 'cargo', stage: 0, target: { x: HARBOR.dockX, y: HARBOR.dockY, label: 'Harbor Dock' }, text: 'Go to the Harbor Dock and press E to grab the cargo' };
    } else if (type === 'getaway') {
      state.mission = { type: 'getaway', stage: 0, target: { x: player.x, y: player.y, label: 'Getaway' }, text: 'Lose the heat — survive with the police on you!' };
      state.missionTimer = MISSION.getawaySeconds;
      if (state.wanted < 2) state.wanted = 2;
      state.lastCrime = state.elapsed;
    } else {
      state.cargo = 2;
      state.mission = { type: 'sell', stage: 0, target: { x: MARKET.x, y: MARKET.y, label: 'Night Market' }, text: 'Sell the stolen goods at the Night Market (press E)' };
    }
  }

  function completeMission(pay, events) {
    state.money += pay;
    state.score += pay;
    state.rep += 10;
    state.stats.missions += 1;
    const order = ['cargo', 'getaway', 'sell'];
    const next = order[(order.indexOf(state.mission.type) + 1) % order.length];
    toast(`Mission complete! +$${pay}`);
    newMission(next);
    return events | EVENT_MISSION;
  }

  function reset() {
    player.x = 1000; player.y = 900; player.angle = -Math.PI / 2;
    player.health = HEALTH.max; player.maxHealth = HEALTH.max;
    player.inCar = null; player.punchCooldown = 0; player.invulnerable = 0; player.speed = 0;
    cars.length = 0;
    peds.length = 0;
    state.money = 0; state.rep = 0; state.score = 0; state.wanted = 0; state.cargo = 0;
    state.upgrades = { armor: false, engine: false };
    state.elapsed = 0; state.lastCrime = -999; state.toast = ''; state.toastTimer = 0;
    state.lastHit = -999;
    state.stats = { missions: 0, carsStolen: 0, arrests: 0 };
    // Parked cars to steal, along the roadsides.
    const parked = [
      [600, 330, 0, '#facc15'], [1400, 330, Math.PI, '#e2e8f0'], [1000, 680, 0, '#f87171'],
      [1800, 1030, Math.PI, '#93c5fd'], [2200, 1380, 0, '#e2e8f0'], [200, 1030, Math.PI / 2, '#4ade80'],
      [1400, 1380, Math.PI, '#facc15'], [600, 680, 0, '#a78bfa'],
    ];
    for (const [x, y, a, c] of parked) spawnCar('parked', x, y, a, c);
    for (let i = 0; i < 10; i += 1) spawnTrafficCar();
    for (let i = 0; i < 16; i += 1) spawnPed();
    newMission('cargo');
    toast('Welcome to Neon Harbor. Steal a car, run the jobs, dodge the heat.');
  }

  function nearestParkedCar(maxDist) {
    let best = null;
    let bestD = maxDist;
    for (const car of cars) {
      if (car.kind !== 'parked' || !car.active) continue;
      const d = dist(player.x, player.y, car.x, car.y);
      if (d < bestD) { bestD = d; best = car; }
    }
    return best;
  }

  function handleInteract(events) {
    const m = state.mission;
    // Mission targets first.
    if (m && dist(player.x, player.y, m.target.x, m.target.y) < 110) {
      if (m.type === 'cargo' && m.stage === 0) {
        state.cargo = 1;
        m.stage = 1;
        m.target = { x: MARKET.x, y: MARKET.y, label: 'Night Market' };
        m.text = 'Cargo grabbed! Deliver it to the Night Market (press E)';
        toast('Cargo grabbed — deliver it to the Night Market');
        return events | EVENT_PICKUP;
      }
      if (m.type === 'cargo' && m.stage === 1 && state.cargo > 0) {
        state.cargo = 0;
        return completeMission(MISSION.cargoPay, events);
      }
      if (m.type === 'sell' && state.cargo > 0) {
        const pay = MISSION.sellPay * state.cargo;
        state.cargo = 0;
        return completeMission(pay, events);
      }
    }
    // Garage: repair, then armor, then engine.
    if (dist(player.x, player.y, GARAGE.x, GARAGE.y) < 130) {
      if (player.health < player.maxHealth && state.money >= PRICES.repair) {
        state.money -= PRICES.repair;
        player.health = player.maxHealth;
        toast('Car fixed and patched up. -$100');
        return events | EVENT_BUY;
      }
      if (!state.upgrades.armor && state.money >= PRICES.armor) {
        state.money -= PRICES.armor;
        state.upgrades.armor = true;
        player.maxHealth = 150;
        player.health = 150;
        toast('Armor plating fitted! Max health 150. -$200');
        return events | EVENT_BUY;
      }
      if (!state.upgrades.engine && state.money >= PRICES.engine) {
        state.money -= PRICES.engine;
        state.upgrades.engine = true;
        toast('Tuned engine fitted! Faster top speed. -$300');
        return events | EVENT_BUY;
      }
      toast('Garage: repair $100, armor $200, engine $300 — earn more first');
      return events;
    }
    // Steal / exit a car.
    if (player.inCar) {
      const car = player.inCar;
      player.inCar = null;
      player.x = car.x + Math.cos(car.angle + Math.PI / 2) * 50;
      player.y = car.y + Math.sin(car.angle + Math.PI / 2) * 50;
      player.angle = car.angle;
      car.kind = 'parked';
      car.speed = 0;
      toast('Out of the car');
      return events;
    }
    const car = nearestParkedCar(70);
    if (car) {
      car.kind = 'player';
      player.inCar = car;
      state.stats.carsStolen += 1;
      toast('Car stolen! The heat is on');
      return addWanted(1, events);
    }
    return events;
  }

  function handlePunch(events) {
    if (player.inCar || player.punchCooldown > 0) return events;
    player.punchCooldown = PLAYER.punchCooldown;
    const fx = player.x + Math.cos(player.angle) * PLAYER.punchRange;
    const fy = player.y + Math.sin(player.angle) * PLAYER.punchRange;
    for (const ped of peds) {
      if (!ped.active) continue;
      if (dist(fx, fy, ped.x, ped.y) < 30) {
        ped.hp -= PLAYER.punchDamage;
        if (ped.hp <= 0) { ped.active = false; ped.flee = 0; }
        toast('You hit a pedestrian! The heat is on');
        return addWanted(1, events | EVENT_HIT);
      }
    }
    for (const car of cars) {
      if (!car.active || car.kind === 'player') continue;
      if (dist(fx, fy, car.x, car.y) < 50) {
        car.hp -= PLAYER.punchDamage;
        if (car.hp <= 0) { car.active = false; }
        return addWanted(1, events | EVENT_HIT);
      }
    }
    return events;
  }

  function moveBody(p, r, dx, dy) {
    p.x = clamp(p.x + dx, r, WORLD.width - r);
    p.y = clamp(p.y + dy, r, HARBOR.y - 6);
    let hit = false;
    for (const b of buildings) hit = pushOutCircleRect(p, r, b) || hit;
    return hit;
  }

  function step(dt, input, harmless) {
    let events = 0;
    state.elapsed += dt;
    if (state.toastTimer > 0) state.toastTimer -= dt;
    if (player.punchCooldown > 0) player.punchCooldown -= dt;
    if (player.invulnerable > 0) player.invulnerable -= dt;

    const actions = input.actions ?? 0;
    if (!harmless) {
      if (actions & 4) events = handleInteract(events);
      if (actions & 8) events = handlePunch(events);
    }

    // --- Player movement ---
    const v = input.vector ?? { x: 0, y: 0 };
    if (player.inCar) {
      const car = player.inCar;
      const top = CAR.maxSpeed * (state.upgrades.engine ? 1.25 : 1);
      car.speed += v.y * CAR.accel * dt;
      if (v.y === 0) car.speed *= Math.pow(0.4, dt);
      car.speed = clamp(car.speed, -CAR.maxReverse, top);
      if (Math.abs(car.speed) > 5) car.angle += v.x * CAR.turnRate * (car.speed / top) * dt * (car.speed < 0 ? -1 : 1);
      car.x += Math.cos(car.angle) * car.speed * dt;
      car.y += Math.sin(car.angle) * car.speed * dt;
      // Radius 22 (the car's half-width) fits the 24 px sidewalk gap between
      // road and building; the push-out alone stops tunnelling, and cutting
      // speed on every brush with a wall wedged cars in place, so don't.
      moveBody(car, 22, 0, 0);
      player.x = car.x;
      player.y = car.y;
      player.angle = car.angle;
      player.speed = car.speed;
      // Ramming pedestrians and traffic.
      for (const ped of peds) {
        if (!ped.active) continue;
        if (dist(car.x, car.y, ped.x, ped.y) < 42 && Math.abs(car.speed) > 120) {
          ped.active = false;
          events = addWanted(1, events | EVENT_HIT);
          toast('You ran someone over! The heat is on');
        }
      }
    } else {
      const speed = PLAYER.walkSpeed;
      const nx = player.x + v.x * speed * dt;
      const ny = player.y + v.y * speed * dt;
      moveBody(player, PLAYER.radius, nx - player.x, ny - player.y);
      if (v.x !== 0 || v.y !== 0) player.angle = Math.atan2(v.y, v.x);
      player.speed = (v.x !== 0 || v.y !== 0) ? speed : 0;
    }

    // --- Traffic ---
    for (const car of cars) {
      if (!car.active || car.kind !== 'traffic') continue;
      if (car.axis === 'x') {
        car.x += car.dir * car.speed * dt;
        car.y += (ROADS_Y.reduce((a, b) => (Math.abs(b - car.y) < Math.abs(a - car.y) ? b : a), ROADS_Y[0]) + car.lane - car.y) * dt * 2;
        if (car.x < 60 || car.x > WORLD.width - 60) { car.dir *= -1; car.angle += Math.PI; }
        if (Math.random() < 0.002) { /* keep lane, simple grid traffic */ }
      } else {
        car.y += car.dir * car.speed * dt;
        car.x += (ROADS_X.reduce((a, b) => (Math.abs(b - car.x) < Math.abs(a - car.x) ? b : a), ROADS_X[0]) + car.lane - car.x) * dt * 2;
        if (car.y < 60 || car.y > HARBOR.y - 60) { car.dir *= -1; car.angle += Math.PI; }
      }
      // Traffic avoids the player car softly: slow down when close ahead.
      if (player.inCar && dist(car.x, car.y, player.x, player.y) < 90) car.speed = Math.max(60, car.speed - 200 * dt);
      else if (car.speed < 200) car.speed = Math.min(200, car.speed + 40 * dt);
    }
    if (cars.filter((c) => c.active && c.kind === 'traffic').length < 10 && random() < 0.02) spawnTrafficCar();

    // --- Pedestrians ---
    for (const ped of peds) {
      if (!ped.active) continue;
      const dPlayer = dist(ped.x, ped.y, player.x, player.y);
      if (dPlayer < 120 && (player.inCar || state.wanted > 0)) {
        ped.flee = 1.5;
        ped.angle = angleTo(player.x, player.y, ped.x, ped.y);
      }
      if (ped.flee > 0) {
        ped.flee -= dt;
        ped.x += Math.cos(ped.angle) * 150 * dt;
        ped.y += Math.sin(ped.angle) * 150 * dt;
      } else {
        ped.changeTimer -= dt;
        if (ped.changeTimer <= 0) {
          ped.angle = random() * TAU;
          ped.changeTimer = 2 + random() * 3;
        }
        ped.x += Math.cos(ped.angle) * ped.speed * dt;
        ped.y += Math.sin(ped.angle) * ped.speed * dt;
      }
      ped.x = clamp(ped.x, 40, WORLD.width - 40);
      ped.y = clamp(ped.y, 40, HARBOR.y - 40);
      for (const b of buildings) pushOutCircleRect(ped, 8, b);
    }
    if (peds.filter((p) => p.active).length < 14 && random() < 0.02) spawnPed();

    // --- Police ---
    const wantedPolice = Math.min(Math.ceil(state.wanted / 2), 3);
    const police = cars.filter((c) => c.active && c.kind === 'police');
    while (police.length < wantedPolice) police.push(spawnPolice());
    for (const cop of police) {
      if (state.wanted === 0) { cop.active = false; continue; }
      const d = dist(cop.x, cop.y, player.x, player.y);
      const targetAngle = angleTo(cop.x, cop.y, player.x, player.y);
      cop.angle += clamp(angleDiff(cop.angle, targetAngle), -3.2 * dt, 3.2 * dt);
      // Slower than the player's car (460) so a good driver can escape;
      // faster than a pedestrian (230) so running on foot is dangerous.
      const top = 300 + 25 * state.wanted;
      cop.speed = Math.min(top, cop.speed + 300 * dt);
      cop.x += Math.cos(cop.angle) * cop.speed * dt;
      cop.y += Math.sin(cop.angle) * cop.speed * dt;
      // Police cut across blocks to stay on the player's tail (they would
      // wedge themselves on building corners otherwise, and the chase dies).
      cop.x = clamp(cop.x, 30, WORLD.width - 30);
      cop.y = clamp(cop.y, 30, HARBOR.y - 6);
      if (d < 46 && player.invulnerable <= 0) {
        player.health -= player.inCar ? 5 : 20;
        player.invulnerable = 1.5;
        state.lastHit = state.elapsed;
        cop.speed = 120; // the ram bounces the police car off, giving breathing room
        state.lastCrime = state.elapsed; // the chase stays hot while they hit you
        if (!player.inCar) state.stats.arrests += 1;
        toast(player.inCar ? 'Police rammed you!' : 'Busted! The police roughed you up');
        events |= EVENT_HIT;
        if (player.health <= 0) {
          player.health = 0;
          events |= EVENT_OVER;
        }
      }
    }

    // --- Wanted decay ---
    if (state.wanted > 0 && state.elapsed - state.lastCrime > WANTED.decayDelay) {
      const nearPolice = police.some((c) => c.active && dist(c.x, c.y, player.x, player.y) < 400);
      if (!nearPolice) state.wanted = Math.max(0, state.wanted - WANTED.decayRate * dt);
    }

    // --- Health regen after 5 s without a hit ---
    if (player.health > 0 && player.health < player.maxHealth && state.elapsed - state.lastHit > 5) {
      player.health = Math.min(player.maxHealth, player.health + 3 * dt);
    }

    // --- Getaway mission timer ---
    if (state.mission?.type === 'getaway') {
      if (state.wanted >= 1) {
        state.missionTimer -= dt;
        state.mission.target = { x: player.x, y: player.y, label: 'Getaway' };
        if (state.missionTimer <= 0) events = completeMission(MISSION.getawayPay, events);
      } else {
        state.mission.text = 'Get the police after you — steal a car or hit someone, then survive!';
      }
    }

    if (player.health <= 0) events |= EVENT_OVER;
    return events;
  }

  reset();
  return { state, reset, step };
}
