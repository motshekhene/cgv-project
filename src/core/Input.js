/**
 * One input system for the whole game. Nobody writes their own keydown
 * listeners — every level asks this object instead:
 *
 *   input.isDown('left')      held right now
 *   input.pressed('jump')     went down this frame (true once)
 *   input.released('block')   came up this frame
 *   input.mouse.dx / .dy      mouse movement since last frame
 *
 * Game calls input.endFrame() after every update, which clears the
 * pressed/released edges and the mouse deltas.
 *
 * Codes are lowercased key names ('a', ' ', 'escape', 'arrowleft') plus
 * 'mouse0' (left), 'mouse1' (middle) and 'mouse2' (right).
 */
export const DEFAULT_BINDINGS = {
  left: ["a", "arrowleft"],
  right: ["d", "arrowright"],
  forward: ["w", "arrowup"],
  back: ["s", "arrowdown"],
  jump: [" ", "arrowup", "w"],
  slide: ["control", "arrowdown", "s"],
  boost: ["shift"],
  dodge: [" "],
  attack: ["mouse0"],
  block: ["mouse2"],
  lookBack: ["mouse2", "c"],
  interact: ["e"],
  ability: ["q"],
  pause: ["escape"],
  restart: ["r"],
};

export class Input {
  constructor(target = window, bindings = DEFAULT_BINDINGS) {
    this.target = target;
    this.bindings = { ...bindings };
    this.down = new Set();
    this.downThisFrame = new Set();
    this.upThisFrame = new Set();
    this.mouse = { x: 0, y: 0, dx: 0, dy: 0 };
    this.enabled = true;

    // bound once so detach() can remove exactly these listeners
    this._onKeyDown = this._onKeyDown.bind(this);
    this._onKeyUp = this._onKeyUp.bind(this);
    this._onMouseDown = this._onMouseDown.bind(this);
    this._onMouseUp = this._onMouseUp.bind(this);
    this._onMouseMove = this._onMouseMove.bind(this);
    this._onBlur = this._onBlur.bind(this);
    this._onContextMenu = this._onContextMenu.bind(this);
  }

  attach() {
    const t = this.target;
    t.addEventListener("keydown", this._onKeyDown);
    t.addEventListener("keyup", this._onKeyUp);
    t.addEventListener("mousedown", this._onMouseDown);
    t.addEventListener("mouseup", this._onMouseUp);
    t.addEventListener("mousemove", this._onMouseMove);
    t.addEventListener("blur", this._onBlur);
    t.addEventListener("contextmenu", this._onContextMenu);
    return this;
  }

  detach() {
    const t = this.target;
    t.removeEventListener("keydown", this._onKeyDown);
    t.removeEventListener("keyup", this._onKeyUp);
    t.removeEventListener("mousedown", this._onMouseDown);
    t.removeEventListener("mouseup", this._onMouseUp);
    t.removeEventListener("mousemove", this._onMouseMove);
    t.removeEventListener("blur", this._onBlur);
    t.removeEventListener("contextmenu", this._onContextMenu);
    this.clear();
  }

  /* ---------------- queries ---------------- */
  codesFor(action) {
    return this.bindings[action] || [];
  }

  isDown(action) {
    for (const code of this.codesFor(action))
      if (this.down.has(code)) return true;
    return false;
  }

  pressed(action) {
    for (const code of this.codesFor(action))
      if (this.downThisFrame.has(code)) return true;
    return false;
  }

  released(action) {
    for (const code of this.codesFor(action))
      if (this.upThisFrame.has(code)) return true;
    return false;
  }

  /** -1, 0 or 1 — handy for lanes and steering. */
  axis(negAction, posAction) {
    return (this.isDown(posAction) ? 1 : 0) - (this.isDown(negAction) ? 1 : 0);
  }

  /** Game calls this after each update. */
  endFrame() {
    this.downThisFrame.clear();
    this.upThisFrame.clear();
    this.mouse.dx = 0;
    this.mouse.dy = 0;
  }

  clear() {
    this.down.clear();
    this.downThisFrame.clear();
    this.upThisFrame.clear();
    this.mouse.dx = this.mouse.dy = 0;
  }

  /* ---------------- listeners ---------------- */
  _press(code) {
    if (!this.down.has(code)) this.downThisFrame.add(code);
    this.down.add(code);
  }

  _release(code) {
    if (this.down.has(code)) this.upThisFrame.add(code);
    this.down.delete(code);
  }

  _onKeyDown(e) {
    if (!this.enabled) return;
    const code = e.key.toLowerCase();
    // stop the page scrolling when the player uses the game keys
    if ([" ", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(code))
      e.preventDefault();
    if (e.repeat) return;
    this._press(code);
  }

  _onKeyUp(e) {
    this._release(e.key.toLowerCase());
  }
  _onMouseDown(e) {
    if (this.enabled) this._press("mouse" + e.button);
  }
  _onMouseUp(e) {
    this._release("mouse" + e.button);
  }

  _onMouseMove(e) {
    this.mouse.dx += e.movementX || 0;
    this.mouse.dy += e.movementY || 0;
    this.mouse.x = e.clientX;
    this.mouse.y = e.clientY;
  }

  _onBlur() {
    this.clear();
  } // alt-tabbing must not leave keys stuck down
  _onContextMenu(e) {
    e.preventDefault();
  } // right click is block, not a menu
}
