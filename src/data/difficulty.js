// Difficulty presets. Easy is the original tuning; the others scale enemy pressure and healing.
export const DIFFICULTY = {
  easy: {
    label: 'EASY', desc: 'Forgiving foes. For enjoying the story.',
    enemyDmg: 1.0, gruntHp: 1.0, officerHp: 1.0, extraAttackers: 0, aggro: 1.0, tokenGap: 1.0, gruntCool: 1.0,
    officerCool: 1.0, officerGuard: 1.0, armorChance: 0.55, heal: 1.0,
  },
  normal: {
    label: 'NORMAL', desc: 'Officers hit hard. Dash out of big attacks.',
    enemyDmg: 1.6, gruntHp: 1.25, officerHp: 1.3, extraAttackers: 2, aggro: 1.5, tokenGap: 0.75, gruntCool: 0.8,
    officerCool: 0.75, officerGuard: 1.3, armorChance: 0.65, heal: 0.8,
  },
  hard: {
    label: 'HARD', desc: 'A true test of the Lone Rider. Every hit counts.',
    enemyDmg: 2.0, gruntHp: 1.5, officerHp: 1.5, extraAttackers: 4, aggro: 2.0, tokenGap: 0.55, gruntCool: 0.6,
    officerCool: 0.55, officerGuard: 1.6, armorChance: 0.75, heal: 0.6,
  },
};

export const DIFFICULTY_ORDER = ['easy', 'normal', 'hard'];

// Live settings read by the actors. Mutated in place so importers always see the current values.
export const D = { name: 'normal', ...DIFFICULTY.normal };

export function setDifficulty(name) {
  if (!DIFFICULTY[name]) return;
  Object.assign(D, DIFFICULTY[name], { name });
  try { localStorage.setItem('sw-difficulty', name); } catch { /* ignore */ }
}

export function loadDifficulty() {
  let saved = null;
  try { saved = localStorage.getItem('sw-difficulty'); } catch { /* ignore */ }
  setDifficulty(DIFFICULTY[saved] ? saved : 'normal');
  return D.name;
}
