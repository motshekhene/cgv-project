/**
 * The one state object passed to every level's update().
 *
 * Use THESE field names everywhere. If level 02 writes `hp` and level 03
 * writes `health`, the HUD ends up reading one of them and silently showing
 * the wrong number in front of a marker.
 */
export class GameState {
  constructor() {
    this.reset();
  }

  reset() {
    // progression
    this.level = "level01"; // 'level01' | 'level02' | 'level03'
    this.phase = 1; // sub-phase inside a level (boss phases, etc.)
    this.paused = false;
    this.timeScale = 1; // 1 normally, < 1 for the Key's slow-mo pulse

    // the player
    this.health = 100;
    this.maxHealth = 100;
    this.stamina = 100;
    this.maxStamina = 100;
    this.boostHeat = 0; // 0..1, level 02
    this.alive = true;

    // scoring and story
    this.distance = 0; // metres travelled in the current level
    this.bestDistance = 0;
    this.letters = []; // ids of dead drops collected, e.g. 'l1-2'
    this.deaths = 0;
  }

  /** Called by Game when a new level starts. Keeps letters, resets the rest. */
  resetForLevel(levelName) {
    this.level = levelName;
    this.phase = 1;
    this.timeScale = 1;
    this.health = this.maxHealth;
    this.stamina = this.maxStamina;
    this.boostHeat = 0;
    this.distance = 0;
    this.alive = true;
  }

  damage(amount) {
    this.health = Math.max(0, this.health - amount);
    if (this.health === 0) this.alive = false;
    return this.alive;
  }

  heal(amount) {
    this.health = Math.min(this.maxHealth, this.health + amount);
  }

  spendStamina(amount) {
    if (this.stamina < amount) return false;
    this.stamina -= amount;
    return true;
  }

  regenStamina(perSecond, dt) {
    this.stamina = Math.min(this.maxStamina, this.stamina + perSecond * dt);
  }

  collectLetter(id) {
    if (this.letters.includes(id)) return false;
    this.letters.push(id);
    return true;
  }

  lettersInLevel(levelName) {
    return this.letters.filter((id) => id.startsWith(levelName)).length;
  }
}
