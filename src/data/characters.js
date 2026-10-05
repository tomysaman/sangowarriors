// Character definitions. Adding a hero/officer = adding an entry here.
// `rtk` holds KOEI Romance of the Three Kingdoms XIV ratings; officer combat stats are derived
// from them in data/ratings.js. Looks (palette, helmet, plume, scarf, headwear, face) follow each
// character's RTK XI portrait in src/assets/portraits.
import { deriveOfficer } from './ratings.js';

export const ZHAO_YUN = {
  id: 'zhaoyun', name: 'Zhao Yun', courtesy: 'Zilong', cn: '趙雲', title: 'The Lone Rider of Changshan',
  weapon: 'spear', helmet: true, hairTail: true, crestScale: 1.1, plume: 'mane', face: { brows: 'thick' },
  palette: {
    armor: 0xd8dde3, armorDark: 0x59616b, trim: 0xd4a94a, cloth: '#dfe2e8', motif: '#a8b4c4',
    cloth2: '#4a5a78', motif2: '#c8d0dc', pants: 0x2b3240, leather: 0x3a2a1e, skin: 0xe2b896, hair: 0x15110e,
    helmetTrim: 0xc9ced6, plume: 0xf4f2ee, tassel: 0xe9e6e0, cape: 0xf2efe8,
  },
  rtk: { lea: 91, war: 96, int: 76, pol: 65, cha: 81 },
  stats: { hp: 520, attack: 1.0, speed: 7.2 },
  cape: true,
};

export const OFFICERS = {
  xiahouen: {
    id: 'xiahouen', name: 'Xiahou En', cn: '夏侯恩', title: 'Bearer of the Qinggang Sword',
    weapon: 'sword', style: 'sword', helmet: true, crestScale: 0.8, bulk: 1.05, crest: 'gem', ridges: false,
    palette: {
      armor: 0x8c9097, armorDark: 0x3c4046, trim: 0xb08a3a, cloth: '#5c6070', motif: '#8a90a0', cloth2: '#5434a8', motif2: '#9a84e0',
      pants: 0x2a2c34, leather: 0x1e1712, skin: 0xd8b08e, hair: 0x120e0c, plume: 0x6a3ae0,
      helmet: 0x9da1a8, helmetTrim: 0x7d8188, gem: 0x2ab8d8, scarf: '#5a36b8', scarfMotif: '#8c74e0',
    },
    rtk: { lea: 61, war: 66, int: 50, pol: 45, cha: 70 },
    moves: ['S1', 'S2', 'S3'], speed: 5.0,
  },
  zhanghe: {
    id: 'zhanghe', name: 'Zhang He', cn: '張郃', title: 'Wei Vanguard General',
    weapon: 'spear', style: 'spear', helmet: true, crestScale: 1.3, bulk: 1.08, scale: 1.04, crest: 'wings', ridges: false,
    palette: {
      armor: 0xb6bac2, armorDark: 0x3a3d44, trim: 0xd0b060, cloth: '#4a2c7a', motif: '#7a5aa8', cloth2: '#d8d6d0', motif2: '#9a968c',
      pants: 0x2a2830, leather: 0x24160f, skin: 0xd8ac86, hair: 0x100c0a, plume: 0xb0c040, tassel: 0xb3121a,
      helmet: 0x1e1e24, helmetTrim: 0xd4a848, scarf: '#4a2c7a', scarfMotif: '#7a5aa8', knot: 0x2a5a32,
    },
    rtk: { lea: 89, war: 89, int: 69, pol: 57, cha: 72 },
    moves: ['P1', 'P2', 'P3', 'P4', 'P5'], speed: 5.6,
  },
};

for (const o of Object.values(OFFICERS)) Object.assign(o, deriveOfficer(o.rtk));

export const NPCS = {
  ladymi: {
    id: 'ladymi', name: 'Lady Mi', cn: '糜夫人', style: 'robe', weapon: null, helmet: false, hairTail: false, bun: true, hairpin: true, flowers: true, scale: 0.94, bulk: 0.85,
    face: { brows: 'fine' },
    palette: { armor: 0x888888, trim: 0xd4af5a, cloth: '#36b0bc', motif: '#9ae4e8', cloth2: '#2a4c9c', motif2: '#e0c070', pants: 0x2a8a96, skin: 0xf2d2b4, hair: 0x0e0a08, cape: 0xf0e8dc, lips: 0xc0505a },
  },
  zhangfei: {
    id: 'zhangfei', name: 'Zhang Fei', courtesy: 'Yide', cn: '張飛', weapon: 'serpent', helmet: false, headband: 'bandana', beard: true, bareArms: true, scale: 1.12, bulk: 1.25,
    face: { grin: true, brows: 'thick' },
    palette: {
      armor: 0x9a9ca2, armorDark: 0x4a4c52, trim: 0xd4a640, cloth: '#2a2a2a', motif: '#5a5a5a', cloth2: '#3a2a20', motif2: '#a88a40',
      pants: 0x1a1a1a, leather: 0x1a120c, skin: 0xa8744e, hair: 0x0a0806, plume: 0x1a1a1a, headband: '#b81e1e', headbandMotif: '#e04a3a',
    },
  },
};
