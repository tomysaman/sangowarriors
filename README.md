# Sango Warriors: The Lone Rider of Changban

A Dynasty Warriors-style musou action game built with Three.js (r186) and Vite. You play Zhao Yun in a single chapter based on the Battle of Changban (*Romance of the Three Kingdoms*, ch. 41).

All art, textures, animation and audio are generated procedurally at runtime. There are no external asset files.

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
- `src/world`: terrain, sky and fog, grass, props, procedural textures, level layout
- `src/actors`: hero rig (IK spear-driven animation), move data, officers, instanced crowd, cape cloth sim
- `src/fx`: particles, weapon trail, shockwaves
- `src/story/chapter1.js`: chapter script (all dialogue and beats as data)
- `src/data/characters.js`: character definitions (palettes, stats, movesets)

A new hero or officer is a new entry in `characters.js`. A new chapter is a new script file alongside `chapter1.js`.

## Debug

- `?skip` skips the title, intro cards and opening dialogue.
- In the browser console, `game.debugJump('village' | 'findMi' | 'well' | 'escape' | 'pass' | 'toBridge' | 'bridge')` jumps to a beat.
