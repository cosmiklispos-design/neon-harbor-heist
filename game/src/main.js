// Boot and the one loop: input is read every frame, the world advances in
// fixed 1/60 s steps, and the renderer paints what is there. The game moves
// between four screens: title, play, paused and game over. Sound is
// procedural WebAudio (no audio files, no network).
//
// ?seed=N fixes the random pattern. ?shot=start|play|end (with &seed=N)
// stages that scene instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot.
import { BEST_KEY, SAVE_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import { createWorld, EVENT_BUY, EVENT_CRIME, EVENT_HIT, EVENT_MISSION, EVENT_OVER, EVENT_PICKUP } from './world.js';
import {
  ACTION_CONFIRM, ACTION_INTERACT, ACTION_PAUSE, ACTION_PUNCH, createInput,
} from './input.js';
import { createRenderer, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE } from './render.js';
import { stageShot } from './shots.js';

const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);

// --- Save / best ---
function readSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return { money: 0, rep: 0, best: 0, upgrades: { armor: false, engine: false } };
    const s = JSON.parse(raw);
    return {
      money: s.money | 0, rep: s.rep | 0, best: s.best | 0,
      upgrades: { armor: !!s.upgrades?.armor, engine: !!s.upgrades?.engine },
    };
  } catch { return { money: 0, rep: 0, best: 0, upgrades: { armor: false, engine: false } }; }
}
function writeSave(save) {
  try { window.localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch { /* storage off */ }
}
function readBest() {
  try { return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0; } catch { return 0; }
}
function saveBest(value) {
  try { window.localStorage.setItem(BEST_KEY, String(value)); } catch { /* storage off */ }
}

let save = readSave();
let best = Math.max(readBest(), save.best);

function applySave() {
  world.state.money = save.money;
  world.state.rep = save.rep;
  world.state.upgrades = { ...save.upgrades };
  if (save.upgrades.armor) {
    world.state.player.maxHealth = 150;
    world.state.player.health = 150;
  }
}
applySave();

// --- Procedural sound ---
let audio = null;
let sirenHigh = false;
let lastSiren = 0;
function ensureAudio() {
  if (!audio) {
    try { audio = new (window.AudioContext || window.webkitAudioContext)(); } catch { audio = null; }
  }
  if (audio && audio.state === 'suspended') audio.resume().catch(() => {});
  return audio;
}
function tone(freq, dur, type, gain, when = 0) {
  const ctx = ensureAudio();
  if (!ctx) return;
  const t0 = ctx.currentTime + when;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  osc.connect(g);
  g.connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}
function playSound(events) {
  if (events & EVENT_MISSION) { tone(523, 0.12, 'square', 0.08); tone(659, 0.12, 'square', 0.08, 0.1); tone(784, 0.2, 'square', 0.08, 0.2); }
  if (events & EVENT_PICKUP) tone(880, 0.1, 'sine', 0.08);
  if (events & EVENT_BUY) { tone(660, 0.08, 'square', 0.07); tone(990, 0.14, 'square', 0.07, 0.08); }
  if (events & EVENT_CRIME) tone(110, 0.25, 'sawtooth', 0.1);
  if (events & EVENT_HIT) tone(70, 0.2, 'sawtooth', 0.12);
  if (events & EVENT_OVER) { tone(392, 0.2, 'square', 0.08); tone(311, 0.2, 'square', 0.08, 0.18); tone(233, 0.4, 'square', 0.08, 0.36); }
}

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, scene.best, performance.now() / 1000);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let accumulator = 0;
  let last = performance.now();
  // Actions read once per frame (confirm/pause handled here, interact/punch
  // handed to the next world step) so no press is lost or counted twice.
  let pendingActions = 0;

  function announce(message) {
    status.textContent = message;
  }

  function startGame() {
    ensureAudio();
    pendingActions = 0;
    world.reset();
    applySave();
    accumulator = 0;
    screen = SCREEN_PLAY;
    announce('Playing. Steal a car, run the jobs, dodge the heat.');
  }

  function endGame() {
    screen = SCREEN_OVER;
    save = {
      money: world.state.money, rep: world.state.rep,
      best: Math.max(best, world.state.score),
      upgrades: { ...world.state.upgrades },
    };
    best = save.best;
    writeSave(save);
    saveBest(best);
    playSound(EVENT_OVER);
    announce(`Busted. Haul $${world.state.money}. Best $${best}.`);
  }

  function handleActions() {
    pendingActions |= input.takeActions();
    const actions = pendingActions;
    if (actions & ACTION_CONFIRM && (screen === SCREEN_TITLE || screen === SCREEN_OVER)) startGame();
    else if (actions & ACTION_PUNCH && (screen === SCREEN_TITLE || screen === SCREEN_OVER)) startGame();
    else if (actions & ACTION_PAUSE && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    } else if (actions & (ACTION_PAUSE | ACTION_CONFIRM) && screen === SCREEN_PAUSED) {
      screen = SCREEN_PLAY;
      announce('Playing.');
    }
    pendingActions &= ~(ACTION_CONFIRM | ACTION_PAUSE);
  }

  function step() {
    if (screen === SCREEN_TITLE) {
      world.step(STEP, { vector: { x: 0, y: 0 }, actions: 0 }, true);
      pendingActions = 0;
      return;
    }
    const actions = pendingActions;
    pendingActions = 0;
    const events = world.step(STEP, { vector: input.vector(), actions }, false);
    if (events) playSound(events);
    if (events & EVENT_MISSION) {
      save = { money: world.state.money, rep: world.state.rep, best: Math.max(best, world.state.score), upgrades: { ...world.state.upgrades } };
      writeSave(save);
    }
    if (events & EVENT_OVER) endGame();
    else if (events & EVENT_HIT) announce('Hit! Watch your health.');
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        step();
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    // Police siren while wanted.
    if (screen === SCREEN_PLAY && world.state.wanted > 0 && now - lastSiren > 900) {
      lastSiren = now;
      sirenHigh = !sirenHigh;
      tone(sirenHigh ? 950 : 700, 0.35, 'sine', 0.04);
    }
    renderer.draw(world.state, screen, best, now / 1000);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });
  window.addEventListener('beforeunload', () => {
    save = { money: world.state.money, rep: world.state.rep, best: Math.max(best, world.state.score), upgrades: { ...world.state.upgrades } };
    writeSave(save);
  });

  announce('Neon Harbor Heist. Press Space or click to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
