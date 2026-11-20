// Drawing only: the world's state and the current screen in, pixels out.
// A 1280x720 camera follows the player around the 2400x1800 city; the HUD,
// minimap and panels are drawn in screen space. Flat shapes and canvas text.
import {
  FONT, GARAGE, HARBOR, MARKET, PALETTE, POLICE_STATION, ROADS_X, ROADS_Y,
  ROAD_W, WORLD,
} from './config.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';

const VIEW = { w: 1280, h: 720 };
const PANEL = { width: 640, top: 150, line: 30, bottom: 64 };

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const fonts = new Map();
  let camX = 0;
  let camY = 0;

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(window.innerWidth * ratio);
    canvas.height = Math.round(window.innerHeight * ratio);
  }

  function text(value, x, y, size, color, align) {
    if (!fonts.has(size)) fonts.set(size, `${size}px ${FONT}`);
    context.font = fonts.get(size);
    context.fillStyle = color;
    context.textAlign = align ?? 'left';
    context.textBaseline = 'alphabetic';
    context.fillText(value, x, y);
  }

  function rect(x, y, w, h, color) {
    context.fillStyle = color;
    context.fillRect(x, y, w, h);
  }

  function drawCity(state, time) {
    const { buildings } = state;
    rect(0, 0, WORLD.width, WORLD.height, PALETTE.ground);
    // Harbour water along the south edge, with a pier at the dock.
    rect(0, HARBOR.y, WORLD.width, WORLD.height - HARBOR.y, PALETTE.water);
    context.strokeStyle = PALETTE.waterLine;
    context.lineWidth = 3;
    context.beginPath();
    for (let x = 0; x <= WORLD.width; x += 120) {
      context.moveTo(x, HARBOR.y + 12 + Math.sin(time * 1.4 + x * 0.01) * 4);
      context.lineTo(x + 60, HARBOR.y + 12 + Math.sin(time * 1.4 + x * 0.01) * 4);
    }
    context.stroke();
    rect(HARBOR.dockX - 60, HARBOR.dockY - 140, 120, 220, '#2a3448'); // pier
    // Roads.
    for (const x of ROADS_X) rect(x - ROAD_W / 2, 0, ROAD_W, HARBOR.y, PALETTE.road);
    for (const y of ROADS_Y) rect(0, y - ROAD_W / 2, WORLD.width, ROAD_W, PALETTE.road);
    // Lane dashes.
    context.fillStyle = PALETTE.roadLine;
    for (const x of ROADS_X) {
      for (let y = 0; y < HARBOR.y; y += 64) rect(x - 2, y, 4, 30);
    }
    for (const y of ROADS_Y) {
      for (let x = 0; x < WORLD.width; x += 64) rect(x, y - 2, 30, 4);
    }
    // Buildings with neon edges.
    for (const b of buildings) {
      rect(b.x, b.y, b.w, b.h, PALETTE.building);
      context.strokeStyle = b.neon;
      context.globalAlpha = 0.85;
      context.lineWidth = 3;
      context.strokeRect(b.x + 1, b.y + 1, b.w - 2, b.h - 2);
      context.globalAlpha = 1;
      rect(b.x + 14, b.y + 14, Math.min(40, b.w - 28), 18, 'rgba(255, 255, 255, 0.08)');
    }
    // Plazas: night market, garage, police station.
    drawPlaza(MARKET.x, MARKET.y, 'NIGHT MARKET', PALETTE.neonPink);
    drawPlaza(GARAGE.x, GARAGE.y, 'GARAGE', PALETTE.neonYellow);
    drawPlaza(POLICE_STATION.x, POLICE_STATION.y, 'POLICE', '#60a5fa');
  }

  function drawPlaza(x, y, label, color) {
    rect(x - 90, y - 70, 180, 140, PALETTE.sidewalk);
    context.strokeStyle = color;
    context.lineWidth = 3;
    context.strokeRect(x - 90, y - 70, 180, 140);
    text(label, x, y + 6, 20, color, 'center');
  }

  function drawCar(car, time) {
    context.save();
    context.translate(car.x, car.y);
    context.rotate(car.angle);
    const w = 46;
    const l = 78;
    rect(-l / 2, -w / 2, l, w, car.color);
    rect(-l / 2 + 8, -w / 2 + 6, 22, w - 12, 'rgba(10, 14, 26, 0.55)'); // windshield
    rect(l / 2 - 14, -w / 2 + 5, 10, 8, '#111');
    rect(l / 2 - 14, w / 2 - 13, 10, 8, '#111');
    if (car.kind === 'police') {
      const flash = Math.floor(time * 6) % 2 === 0;
      rect(-l / 2 + 2, -w / 2 + 4, 16, 10, flash ? '#ef4444' : '#3b82f6');
      rect(-l / 2 + 2, w / 2 - 14, 16, 10, flash ? '#3b82f6' : '#ef4444');
    } else if (car.kind === 'player') {
      // Headlights ahead.
      context.fillStyle = 'rgba(250, 204, 21, 0.35)';
      context.beginPath();
      context.moveTo(l / 2, -14);
      context.lineTo(l / 2 + 70, -34);
      context.lineTo(l / 2 + 70, 34);
      context.lineTo(l / 2, 14);
      context.closePath();
      context.fill();
    }
    context.restore();
  }

  function drawHud(state, time) {
    const s = 1280;
    // Top-left: money, reputation, cargo.
    rect(12, 12, 300, 86, PALETTE.panel);
    text(`$${state.money}`, 26, 46, 28, PALETTE.neonYellow, 'left');
    text(`REP ${state.rep}   CARGO ${state.cargo}`, 26, 76, 18, PALETTE.text, 'left');
    // Top-centre: wanted stars.
    const stars = '★'.repeat(Math.round(state.wanted)) + '☆'.repeat(5 - Math.round(state.wanted));
    text(stars, s / 2, 48, 32, state.wanted > 0 ? PALETTE.policeLight : PALETTE.muted, 'center');
    if (state.wanted > 0) text(`WANTED ${Math.round(state.wanted)}`, s / 2, 78, 16, PALETTE.policeLight, 'center');
    // Top-right: health bar.
    const hp = state.player.health / state.player.maxHealth;
    rect(s - 232, 12, 220, 86, PALETTE.panel);
    text('HEALTH', s - 218, 40, 16, PALETTE.muted, 'left');
    rect(s - 218, 50, 192, 18, '#1f2937');
    rect(s - 218, 50, 192 * hp, 18, hp > 0.5 ? PALETTE.neonGreen : hp > 0.25 ? PALETTE.neonYellow : PALETTE.policeLight);
    text(`${Math.ceil(state.player.health)} / ${state.player.maxHealth}`, s - 218, 88, 16, PALETTE.text, 'left');
    // Mission text, bottom-left.
    if (state.mission) {
      rect(12, 620, 560, 52, PALETTE.panel);
      text(`JOB: ${state.mission.text}`, 26, 641, 18, PALETTE.neonCyan, 'left');
      if (state.mission.type === 'getaway') text(`Survive: ${Math.ceil(state.missionTimer)}s`, 26, 664, 16, PALETTE.text, 'left');
      else text(`Target: ${state.mission.target.label}`, 26, 664, 16, PALETTE.muted, 'left');
    }
    // Context hint.
    const hint = state.player.inCar ? 'E: get out   WASD: drive' : 'E: interact / steal car   Space: punch';
    text(hint, 12, 706, 16, PALETTE.muted, 'left');
    // Toast.
    if (state.toastTimer > 0 && state.toast) {
      text(state.toast, s / 2, 120, 22, PALETTE.text, 'center');
    }
    drawMinimap(state, time);
  }

  function drawMinimap(state, time) {
    const mw = 190;
    const mh = 142;
    const x0 = 1280 - mw - 12;
    const y0 = 108;
    const sx = mw / WORLD.width;
    const sy = mh / WORLD.height;
    rect(x0, y0, mw, mh, 'rgba(7, 10, 20, 0.85)');
    context.save();
    context.beginPath();
    context.rect(x0, y0, mw, mh);
    context.clip();
    context.fillStyle = PALETTE.road;
    for (const x of ROADS_X) context.fillRect(x0 + x * sx - 2, y0, 4, mh);
    for (const y of ROADS_Y) context.fillRect(x0, y0 + y * sy - 2, mw, 4);
    context.fillStyle = PALETTE.water;
    context.fillRect(x0, y0 + HARBOR.y * sy, mw, mh - HARBOR.y * sy);
    const m = state.mission;
    if (m) {
      context.fillStyle = PALETTE.neonPink;
      context.beginPath();
      context.arc(x0 + m.target.x * sx, y0 + m.target.y * sy, 5 + Math.sin(time * 5) * 1.5, 0, Math.PI * 2);
      context.fill();
    }
    for (const car of state.cars) {
      if (!car.active || car.kind !== 'police') continue;
      context.fillStyle = '#60a5fa';
      context.fillRect(x0 + car.x * sx - 2, y0 + car.y * sy - 2, 4, 4);
    }
    context.fillStyle = PALETTE.neonGreen;
    context.beginPath();
    context.arc(x0 + state.player.x * sx, y0 + state.player.y * sy, 4, 0, Math.PI * 2);
    context.fill();
    context.restore();
    context.strokeStyle = PALETTE.muted;
    context.lineWidth = 1;
    context.strokeRect(x0, y0, mw, mh);
  }

  function drawPanel(title, lines, prompt, accent) {
    const height = PANEL.top + lines.length * PANEL.line + PANEL.bottom;
    const x = (VIEW.w - PANEL.width) / 2;
    const y = (VIEW.h - height) / 2;
    rect(x, y, PANEL.width, height, PALETTE.panel);
    context.strokeStyle = accent ?? PALETTE.neonPink;
    context.lineWidth = 3;
    context.strokeRect(x, y, PANEL.width, height);
    text(title, VIEW.w / 2, y + 72, 44, PALETTE.text, 'center');
    for (let i = 0; i < lines.length; i += 1) {
      text(lines[i], VIEW.w / 2, y + PANEL.top + i * PANEL.line, 19, PALETTE.muted, 'center');
    }
    text(prompt, VIEW.w / 2, y + height - 32, 22, PALETTE.neonYellow, 'center');
  }

  function draw(state, screen, best, time) {
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = PALETTE.backdrop;
    context.fillRect(0, 0, canvas.width, canvas.height);
    // Camera follows the player, clamped to the city.
    const scale = Math.min(canvas.width / VIEW.w, canvas.height / VIEW.h);
    const ox = (canvas.width - VIEW.w * scale) / 2;
    const oy = (canvas.height - VIEW.h * scale) / 2;
    const tx = clamp(state.player.x - VIEW.w / 2, 0, WORLD.width - VIEW.w);
    const ty = clamp(state.player.y - VIEW.h / 2, 0, WORLD.height - VIEW.h);
    camX = tx;
    camY = ty;
    context.save();
    context.setTransform(scale, 0, 0, scale, ox, oy);
    context.translate(-camX, -camY);
    drawCity(state, time);
    // Mission marker.
    const m = state.mission;
    if (m && screen === SCREEN_PLAY) {
      const pulse = 26 + Math.sin(time * 5) * 6;
      context.strokeStyle = PALETTE.neonPink;
      context.lineWidth = 4;
      context.beginPath();
      context.arc(m.target.x, m.target.y, pulse, 0, Math.PI * 2);
      context.stroke();
      context.beginPath();
      context.moveTo(m.target.x, m.target.y - pulse - 18);
      context.lineTo(m.target.x - 10, m.target.y - pulse - 2);
      context.lineTo(m.target.x + 10, m.target.y - pulse - 2);
      context.closePath();
      context.fillStyle = PALETTE.neonPink;
      context.fill();
    }
    for (const car of state.cars) if (car.active) drawCar(car, time);
    for (const ped of state.peds) {
      if (!ped.active) continue;
      context.fillStyle = PALETTE.ped;
      context.beginPath();
      context.arc(ped.x, ped.y, 6, 0, Math.PI * 2);
      context.fill();
    }
    // Player on foot (hidden while driving — the car is the player).
    if (!state.player.inCar) {
      const p = state.player;
      context.fillStyle = PALETTE.player;
      context.beginPath();
      context.arc(p.x, p.y, 13, 0, Math.PI * 2);
      context.fill();
      context.strokeStyle = '#052e16';
      context.lineWidth = 3;
      context.beginPath();
      context.moveTo(p.x, p.y);
      context.lineTo(p.x + Math.cos(p.angle) * 22, p.y + Math.sin(p.angle) * 22);
      context.stroke();
    }
    context.restore();

    // Screen-space HUD / panels.
    context.setTransform(scale, 0, 0, scale, ox, oy);
    if (screen === SCREEN_TITLE) {
      drawPanel('NEON HARBOR HEIST', [
        'A small-time wheelman takes the harbor by storm.',
        'Steal cars, run cargo, dodge the heat — and get rich.',
        '',
        'WASD / arrows: move & drive    E: steal / interact',
        'Space: punch    P: pause    Click: start',
        `Best haul: $${best}    Saved: $${state.money}  REP ${state.rep}`,
      ], 'Press Space or click to start', PALETTE.neonCyan);
      return;
    }
    drawHud(state, time);
    if (screen === SCREEN_PAUSED) {
      drawPanel('Paused', ['The harbor waits for no one — except now.'], 'Press P to resume', PALETTE.neonYellow);
    } else if (screen === SCREEN_OVER) {
      drawPanel('Busted', [
        `Haul this run: $${state.money}    Reputation: ${state.rep}`,
        `Missions finished: ${state.stats.missions}    Cars stolen: ${state.stats.carsStolen}`,
        `Best haul: $${best}`,
      ], 'Press Space or click to run it back', PALETTE.policeLight);
    }
  }

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  resize();
  window.addEventListener('resize', resize);
  return { draw };
}
