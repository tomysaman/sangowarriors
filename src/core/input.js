// Keyboard + mouse (pointer lock) + gamepad, mapped to abstract actions.

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set();   // actions pressed this frame
    this.held = new Set();      // actions currently held
    this.mouseDX = 0; this.mouseDY = 0;
    this.locked = false;
    this.enabled = true;
    this.padPrev = {};
    this.moveX = 0; this.moveY = 0; this.lookX = 0; this.lookY = 0;
    this.usingPad = false;
    this.uiPressed = false; // latched "advance" press for UI (not cleared per frame)

    const keyMap = {
      KeyJ: 'attack', KeyK: 'charge', Space: 'jump', ShiftLeft: 'dodge', ShiftRight: 'dodge',
      KeyL: 'musou', KeyF: 'musou', KeyE: 'interact', Enter: 'confirm', Escape: 'pause', KeyP: 'pause',
    };
    this.keyMap = keyMap;

    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      const a = keyMap[e.code];
      if (a) { this.pressed.add(a); this.held.add(a); }
      if (e.code === 'Enter' || e.code === 'Space' || e.code === 'KeyJ' || e.code === 'KeyE') this.uiPressed = true;
      if (e.code === 'Space' || e.code === 'Tab') e.preventDefault();
      this.usingPad = false;
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      const a = keyMap[e.code];
      if (a) this.held.delete(a);
    });
    window.addEventListener('blur', () => { this.keys.clear(); this.held.clear(); });
    canvas.addEventListener('mousedown', (e) => {
      if (!this.locked && this.wantLock) { canvas.requestPointerLock?.(); }
      const a = e.button === 0 ? 'attack' : e.button === 2 ? 'charge' : null;
      if (a && this.locked) { this.pressed.add(a); this.held.add(a); }
      if (e.button === 0) this.uiPressed = true;
      this.usingPad = false;
    });
    window.addEventListener('mouseup', (e) => {
      const a = e.button === 0 ? 'attack' : e.button === 2 ? 'charge' : null;
      if (a) this.held.delete(a);
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => { this.locked = document.pointerLockElement === canvas; });
    window.addEventListener('mousemove', (e) => {
      if (this.locked) { this.mouseDX += e.movementX; this.mouseDY += e.movementY; }
    });
    this.wantLock = false;
  }

  pollPad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const pad = pads && [...pads].find((p) => p && p.connected);
    if (!pad) return null;
    const dz = (v) => (Math.abs(v) < 0.18 ? 0 : v);
    const btn = (i) => !!(pad.buttons[i] && pad.buttons[i].pressed);
    const map = { attack: 2, charge: 3, jump: 0, dodge: 1, musou: 5, confirm: 0, pause: 9, interact: 0 };
    const any = Object.values(map).some((i) => btn(i)) || Math.abs(pad.axes[0]) > 0.3 || Math.abs(pad.axes[1]) > 0.3;
    if (any) this.usingPad = true;
    for (const [a, i] of Object.entries(map)) {
      const now = btn(i);
      if (now && !this.padPrev[a]) { this.pressed.add(a); if (a === 'confirm' || a === 'attack') this.uiPressed = true; }
      if (now) this.held.add(a); else if (this.padPrev[a]) this.held.delete(a);
      this.padPrev[a] = now;
    }
    return { mx: dz(pad.axes[0]), my: dz(pad.axes[1]), lx: dz(pad.axes[2] ?? 0), ly: dz(pad.axes[3] ?? 0) };
  }

  update() {
    const pad = this.pollPad();
    let x = 0, y = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) y += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) y -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1;
    this.lookX = 0; this.lookY = 0;
    if (pad) {
      if (pad.mx || pad.my) { x = pad.mx; y = -pad.my; }
      this.lookX = pad.lx; this.lookY = pad.ly;
    }
    const len = Math.hypot(x, y);
    if (len > 1) { x /= len; y /= len; }
    this.moveX = x; this.moveY = y;
  }

  consumeUI() { const v = this.uiPressed; this.uiPressed = false; return v; }
  clearUI() { this.uiPressed = false; }

  consume(a) { if (this.pressed.has(a)) { this.pressed.delete(a); return true; } return false; }
  isHeld(a) { return this.held.has(a); }
  endFrame() { this.pressed.clear(); this.mouseDX = 0; this.mouseDY = 0; }
}
