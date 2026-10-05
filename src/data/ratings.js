// Officer combat stats derived from KOEI's Romance of the Three Kingdoms XIV ratings
// (統率 Leadership, 武力 War, 知力 Intelligence). Xiahou En (LEA 61, WAR 66, INT 50) is the
// anchor: his derived stats equal the original hand tuning, and better generals scale up from him.
//   War  -> HP, damage, super armor, poise, longer combos
//   Lead -> aggression (shorter gaps between attacks), and `command` over nearby soldiers
//           (0 at Xiahou En's 61, 1 at 91): see Crowd.think in actors/grunts.js
//   Int  -> how often he guards
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export function deriveOfficer(r) {
  const dw = r.war - 66, dl = r.lea - 61, di = r.int - 50;
  const might = 0.7 * dw + 0.3 * dl;
  return {
    hp: Math.round((1100 * 1.35 ** (might / 10)) / 10) * 10,
    dmg: 1 + Math.max(0, dw) * 0.012,
    armor: Math.max(0, dw) * 0.006,
    combo: Math.max(0, Math.floor(dw / 12)),
    aggression: clamp(0.75 + dl * 0.005, 0.4, 1.15),
    command: clamp(dl / 30, 0, 1),
    guard: clamp(0.15 + di * 0.008, 0.05, 0.5),
    poise: Math.max(3, Math.round(5 + dw / 10)),
  };
}
