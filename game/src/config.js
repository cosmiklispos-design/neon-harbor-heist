// Neon Harbor Heist — all tuning numbers and colours in one place.
// The world is a fixed 2400x1800 city; the renderer shows a 1280x720 camera
// window that follows the player, so nothing below depends on the screen size.

export const WORLD = { width: 2400, height: 1800 };

// Roads: a grid of avenues. Cars drive on them, pedestrians on the sidewalks.
export const ROADS_X = [200, 600, 1000, 1400, 1800, 2200];
export const ROADS_Y = [200, 550, 900, 1250, 1600];
export const ROAD_W = 96;

// Harbour water occupies the south edge; the market and police station sit
// on fixed plazas so missions always have a real place to go.
export const HARBOR = { y: 1650, dockX: 950, dockY: 1580 };
export const MARKET = { x: 1400, y: 550 };
export const GARAGE = { x: 600, y: 1250 };
export const POLICE_STATION = { x: 2200, y: 200 };

export const STEP = 1 / 60;

export const PLAYER = {
  radius: 13,
  walkSpeed: 230,
  punchRange: 36,
  punchDamage: 25,
  punchCooldown: 0.45,
};

export const CAR = {
  width: 46,
  length: 78,
  accel: 420,
  brake: 700,
  maxSpeed: 460,
  maxReverse: 160,
  turnRate: 2.6,
};

export const HEALTH = { max: 100 };

export const WANTED = {
  max: 5,
  decayDelay: 8,
  decayRate: 0.25,
  maxPolice: 5,
};

export const MISSION = {
  cargoPay: 300,
  getawayPay: 250,
  sellPay: 150,
  getawaySeconds: 15,
};

export const PRICES = { armor: 200, engine: 300, repair: 100 };

export const PALETTE = {
  backdrop: '#070a14',
  ground: '#10182b',
  road: '#1a2233',
  roadLine: '#3d4a63',
  sidewalk: '#232c42',
  water: '#0a2e4d',
  waterLine: '#1b6ea8',
  building: '#1c2438',
  buildingEdge: '#2f3f63',
  neonPink: '#ff2e88',
  neonCyan: '#22d3ee',
  neonYellow: '#facc15',
  neonGreen: '#4ade80',
  player: '#4ade80',
  police: '#3b82f6',
  policeLight: '#ef4444',
  traffic: '#e2e8f0',
  ped: '#fbbf24',
  panel: 'rgba(10, 14, 26, 0.82)',
  text: '#eef1f5',
  muted: '#8b93a3',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the save (money, reputation, upgrades, best) is kept between visits. */
export const SAVE_KEY = 'neon-harbor-heist.save.v1';
export const BEST_KEY = 'neon-harbor-heist.best.v1';
