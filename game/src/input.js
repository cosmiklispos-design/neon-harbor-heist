// Keyboard and pointer input. Held keys give a movement vector; one-shot
// presses (confirm, interact, punch, pause) are queued as bit flags and taken
// once by the loop, so a press between two frames is never lost or counted twice.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_INTERACT = 4;
export const ACTION_PUNCH = 8;

const UP = new Set(['ArrowUp', 'KeyW']);
const DOWN = new Set(['ArrowDown', 'KeyS']);
const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);
const CONFIRM = new Set(['Enter']);
const INTERACT = new Set(['KeyE']);
const PUNCH = new Set(['Space']);
const PAUSE = new Set(['KeyP', 'Escape']);

export function createInput(target) {
  let up = false;
  let down = false;
  let left = false;
  let right = false;
  let actions = 0;

  function clear() {
    up = down = left = right = false;
  }

  window.addEventListener('keydown', (event) => {
    if (UP.has(event.code)) up = true;
    else if (DOWN.has(event.code)) down = true;
    else if (LEFT.has(event.code)) left = true;
    else if (RIGHT.has(event.code)) right = true;
    else if (CONFIRM.has(event.code)) {
      if (!event.repeat) actions |= ACTION_CONFIRM;
    } else if (INTERACT.has(event.code)) {
      if (!event.repeat) actions |= ACTION_INTERACT;
    } else if (PUNCH.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PUNCH;
    } else if (PAUSE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PAUSE;
    } else return;
    event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    if (UP.has(event.code)) up = false;
    else if (DOWN.has(event.code)) down = false;
    else if (LEFT.has(event.code)) left = false;
    else if (RIGHT.has(event.code)) right = false;
  });
  // A key released while the tab is hidden never sends keyup: let go on blur.
  window.addEventListener('blur', clear);
  target.addEventListener('pointerdown', () => {
    actions |= ACTION_CONFIRM;
  });

  return {
    /** Normalised movement vector {x, y} in world space (y down). */
    vector() {
      const x = (right ? 1 : 0) - (left ? 1 : 0);
      const y = (down ? 1 : 0) - (up ? 1 : 0);
      if (x === 0 && y === 0) return { x: 0, y: 0 };
      const len = Math.hypot(x, y);
      return { x: x / len, y: y / len };
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
