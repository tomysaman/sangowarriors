# Sango Warriors: The Lone Rider of Changban

A Dynasty Warriors-style musou action game built with Three.js (r186) and Vite. You play Zhao Yun in a single chapter based on the Battle of Changban (*Romance of the Three Kingdoms*, ch. 41).

All 3D art, textures, animation and audio are generated procedurally at runtime. The only asset files are the character portraits in `src/assets/portraits/`, taken from KOEI's *Romance of the Three Kingdoms XI* and named by character id. A character without a portrait file gets a rendered portrait of the 3D model instead.

## Run

```
npm install
npm run dev        # http://localhost:5555
npm run build      # production build in dist/
```

## Controls

| Input | Action |
|---|---|
| WASD | Move |
| Mouse | Camera (click the game to lock the pointer) |
| LMB / J | Normal attack (up to a 6-hit string) |
| RMB / K | Charge attack. After N normals it becomes C(N+1): launcher, rising sweep, thrust barrage, whirlwind, leaping slam, dragon dash |
| Space | Jump (attack in the air for a plunging strike) |
| Shift | Dash / evade |
| L / F | Musou attack when the gauge is full |
| Q | Re-center the camera |
| Esc / P | Pause |

Gamepads are also supported (X: attack, Y: charge, A: jump, B: dash, RB: musou).

## Chapter flow

Break through the Wei vanguard → defeat Xiahou En and take the Qinggang Sword → find Lady Mi at the well → carry A Dou south → defeat Zhang He at the pass → reach Changban Bridge, where Zhang Fei holds the line.

Each beat after the first sets a checkpoint, and dying lets you retry from the latest one.

You can't outrun the chapter. Three Wei palisades span the full width of the road:

- **Vanguard camp gate** (before the village) and **pass gate** (on the escape route): each opens when its Gate Captain falls. He is the large soldier with the red 令 flag. The objective, minimap star and health bar point to him while the gate is shut.
- **Rear gate** (between the pass and the bridge): opens only when Zhang He is defeated. He can no longer be bypassed.

Gates block the hero, soldiers and officers alike. Soldiers don't spawn beyond a closed gate, and once a gate opens, everyone routes through its doorway.

## Difficulty

Choose on the title screen (click, or Left/Right arrows). It is saved in localStorage and defaults to Normal. Presets live in `src/data/difficulty.js`.

| | Easy | Normal | Hard |
|---|---|---|---|
| Enemy damage | ×1.0 | ×1.6 | ×2.0 |
| Officer HP | ×1.0 | ×1.3 | ×1.5 |
| Soldier HP | ×1.0 | ×1.25 | ×1.5 |
| Soldiers attacking at once | phase limit | +2 | +4 |
| Soldier/officer aggression | base | higher | highest |
| Officer guard and super-armor chance | base | higher | highest |
| Healing (buns, well) | ×1.0 | ×0.8 | ×0.6 |

Easy is the original tuning. Scripted button-mash tests (no dashing, one run each, so treat as rough): against Xiahou En, Easy bottomed out at 64% HP, Normal at 45%, Hard at 13%, all wins. Against Zhang He (RTK-derived stats plus his command over nearby soldiers): Easy won at 38% HP lowest. On Normal the mash bot won one of two runs, and with command switched off it won both, at 34% and 45%. A bot that dodges his telegraphed attacks won on Normal at 55% HP lowest and on Hard twice, at 36% and 49%. The vanguard camp gate on Hard took 36 s, lowest HP 88%.

## Officer ratings

Officers are rated with their stats from KOEI's *Romance of the Three Kingdoms XIV*, and their combat stats are derived from those ratings (`src/data/ratings.js`). The ratings show under the officer's name on the health bar.

| Officer | Leadership | War | Intelligence | HP | Damage | Extra super armor | Extra combo hits | Guard |
|---|---|---|---|---|---|---|---|---|
| Xiahou En | 61 | 66 | 50 | 1100 | ×1.0 | +0 | 0 | 0.15 |
| Zhang He | 89 | 89 | 69 | 2290 | ×1.28 | +14% | 1 | 0.30 |
| Zhao Yun (hero, for reference) | 91 | 96 | 76 | | | | | |

**Command.** Leadership also commands the soldiers around an officer: full effect within 18 m of him, fading out by 30 m, and gone the moment he falls. Command runs from 0 at Leadership 61 (Xiahou En) to 1 at 91, so Zhang He's is 0.93. His soldiers:

- take attack turns more often, with up to 2 extra soldiers attacking at once while you're near him (never more than 8 in total, so Hard gets no extra);
- recover up to 30% faster between swings and wind up 0.07 s quicker;
- send no more than 2 attackers at you from the front, so the rest come from your sides and back;
- keep stepping in during their windup instead of letting you walk out of reach;
- tighten the ring around you and shift it ahead of your running direction to cut you off.

None of this changes how fast they move.

Xiahou En is the anchor, so his derived stats equal the original tuning. War drives HP, damage, super armor, poise and combo length. Leadership drives aggression and command, and Intelligence drives how often he guards. Movement speed is hand-set and doesn't come from the ratings. Difficulty multipliers apply on top. To add an officer, give him an `rtk` entry in `characters.js`.

Rating sources: [wikiwiki.jp (Xiahou En)](https://wikiwiki.jp/sangokushi14/%E5%A4%8F%E4%BE%AF%E6%81%A9), [sangokushi-fun.com (Zhang He)](https://sangokushi-fun.com/sangokushi14/bushou-14/data1410620/), [sangokushi-fun.com (Zhao Yun)](https://sangokushi-fun.com/sangokushi14/bushou-14/data1410597/).

## Graphics presets

Choose a preset on the title screen. It is saved in localStorage.

| Preset | Settings |
|---|---|
| Ultra | GTAO (12 samples), 4K shadow map, render scale up to 1.5x |
| High (default) | GTAO (8 samples), 2K shadows, render scale 1.0 |
| Medium | No AO, render scale up to 1.25x |
| Low | No AO or SMAA, reduced grass |

At 1920×1080 with about 65 enemies on screen, the test machine ran Medium at about 69 fps and High at about 53 fps.

## Code layout

- `src/render`: renderer, post-processing chain, color grade shader
- `src/world`: terrain, sky and fog, grass, props, procedural textures, level layout, palisade gates (`gates.js`)
- `src/actors`: hero rig (IK spear-driven animation), move data, officers, instanced crowd, cape cloth sim
- `src/fx`: particles, weapon trail, shockwaves
- `src/story/chapter1.js`: chapter script (all dialogue and beats as data)
- `src/data/characters.js`: character definitions (palettes, stats, movesets)

A new hero or officer is a new entry in `characters.js`. A new chapter is a new script file alongside `chapter1.js`.

## Debug

- `?skip` skips the title, intro cards and opening dialogue.
- In the browser console, `game.debugJump('village' | 'findMi' | 'well' | 'escape' | 'pass' | 'toBridge' | 'bridge')` jumps to a beat.
