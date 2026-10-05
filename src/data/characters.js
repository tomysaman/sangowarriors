// Character definitions. Adding a hero/officer = adding an entry here.
// `rtk` holds KOEI Romance of the Three Kingdoms XIV ratings; officer combat stats are derived
// from them in data/ratings.js.
import { deriveOfficer } from './ratings.js';

export const ZHAO_YUN = {
  id: 'zhaoyun', name: 'Zhao Yun', courtesy: 'Zilong', cn: '趙雲', title: 'The Lone Rider of Changshan',
  weapon: 'spear', helmet: true, hairTail: true, crestScale: 1.1,
  palette: {
    armor: 0xd8dde3, armorDark: 0x59616b, trim: 0xd4a94a, cloth: '#e9e6dc', motif: '#9fb8a8',
    cloth2: '#2c6a4c', motif2: '#c9a24a', pants: 0x2b3240, leather: 0x3a2a1e, skin: 0xe6bf9c, hair: 0x15110e,
    plume: 0xe9e6e0, cape: 0xf2efe8,
  },
  rtk: { lea: 91, war: 96, int: 76, pol: 65, cha: 81 },
  stats: { hp: 520, attack: 1.0, speed: 7.2 },
  cape: true,
};

export const OFFICERS = {
  xiahouen: {
    id: 'xiahouen', name: 'Xiahou En', cn: '夏侯恩', title: 'Bearer of the Qinggang Sword',
    weapon: 'sword', style: 'sword', helmet: true, crestScale: 0.8, bulk: 1.05,
    palette: {
      armor: 0x5a6a8a, armorDark: 0x2a3142, trim: 0xb08a3a, cloth: '#2a3a6a', motif: '#6a7ab0', cloth2: '#151d38', motif2: '#a08a4a',
      pants: 0x1d2333, leather: 0x1e1712, skin: 0xd8b08e, hair: 0x120e0c, plume: 0x2a3a8a,
    },
    rtk: { lea: 61, war: 66, int: 50, pol: 45, cha: 70 },
    moves: ['S1', 'S2', 'S3'], speed: 5.0,
  },
  zhanghe: {
    id: 'zhanghe', name: 'Zhang He', cn: '張郃', title: 'Wei Vanguard General',
    weapon: 'spear', style: 'spear', helmet: true, crestScale: 1.3, bulk: 1.08, scale: 1.04,
    palette: {
      armor: 0x7a5a8c, armorDark: 0x3a2a48, trim: 0xd0b060, cloth: '#3a2850', motif: '#b08ac8', cloth2: '#6a2a52', motif2: '#e0c070',
      pants: 0x2a1e30, leather: 0x24160f, skin: 0xe0b896, hair: 0x100c0a, plume: 0x9a2a7a,
    },
    rtk: { lea: 89, war: 89, int: 69, pol: 57, cha: 72 },
    moves: ['P1', 'P2', 'P3', 'P4', 'P5'], speed: 5.6,
  },
};

for (const o of Object.values(OFFICERS)) Object.assign(o, deriveOfficer(o.rtk));

export const NPCS = {
  ladymi: {
    id: 'ladymi', name: 'Lady Mi', cn: '糜夫人', style: 'robe', weapon: null, helmet: false, hairTail: false, bun: true, hairpin: true, scale: 0.94, bulk: 0.85,
    palette: { armor: 0x888888, trim: 0xd4af5a, cloth: '#8a2a3a', motif: '#e0b070', cloth2: '#e8dcc8', motif2: '#a03040', pants: 0x6a1e2a, skin: 0xefcaa8, hair: 0x0e0a08, cape: 0xf0e8dc },
  },
  zhangfei: {
    id: 'zhangfei', name: 'Zhang Fei', courtesy: 'Yide', cn: '張飛', weapon: 'serpent', helmet: false, headband: true, beard: true, scale: 1.12, bulk: 1.25,
    palette: {
      armor: 0x3a3a3e, armorDark: 0x1e1e22, trim: 0xa88a40, cloth: '#1e3a26', motif: '#6a8a4a', cloth2: '#2a2a2a', motif2: '#a88a40',
      pants: 0x1a1a1a, leather: 0x1a120c, skin: 0xb88a68, hair: 0x0a0806, plume: 0x1a1a1a,
    },
  },
};
