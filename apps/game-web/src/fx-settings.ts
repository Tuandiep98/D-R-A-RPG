/**
 * Player effect settings kept in localStorage like the SFX volume; GameView
 * applies them. Both are 0…2 (0 = off, 1 = as authored, 2 = max).
 *   - weapon linh quang brightness (appearance `glow`)
 *   - ngũ hành aura on the character (Lôi arcs around the weapon, …)
 */
const GLOW_KEY = 'rpg.weaponGlow';
const AURA_KEY = 'rpg.elementAura';

function read(key: string): number {
  try {
    const raw = localStorage.getItem(key);
    const v = Number(raw);
    return raw !== null && Number.isFinite(v) ? Math.min(2, Math.max(0, v)) : 1;
  } catch {
    return 1;
  }
}

function save(key: string, level: number): void {
  try {
    localStorage.setItem(key, String(level));
  } catch {
    // Private mode: the setting lasts for this session only.
  }
}

export const getWeaponGlow = (): number => read(GLOW_KEY);
export const saveWeaponGlow = (level: number): void => save(GLOW_KEY, level);
export const getElementAura = (): number => read(AURA_KEY);
export const saveElementAura = (level: number): void => save(AURA_KEY, level);
