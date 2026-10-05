import * as THREE from 'three';
import { Renderer, pickQuality } from './render/renderer.js';
import { installAtmosphericFog, buildSky } from './world/sky.js';
import { makeTerrainTextures } from './world/textures.js';
import { buildTerrain, buildFarMountains } from './world/terrain.js';
import { buildGrass } from './world/grass.js';
import { buildProps, windCloth } from './world/props.js';
import { buildGates, GATES, gateById, setGateOpen, updateGates, nextClosedGate } from './world/gates.js';
import { makeBannerTexture } from './world/textures.js';
import { START, VILLAGE, WELL, PASS, BRIDGE, groundAt, pathInfo, pointAt, CORRIDOR, insideHouse, riverZ, PATH_LENGTH, steerAround } from './world/level.js';
import { Input } from './core/input.js';
import { Audio } from './core/audio.js';
import { CameraRig } from './core/camera.js';
import { Hero } from './actors/hero.js';
import { Crowd } from './actors/grunts.js';
import { Officer, NPC, NPC_POSES } from './actors/officer.js';
import { sweepHits } from './actors/combat.js';
import { Effects } from './fx/effects.js';
import { HUD, sleep } from './ui/hud.js';
import { loadPortraits } from './ui/portraits.js';
import { ZHAO_YUN, OFFICERS, NPCS } from './data/characters.js';
import { CHAPTER1 } from './story/chapter1.js';
import { D, DIFFICULTY_ORDER, loadDifficulty, setDifficulty } from './data/difficulty.js';
import { angleDiff } from './core/noise.js';

const frame = () => new Promise((r) => requestAnimationFrame(r));
const MI_YAW = Math.atan2(-1.2, 1.6);

export class Game {
  constructor() {
    this.canvas = document.getElementById('game');
    this.hud = new HUD(document.getElementById('ui'));
    this.input = new Input(this.canvas);
    this.audio = new Audio();
    this.state = 'loading';
    this.stats = { ko: 0, officers: 0, maxCombo: 0, time: 0 };
    this.combo = 0; this.comboT = 0;
    this.hitStop = 0; this.slowmo = 0; this.slowScale = 1;
    this.time = 0;
    this.items = [];
    this.phase = 'start';
    this.spawnTarget = 0; this.spawnCd = 0;
    this.cine = false;
    this.lastHitSfx = 0;
    this.chapter = CHAPTER1;
    this.passS = pathInfo(PASS.x, PASS.z).s;
    this.runId = 0;
    this.steer = steerAround; // exposed for automated playtests
    window.game = this;
    const qs = new URLSearchParams(location.search);
    this.debugSkip = qs.has('skip');
    this.debugPhase = qs.get('phase');
  }

  // Debug helpers (used by automated checks): teleport to a phase checkpoint.
  debugJump(phase) {
    const map = { village: [VILLAGE.x - 5, VILLAGE.z - 50], well: [WELL.x - 4, WELL.z - 8], pass: [PASS.x + 6, PASS.z - 36], bridge: [BRIDGE.x, BRIDGE.z - 40] };
    const gateCp = { village: 'village', findMi: 'findMi', well: 'findMi', pass: 'zhanghe', bridge: 'toBridge' }[phase];
    if (gateCp) this.setGatesFor(gateCp);
    if (phase === 'findMi') { this.phase = 'village'; this.officers.xiahouen.spawn(VILLAGE.x, VILLAGE.z, 0); this.officers.xiahouen.hit({ dmg: 99999, react: 'knockback' }, this.hero.pos); return; }
    if (phase === 'toBridge') { this.checkpoint = 'toBridge'; this.retry(false); return; }
    if (phase === 'escape') { this.checkpoint = 'escape'; this.retry(false); return; }
    const p = map[phase]; if (p) this.hero.place(p[0], p[1], 0);
  }

  async load() {
    const step = async (p, msg) => { this.hud.loading(p, msg); await frame(); await frame(); };
    await step(0.05, 'Gathering fonts');
    try { await Promise.race([document.fonts.load('170px "Ma Shan Zheng"'), sleep(2500)]); } catch { /* fallback font */ }
    installAtmosphericFog();
    this.qualityName = pickQuality();
    loadDifficulty();
    this.R = new Renderer(this.canvas, this.qualityName);
    const { scene, camera, renderer } = this.R;
    this.scene = scene; this.camera = camera;
    renderer.shadowMap.enabled = true;
    await step(0.15, 'Raising the sky');
    this.sky = buildSky(renderer, scene);
    this.sky.sun.shadow.mapSize.set(this.R.q.shadow, this.R.q.shadow);
    await step(0.25, 'Shaping the land of Jing');
    const tex = makeTerrainTextures();
    scene.add(buildTerrain(tex));
    scene.add(buildFarMountains());
    await step(0.45, 'Growing the grasslands');
    this.grass = buildGrass(scene, this.R.q.grass);
    await step(0.6, 'Setting the village ablaze');
    this.props = buildProps(scene);
    buildGates(scene);
    this.captainFlag = this.buildCaptainFlag();
    this.fx = new Effects(scene, this.props.fires, this.props.smokes);
    this.fx.weaponGlint = (g) => this.fx.glow.emit(g.x, g.y + 1.6 * g.scale, g.z, 0, 0, 0, { r: 3, g: 0.8, b: 0.4, life: 0.25, size: 0.5, grow: 0.5 });
    await step(0.7, 'Forging the dragon spear');
    const ctx = {
      fx: this.fx, audio: this.audio,
      onHit: (hero, move, h, i) => this.heroHit(hero, move, h, i),
      nearestEnemy: (p, r, yaw, cone) => this.nearestEnemy(p, r, yaw, cone),
      onMusou: () => this.onMusou(), onMusouEnd: () => this.onMusouEnd(),
    };
    this.hero = new Hero(scene, ZHAO_YUN, ctx);
    this.crowd = new Crowd(scene);
    this.crowd.fx = this.fx; this.crowd.audio = this.audio;
    this.crowd.onKO = (g) => this.onKO(g);
    this.crowd.onPlayerHit = (g, dmg) => { if (this.hero.takeHit(dmg, g, false)) this.heroHurt(g, false); };
    const octx = {
      audio: this.audio,
      onGuard: (o) => { this.fx.clash(this.tmpV(o.pos.x, o.pos.y + 1.3, o.pos.z)); this.audio.play('clash'); this.cam.shake(0.15); },
      onTelegraph: (o) => { const t = o.rig.tipWorld; this.fx.glow.emit(t.x, t.y, t.z, 0, 0, 0, { r: 4, g: 1.2, b: 0.5, life: 0.35, size: 0.9, grow: 0.6 }); this.audio.play('ui', 0.6); },
      onHeroHurt: (p, heavy) => this.heroHurt(p, heavy),
      onOfficerDown: (o) => this.onOfficerDown(o),
    };
    this.officers = {
      xiahouen: new Officer(scene, OFFICERS.xiahouen, octx),
      zhanghe: new Officer(scene, OFFICERS.zhanghe, octx),
    };
    this.crowd.commanders = Object.values(this.officers);
    this.ladyMi = new NPC(scene, NPCS.ladymi, NPC_POSES.ladyMiKneel);
    this.ladyMi.rig.extras.bundle.visible = true;
    this.ladyMi.place(WELL.x - 1.2, WELL.z + 1.6, MI_YAW);
    this.zhangFei = new NPC(scene, NPCS.zhangfei, NPC_POSES.zhangFeiStand);
    this.zhangFei.place(BRIDGE.x, BRIDGE.z + 6, Math.PI);
    this.wellRubble = this.makeRubble();
    this.cam = new CameraRig(camera);
    await step(0.85, 'Painting portraits');
    try {
      this.hud.portraits = loadPortraits([ZHAO_YUN, OFFICERS.xiahouen, OFFICERS.zhanghe, NPCS.ladymi, NPCS.zhangfei]);
    } catch (e) { console.warn('portraits failed', e); }
    this.hud.setPlayer(ZHAO_YUN);
    await step(0.95, 'Compiling shaders');
    this.R.buildComposer();
    this.hero.place(START.x, START.z, 0);
    this.cam.snapBehind(0);
    this.cam.smoothTarget.copy(this.hero.pos).add(new THREE.Vector3(0, 1.5, 0));
    this.R.renderer.compile(scene, camera);
    this.clock = new THREE.Timer();
    this.state = 'title';
    this.hud.hideLoading();
    this.showTitle();
    if (this.debugSkip) this.startChapter();
    this.loop();
  }

  tmpV(x, y, z) { return new THREE.Vector3(x, y, z); }

  makeRubble() {
    const g = new THREE.Group();
    const m = new THREE.MeshStandardMaterial({ color: 0x8a837a, roughness: 0.95 });
    for (let i = 0; i < 26; i++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.3 + Math.random() * 0.4, 0.2 + Math.random() * 0.25, 0.3 + Math.random() * 0.3), m);
      const a = Math.random() * Math.PI * 2, r = Math.random() * 1.3;
      b.position.set(Math.cos(a) * r, 0.9 + Math.random() * 0.5, Math.sin(a) * r);
      b.rotation.set(Math.random(), Math.random() * 3, Math.random());
      b.castShadow = true; g.add(b);
    }
    g.position.set(WELL.x, groundAt(WELL.x, WELL.z), WELL.z);
    g.visible = false;
    this.scene.add(g);
    return g;
  }

  showTitle() {
    this.hud.showTitle(this.qualityName, (q) => { try { localStorage.setItem('sw-quality', q); } catch { /* ignore */ } location.reload(); },
      D.name, (d) => { setDifficulty(d); this.audio.init(); this.audio.play('step'); });
    const start = () => {
      if (this.state !== 'title') return;
      window.removeEventListener('keydown', onKey); this.canvas.removeEventListener('click', start); this.hud.title?.removeEventListener('click', start);
      this.startChapter();
    };
    const onKey = (e) => {
      if (e.code === 'Enter' || e.code === 'Space') start();
      const step = (e.code === 'ArrowLeft' || e.code === 'KeyA') ? -1 : (e.code === 'ArrowRight' || e.code === 'KeyD') ? 1 : 0;
      if (step) {
        const i = Math.max(0, Math.min(DIFFICULTY_ORDER.length - 1, DIFFICULTY_ORDER.indexOf(D.name) + step));
        this.hud.selectDifficulty(DIFFICULTY_ORDER[i]);
      }
    };
    window.addEventListener('keydown', onKey);
    this.hud.title.addEventListener('click', start);
  }

  async startChapter() {
    this.state = 'intro';
    this.audio.init();
    this.audio.startMusic();
    this.audio.play('gong');
    this.hud.hideTitle();
    for (const o of Object.values(this.officers)) o.hp = o.maxHp = o.def.hp * D.officerHp;
    this.input.pressed.clear();
    if (!this.debugSkip) await this.hud.cards(this.chapter.intro, this.input);
    this.setCheckpoint('start');
    this.cam.clearCinematic();
    this.cam.snapBehind(0);
    this.cam.pitch = 0.22;
    this.state = 'play';
    this.input.wantLock = true;
    this.hud.showHUD(true);
    this.beginPhase('start');
  }

  // ---------------------------------------------------------------- story
  setCheckpoint(name) { this.checkpoint = name; }

  async beginPhase(name) {
    const B = this.chapter.beats;
    this.phase = name;
    if (name === 'start') {
      this.setGatesFor('start');
      this.hero.place(START.x, START.z, 0); this.cam.snapBehind(0);
      this.ladyMi.rig.root.visible = true; this.wellRubble.visible = false;
      this.hero.rig.extras.bundle.visible = false; this.hero.hasBaby = false;
      this.hero.rig.extras.backSword.visible = false; this.hero.hasSword = false; this.hero.dmgMul = 1;
      this.spawnTarget = 32; this.crowd.maxAttackers = 3;
      this.marker = VILLAGE;
      this.hud.objective(B.start.objective);
      if (!this.debugSkip) await this.dialogue(B.start.lines, false);
      this.audio.intensity = 0.6;
    } else if (name === 'village') {
      this.setCheckpoint('village');
      this.marker = null;
      const o = this.officers.xiahouen;
      o.spawn(VILLAGE.x - 2, VILLAGE.z - 8, Math.atan2(this.hero.pos.x - VILLAGE.x, this.hero.pos.z - VILLAGE.z));
      for (let i = 0; i < 6; i++) this.crowd.spawn(o.pos.x + Math.cos(i) * 4, o.pos.z + Math.sin(i) * 4, { captain: i < 2, aggro: 1.2 });
      this.audio.play('officer');
      await this.cutsceneFocus(o, B.xiahouen.lines);
      o.engaged = true;
      this.hud.boss(o);
      this.hud.objective(B.xiahouen.objective);
      this.audio.intensity = 0.9;
    } else if (name === 'findMi') {
      this.hud.boss(null);
      this.hero.hasSword = true; this.hero.dmgMul = 1.35; this.hero.rig.extras.backSword.visible = true;
      this.hud.toast(...B.sword.toast, 3.5);
      this.audio.play('pickup');
      await sleep(1200);
      await this.dialogue(B.sword.lines, false);
      this.hud.objective(B.sword.objective);
      this.marker = WELL;
      this.spawnTarget = 35;
      this.audio.intensity = 0.55;
      this.setCheckpoint('findMi');
    } else if (name === 'well') {
      await this.wellScene();
    } else if (name === 'escape') {
      this.hud.objective(B.well.objective);
      this.marker = PASS;
      this.spawnTarget = 65; this.crowd.maxAttackers = 4;
      this.audio.intensity = 0.85;
      this.setCheckpoint('escape');
    } else if (name === 'zhanghe') {
      this.setCheckpoint('zhanghe');
      const o = this.officers.zhanghe;
      const p = pointAt(pathInfo(PASS.x, PASS.z).s + 10);
      o.spawn(p.x, p.z, Math.atan2(this.hero.pos.x - p.x, this.hero.pos.z - p.z));
      for (let i = 0; i < 8; i++) this.crowd.spawn(o.pos.x + Math.cos(i * 0.8) * 5, o.pos.z + Math.sin(i * 0.8) * 5, { captain: i < 3, aggro: 1.3 });
      this.audio.play('officer');
      await this.cutsceneFocus(o, B.zhanghe.lines);
      o.engaged = true;
      this.hud.boss(o);
      this.hud.objective(B.zhanghe.objective);
      this.audio.intensity = 1;
      this.marker = null;
    } else if (name === 'toBridge') {
      this.hud.boss(null);
      await sleep(900);
      await this.dialogue(B.zhangheDown.lines, false);
      this.officers.zhanghe.rig.root.visible = false; this.officers.zhanghe.active = false;
      this.hud.objective(B.zhangheDown.objective);
      this.marker = { x: BRIDGE.x, z: BRIDGE.z };
      this.spawnTarget = 55;
      this.setCheckpoint('toBridge');
    } else if (name === 'bridge') {
      await this.bridgeScene();
    }
  }

  checkTriggers() {
    const h = this.hero.pos;
    if (this.busyScene) return;
    const d = (p) => Math.hypot(h.x - p.x, h.z - p.z);
    if (this.phase === 'start' && d(VILLAGE) < 40) this.runPhase('village');
    else if (this.phase === 'findMi' && d(WELL) < 6) this.runPhase('well');
    else if (this.phase === 'escape' && (d(PASS) < 30 || pathInfo(h.x, h.z).s > this.passS - 22)) this.runPhase('zhanghe');
    else if (this.phase === 'toBridge' && h.z > BRIDGE.z - BRIDGE.len / 2 - 12) this.runPhase('bridge');
  }

  async runPhase(name) {
    this.busyScene = true;
    try { await this.beginPhase(name); } finally { this.busyScene = false; }
  }

  onOfficerDown(o) {
    this.stats.officers++;
    this.hitStop = 0.25; this.slowmo = 1.4; this.slowScale = 0.25;
    this.cam.shake(0.6);
    this.audio.play('gong');
    this.hud.toast(`${o.def.name} defeated!`, o.def.cn, 3);
    this.dropBun(o.pos.x, o.pos.z);
    const run = this.runId;
    if (o === this.officers.zhanghe) this.openGate(gateById('rear'), false);
    const next = o === this.officers.xiahouen ? ['village', 'findMi'] : o === this.officers.zhanghe ? ['zhanghe', 'toBridge'] : null;
    if (next) setTimeout(() => { if (this.runId === run && this.phase === next[0] && this.hero.alive && this.state === 'play') this.runPhase(next[1]); }, 1600);
  }

  async dialogue(lines, lock = true) {
    if (lock) this.lockControl(true);
    await this.hud.say(lines, this.input);
    if (lock) this.lockControl(false);
  }

  lockControl(v) {
    this.hero.controlLocked = v;
    this.cine = v;
    this.R.grade && (this.letterTarget = v ? 1 : 0);
  }

  async cutsceneFocus(o, lines) {
    this.lockControl(true);
    // clear nearby attackers briefly so the scene reads
    const h = this.hero.pos;
    const toHero = new THREE.Vector3(h.x - o.pos.x, 0, h.z - o.pos.z).normalize();
    const side = new THREE.Vector3(-toHero.z, 0, toHero.x);
    o.yaw = Math.atan2(toHero.x, toHero.z); o.rig.root.rotation.y = o.yaw;
    const camPos = o.pos.clone().addScaledVector(toHero, 3.6).addScaledVector(side, 1.4);
    camPos.y = groundAt(camPos.x, camPos.z) + 1.65;
    this.cam.setCinematic(camPos, o.pos.clone().setY(o.pos.y + 1.45), 3);
    this.paused = 'scene';
    await this.hud.say(lines, this.input);
    this.paused = false;
    this.cam.clearCinematic();
    this.lockControl(false);
  }

  async wellScene() {
    const B = this.chapter.beats.well;
    this.lockControl(true);
    this.paused = 'scene';
    this.crowd.near(WELL.x, WELL.z, 40, (g) => this.crowd.release(g));
    this.spawnTarget = 0;
    const m = this.ladyMi.pos;
    this.hero.place(m.x + Math.sin(MI_YAW) * 1.5, m.z + Math.cos(MI_YAW) * 1.5, MI_YAW + Math.PI);
    const dir = new THREE.Vector3(Math.sin(MI_YAW), 0, Math.cos(MI_YAW));
    const perp = new THREE.Vector3(-dir.z, 0, dir.x);
    const mid = m.clone().addScaledVector(dir, 0.8);
    { const a = mid.clone().addScaledVector(perp, 3.4), b = mid.clone().addScaledVector(perp, -3.4);
      if (Math.hypot(b.x - WELL.x, b.z - WELL.z) > Math.hypot(a.x - WELL.x, a.z - WELL.z)) perp.negate(); }
    const camPos = mid.clone().addScaledVector(perp, 3.4).addScaledVector(dir, 0.6);
    camPos.y = groundAt(camPos.x, camPos.z) + 1.35;
    this.cam.setCinematic(camPos, mid.clone().setY(m.y + 1.0), 2);
    this.hero.anim.setOverride(NPC_POSES.heroAtEase, 0.4);
    await this.hud.say(B.lines, this.input);
    this.ladyMi.rig.extras.bundle.visible = false;
    this.hero.rig.extras.bundle.visible = true;
    this.ladyMi.anim.setOverride(NPC_POSES.ladyMiStand, 1.2);
    await sleep(1200);
    await this.fade(1, 1.2);
    this.ladyMi.rig.root.visible = false;
    this.wellRubble.visible = true;
    this.hero.rig.extras.bundle.visible = true; this.hero.hasBaby = true;
    this.audio.intensity = 0.2;
    await this.hud.cards([B.card], this.input);
    this.cam.setCinematic(new THREE.Vector3(this.hero.pos.x - 2.2, this.hero.pos.y + 1.7, this.hero.pos.z + 2.4), this.hero.pos.clone().setY(this.hero.pos.y + 1.4), 3);
    await this.fade(0, 1.2);
    await this.hud.say(B.after, this.input);
    this.hero.anim.override = null; this.hero.anim.stop(0.3);
    this.cam.clearCinematic();
    this.paused = false;
    this.lockControl(false);
    this.hero.hp = Math.min(this.hero.maxHp, this.hero.hp + this.hero.maxHp * 0.5 * D.heal);
    this.phase = 'escape';
    await this.beginPhase('escape');
  }

  async bridgeScene() {
    const B = this.chapter.beats.bridge;
    this.lockControl(true);
    this.paused = 'scene';
    this.spawnTarget = 0;
    const zf = this.zhangFei.pos;
    this.cam.setCinematic(new THREE.Vector3(zf.x + 4, zf.y + 2.2, zf.z - 7), zf.clone().setY(zf.y + 1.6), 1.8);
    await this.hud.say(B.lines, this.input);
    // Zhao Yun crosses; Zhang Fei steps forward and roars
    this.hero.place(BRIDGE.x - 1.2, BRIDGE.z + 12, 0);
    this.zhangFei.place(BRIDGE.x, BRIDGE.z - 10, Math.PI);
    this.zhangFei.anim.setOverride(NPC_POSES.zhangFeiRoar, 0.5);
    this.cam.setCinematic(new THREE.Vector3(BRIDGE.x + 3, this.zhangFei.pos.y + 1.4, BRIDGE.z - 4), this.zhangFei.pos.clone().setY(this.zhangFei.pos.y + 1.7), 2.5);
    await sleep(600);
    this.audio.play('boom'); this.audio.play('officer');
    this.cam.shake(1.2);
    this.fx.shockwave(this.zhangFei.pos, 12, new THREE.Color(1, 0.6, 0.3), true);
    this.crowd.near(this.zhangFei.pos.x, this.zhangFei.pos.z, 40, (g) => { if (g.alive) this.crowd.hit(g, { dmg: 0, react: 'knockback', force: 8, up: 4 }, this.zhangFei.pos); });
    await this.hud.say([B.roar], this.input);
    this.hero.startMove('VICTORY');
    this.cam.setCinematic(new THREE.Vector3(this.hero.pos.x + 2.5, this.hero.pos.y + 1.5, this.hero.pos.z + 3.5), this.hero.pos.clone().setY(this.hero.pos.y + 1.5), 2);
    await sleep(2400);
    await this.fade(1, 1.5);
    this.audio.play('gong');
    await this.hud.cards([B.card], this.input);
    this.finish(true);
  }

  fade(to, dur) {
    return new Promise((res) => { this.fadeAnim = { from: this.R.grade.uniforms.fade.value, to, t: 0, dur, res }; });
  }

  finish(win) {
    this.state = 'results';
    document.exitPointerLock?.();
    this.input.wantLock = false;
    this.hud.showHUD(false);
    this.hud.boss(null);
    this.hud.results(win, this.stats, () => this.retry(win), D.label);
  }

  retry(fromStart) {
    this.runId++;
    this.R.grade.uniforms.fade.value = 0;
    this.crowd.clear();
    this.items.forEach((i) => this.scene.remove(i.mesh)); this.items = [];
    for (const o of Object.values(this.officers)) { o.active = false; o.rig.root.visible = false; o.hp = o.maxHp; o.alive = true; o.state = 'idle'; o.engaged = false; o.move = null; o.anim.stop(0.01); }
    const h = this.hero;
    h.alive = true; h.hp = h.maxHp; h.state = 'free'; h.move = null; h.controlLocked = false; h.anim.override = null; h.anim.stop(0.01);
    this.zhangFei.place(BRIDGE.x, BRIDGE.z + 6, Math.PI); this.zhangFei.anim.setOverride(NPC_POSES.zhangFeiStand, 0.01);
    this.ladyMi.anim.setOverride(NPC_POSES.ladyMiKneel, 0.01);
    this.ladyMi.rig.extras.bundle.visible = true;
    this.lockControl(false); this.paused = false; this.cam.clearCinematic();
    if (fromStart) { this.stats = { ko: 0, officers: 0, maxCombo: 0, time: 0 }; this.checkpoint = 'start'; }
    this.hud.boss(null);
    this.setGatesFor(this.checkpoint);
    this.state = 'play';
    this.input.wantLock = true;
    this.hud.showHUD(true);
    const cp = this.checkpoint;
    const B = this.chapter.beats;
    if (cp === 'start') this.runPhase('start');
    else if (cp === 'village') {
      h.place(VILLAGE.x - 5, VILLAGE.z - 52, 0.2);
      this.ladyMi.rig.root.visible = true; this.wellRubble.visible = false;
      this.phase = 'start'; this.marker = VILLAGE; this.spawnTarget = 40; this.hud.objective(B.start.objective);
    } else if (cp === 'findMi') {
      const p = VILLAGE; h.place(p.x - 4, p.z - 20, 0.3);
      h.hasSword = true; h.dmgMul = 1.35; h.rig.extras.backSword.visible = true;
      this.ladyMi.rig.root.visible = true; this.wellRubble.visible = false;
      this.phase = 'findMi'; this.marker = WELL; this.spawnTarget = 35; this.hud.objective(B.sword.objective);
    } else {
      h.hasSword = true; h.dmgMul = 1.35; h.rig.extras.backSword.visible = true;
      h.hasBaby = true; h.rig.extras.bundle.visible = true;
      this.ladyMi.rig.root.visible = false; this.wellRubble.visible = true;
      if (cp === 'escape') { h.place(WELL.x - 6, WELL.z + 6, 0); this.runPhase('escape'); }
      else if (cp === 'zhanghe') { const p = pointAt(this.passS - 45); h.place(p.x, p.z, p.dir); this.runPhase('escape'); }
      else { const p = pointAt(pathInfo(PASS.x, PASS.z).s + 16); h.place(p.x, p.z, p.dir); this.phase = 'toBridge'; this.marker = { x: BRIDGE.x, z: BRIDGE.z }; this.spawnTarget = 55; this.hud.objective(B.zhangheDown.objective); }
    }
    this.cam.snapBehind(h.yaw);
  }

  // ---------------------------------------------------------------- combat
  nearestEnemy(p, r, yaw, cone) {
    let best = null, bd = r;
    const consider = (x, z, ref) => {
      const d = Math.hypot(x - p.x, z - p.z);
      if (d > bd) return;
      if (Math.abs(angleDiff(yaw, Math.atan2(x - p.x, z - p.z))) > cone) return;
      bd = d; best = { x, z, ref };
    };
    for (const g of this.crowd.g) if (g.active && g.alive && !g.airborne) consider(g.x, g.z, g);
    for (const o of Object.values(this.officers)) if (o.active && o.alive) consider(o.pos.x, o.pos.z, o);
    return best;
  }

  heroHit(hero, move, h, idx) {
    const key = hero.serial * 100 + idx;
    const c = Math.cos(hero.yaw), s = Math.sin(hero.yaw);
    let landed = 0;
    // one-shot FX at window open
    if (h.fx && !hero.firedFx.has(key)) {
      hero.firedFx.add(key);
      const ax = hero.pos.x + (h.area ? h.area.x * c + h.area.z * s : hero.forward.x * 2), az = hero.pos.z + (h.area ? -h.area.x * s + h.area.z * c : hero.forward.z * 2);
      const p = this.tmpV(ax, groundAt(ax, az), az);
      if (h.fx === 'slam') { this.fx.shockwave(p, 4, new THREE.Color(1, 0.75, 0.45)); this.cam.shake(0.45); }
      else if (h.fx === 'bigslam') { this.fx.shockwave(p, 7, new THREE.Color(1, 0.7, 0.4), true); this.cam.shake(0.8); this.R.grade.uniforms.flash.value = 0.25; }
      else if (h.fx === 'dragon') { this.fx.dragonBurst(p, hero.forward); this.cam.shake(1.2); this.R.grade.uniforms.flash.value = 0.25; this.slowmo = 0.6; this.slowScale = 0.3; }
      else if (h.fx === 'burst') { this.fx.shockwave(this.tmpV(hero.pos.x + hero.forward.x * 2.5, hero.pos.y, hero.pos.z + hero.forward.z * 2.5), 3.5, new THREE.Color(0.7, 0.9, 1.3)); this.cam.shake(0.5); }
    }
    const tryTarget = (tx, ty, tz, rad, hgt, hitSet, apply) => {
      if (hitSet.has(key)) return;
      let contact = null;
      if (h.area) {
        const ax = hero.pos.x + h.area.x * c + h.area.z * s, az = hero.pos.z - h.area.x * s + h.area.z * c;
        if (Math.hypot(tx - ax, tz - az) < h.area.r + rad && Math.abs(ty - hero.pos.y) < 2.5) contact = this.tmpV(tx, ty + 1.1, tz);
      }
      if (!contact) contact = sweepHits(hero.segments, tx, ty, tz, rad, hgt);
      if (!contact && h.arc) {
        const d = Math.hypot(tx - hero.pos.x, tz - hero.pos.z);
        if (d < h.arc && Math.abs(angleDiff(hero.yaw, Math.atan2(tx - hero.pos.x, tz - hero.pos.z))) < 0.9) contact = this.tmpV(tx, ty + 1.1, tz);
      }
      if (!contact) return;
      hitSet.add(key);
      if (apply(contact)) landed++;
    };
    const reach = 7 + (h.area?.r ?? 0);
    for (const g of this.crowd.g) {
      if (!g.active || !g.alive) continue;
      const dx = g.x - hero.pos.x, dz = g.z - hero.pos.z;
      if (dx * dx + dz * dz > reach * reach) continue;
      if (g.hitSerial !== hero.serial) { g.hitSerial = hero.serial; g.hitIds.clear(); }
      tryTarget(g.x, g.y, g.z, 0.55, 1.6 * g.scale, g.hitIds, (p) => {
        this.crowd.hit(g, h, hero.pos, hero.dmgMul);
        this.fx.hitSpark(p, hero.forward, h.dmg > 35 ? 1.4 : 1);
        return true;
      });
    }
    for (const o of Object.values(this.officers)) {
      if (!o.active || !o.alive) continue;
      if (Math.hypot(o.pos.x - hero.pos.x, o.pos.z - hero.pos.z) > reach) continue;
      if (o.hitSerial !== hero.serial) { o.hitSerial = hero.serial; o.hitSet = new Set(); }
      tryTarget(o.pos.x, o.pos.y, o.pos.z, 0.6, o.height, o.hitSet, (p) => {
        const r = o.hit(h, hero.pos, hero.dmgMul);
        if (r === 'guard') return false;
        this.fx.hitSpark(p, hero.forward, 1.3, true);
        return true;
      });
    }
    if (landed) {
      this.combo += landed; this.comboT = 2.4;
      this.stats.maxCombo = Math.max(this.stats.maxCombo, this.combo);
      if (!hero.move?.musou) hero.musou = Math.min(100, hero.musou + Math.min(landed, 4) * 0.45);
      this.hitStop = Math.max(this.hitStop, (h.stop ?? 0.04) * (move.musou ? 0.5 : 1));
      this.cam.shake((h.shake ?? 0.1) * Math.min(2, 0.6 + landed * 0.2));
      const now = performance.now();
      if (now - this.lastHitSfx > 45) { this.audio.play('hit', Math.min(1.4, 0.7 + landed * 0.15)); this.lastHitSfx = now; }
    }
  }

  heroHurt(from, heavy) {
    this.audio.play('hurt');
    this.cam.shake(heavy ? 0.6 : 0.25);
    this.damageFlash = 1;
    this.combo = 0;
  }

  async onDefeat() {
    if (this.defeatPending) return;
    this.defeatPending = true;
    const run = this.runId;
    this.slowmo = 2; this.slowScale = 0.3;
    this.audio.play('gong');
    await sleep(2600);
    this.defeatPending = false;
    if (run === this.runId && this.state === 'play') this.finish(false);
  }

  // ---------------------------------------------------------------- palisade gates
  // Gate states implied by each checkpoint. A gate is open once the story has passed it.
  setGatesFor(cp) {
    const order = ['start', 'village', 'findMi', 'escape', 'zhanghe', 'toBridge'];
    const openFrom = { camp: 1, pass: 4, rear: 5 };
    const i = Math.max(0, order.indexOf(cp));
    for (const g of GATES) {
      setGateOpen(g, i >= openFrom[g.id], true);
      g.captain = null;
      if (g.flag) g.flag.visible = false;
    }
    this.gateMarker = null; this.gateObjective = null;
    if (this.hud.bossRef?.gateCaptain) this.hud.boss(null);
  }

  buildCaptainFlag() {
    const mat = windCloth(new THREE.MeshStandardMaterial({ map: makeBannerTexture('令', '#8a1c14', '#f3e3bc', '#3a0806'), side: THREE.DoubleSide, roughness: 0.85 }), 0.25);
    const wood = new THREE.MeshStandardMaterial({ color: 0x3a2416, roughness: 0.7 });
    return () => {
      const g = new THREE.Group();
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 2.6, 6), wood);
      pole.position.y = 2.0; pole.castShadow = true; g.add(pole);
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.75, 1.3, 8, 4).translate(0.375, 0, 0), mat);
      flag.position.set(0.03, 2.65, 0); flag.rotation.y = Math.PI / 2; flag.castShadow = true; g.add(flag);
      g.visible = false;
      this.scene.add(g);
      return g;
    };
  }

  // Keep a Gate Captain and garrison in front of each closed gate the current phase must pass.
  updateGateGarrisons() {
    const h = this.hero.pos;
    const hs = pathInfo(h.x, h.z).s;
    let focus = null;
    for (const gate of GATES) {
      if (gate.open || gate.opener !== 'captain' || gate.phase !== this.phase) continue;
      if (gate.captain && (!gate.captain.active || gate.captain.gateCaptain !== gate)) gate.captain = null;
      if (!gate.captain && gate.s - hs < 95) this.spawnGarrison(gate);
      if (gate.captain && gate.s - hs < 140) focus = gate;
    }
    this.gateMarker = focus?.captain ?? null;
    if (focus && this.gateObjective !== focus.id && !this.busyScene) {
      this.gateObjective = focus.id;
      this.hud.objective('A Wei palisade blocks the road — defeat the Gate Captain (令) to open the gate');
    }
    for (const gate of GATES) {
      const c = gate.captain;
      if (!gate.flag) continue;
      gate.flag.visible = !!(c && c.active && c.alive);
      if (gate.flag.visible) { gate.flag.position.set(c.x - Math.sin(c.yaw) * 0.3, c.y, c.z - Math.cos(c.yaw) * 0.3); gate.flag.rotation.y = c.yaw; }
    }
    // the captain's health bar shows while the hero is near him
    const c = focus?.captain;
    if (c && !this.hud.bossRef && Math.hypot(c.x - h.x, c.z - h.z) < 26) this.hud.boss(c);
    else if (this.hud.bossRef?.gateCaptain && (!c || this.hud.bossRef !== c || Math.hypot(c.x - h.x, c.z - h.z) > 40)) this.hud.boss(null);
  }

  spawnGarrison(gate) {
    const px = gate.x - gate.tx * 8, pz = gate.z - gate.tz * 8;
    const opts = {
      captain: true, gateCaptain: gate, keep: true, hp: 420 * D.gruntHp, scale: 1.3, aggro: 1.4, type: 'spear',
      post: { x: px, z: pz, r: 24 }, yaw: Math.atan2(-gate.tx, -gate.tz),
      def: { cn: '門將', name: 'Gate Captain', title: 'Wei palisade' },
    };
    let c = this.crowd.spawn(px, pz, opts);
    if (!c) {
      // crowd is full: free the farthest ordinary soldier to make room
      let far = null, fd = -1;
      for (const g of this.crowd.g) {
        if (!g.active || g.keep) continue;
        const d = Math.hypot(g.x - this.hero.pos.x, g.z - this.hero.pos.z);
        if (d > fd) { fd = d; far = g; }
      }
      if (far) this.crowd.release(far);
      c = this.crowd.spawn(px, pz, opts);
    }
    if (!c) return;
    gate.captain = c;
    gate.flag ??= this.captainFlag();
    for (let i = 0; i < 12; i++) {
      const lat = (Math.random() * 2 - 1) * 14, back = 4 + Math.random() * 12;
      const x = gate.x + gate.lx * lat - gate.tx * back, z = gate.z + gate.lz * lat - gate.tz * back;
      if (insideHouse(x, z, 1)) continue;
      this.crowd.spawn(x, z, { captain: i < 2, aggro: 1.2, yaw: opts.yaw });
    }
  }

  openGate(gate, announce) {
    if (!gate || gate.open) return;
    setGateOpen(gate, true);
    if (this.hud.bossRef?.gateCaptain === gate) this.hud.boss(null);
    if (gate.flag) gate.flag.visible = false;
    gate.captain = null;
    this.gateMarker = null; this.gateObjective = null;
    this.audio.play('boom');
    this.cam.shake(0.35);
    this.fx.dust(this.tmpV(gate.x, groundAt(gate.x, gate.z) + 0.3, gate.z), 26, 1.2, 3);
    if (announce) {
      this.audio.play('gong');
      this.hud.toast('The gate is open!', 'Gate Captain defeated', 3);
      const B = this.chapter.beats;
      const obj = this.phase === 'start' ? B.start.objective : this.phase === 'escape' ? B.well.objective : null;
      if (obj) setTimeout(() => { if (this.state === 'play') this.hud.objective(obj); }, 1500);
    }
  }

  onKO(g) {
    this.stats.ko++;
    if (g.gateCaptain) this.openGate(g.gateCaptain, true);
    if (Math.random() < (g.captain ? 0.25 : 0.03)) this.dropBun(g.x, g.z);
  }

  onMusou() {
    this.slowmo = 0.55; this.slowScale = 0.35;
    this.cam.fovKick = -8;
    this.R.grade.uniforms.flash.value = 0.15;
    this.musouFx = 1;
  }
  onMusouEnd() { this.musouFx = 0; }

  dropBun(x, z) {
    const g = new THREE.Group();
    const bun = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 12), new THREE.MeshStandardMaterial({ color: 0xf3ead8, roughness: 0.7 }));
    bun.scale.set(1, 0.7, 1); bun.position.y = 0.16; g.add(bun);
    const top = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.08, 8), bun.material); top.position.y = 0.3; g.add(top);
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.28, 0.04, 18), new THREE.MeshStandardMaterial({ color: 0x6a2a1a, roughness: 0.4 }));
    g.add(plate);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.4, 0.55, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffc860, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }));
    ring.position.y = 0.03; g.add(ring);
    g.position.set(x, groundAt(x, z), z);
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    this.scene.add(g);
    this.items.push({ mesh: g, x, z, t: 0 });
  }

  updateItems(dt) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.t += dt;
      it.mesh.rotation.y += dt * 1.5;
      it.mesh.children[3].scale.setScalar(1 + Math.sin(it.t * 4) * 0.12);
      if (Math.hypot(this.hero.pos.x - it.x, this.hero.pos.z - it.z) < 1.3 && this.hero.alive) {
        this.hero.hp = Math.min(this.hero.maxHp, this.hero.hp + this.hero.maxHp * 0.35 * D.heal);
        this.fx.pickup(it.mesh.position); this.audio.play('pickup');
        this.hud.toast('Meat Bun', 'Health restored', 1.4);
        this.scene.remove(it.mesh); this.items.splice(i, 1);
      } else if (it.t > 60) { this.scene.remove(it.mesh); this.items.splice(i, 1); }
    }
  }

  // ---------------------------------------------------------------- spawning
  updateSpawns(dt) {
    this.spawnCd -= dt;
    if (this.spawnCd > 0 || this.paused) return;
    const alive = this.crowd.g.filter((g) => g.active && g.alive).length;
    if (alive >= this.spawnTarget) return;
    this.spawnCd = 0.6;
    const hs = pathInfo(this.hero.pos.x, this.hero.pos.z).s;
    for (let tries = 0; tries < 6; tries++) {
      const ahead = Math.random() < 0.75;
      let s = Math.min(PATH_LENGTH - 60, Math.max(5, hs + (ahead ? 26 + Math.random() * 30 : -(20 + Math.random() * 15))));
      const wall = nextClosedGate(hs);
      if (wall) s = Math.min(s, wall.s - 6);
      const p = pointAt(s);
      const lat = (Math.random() * 2 - 1) * (CORRIDOR - 8);
      const x = p.x + Math.cos(p.dir) * lat, z = p.z - Math.sin(p.dir) * lat;
      if (Math.hypot(x - this.hero.pos.x, z - this.hero.pos.z) < 20) continue;
      if (insideHouse(x, z, 1) || Math.abs(z - riverZ(x)) < 15) continue;
      const n = 4 + Math.floor(Math.random() * 4);
      const type = Math.random() < 0.5 ? 'spear' : 'sword';
      for (let i = 0; i < n; i++) this.crowd.spawn(x + (Math.random() - 0.5) * 4, z + (Math.random() - 0.5) * 4, { captain: i === 0 && Math.random() < 0.4, type: Math.random() < 0.8 ? type : undefined });
      break;
    }
  }

  // ---------------------------------------------------------------- loop
  loop() {
    requestAnimationFrame(() => this.loop());
    this.clock.update();
    const rawDt = Math.min(this.clock.getDelta(), 0.05);
    this.input.update();
    if (this.input.consume('pause') && this.state === 'play' && !this.busyScene) {
      this.isPaused = !this.isPaused;
      this.hud.pause(this.isPaused, () => { this.isPaused = false; this.hud.pause(false); });
      if (this.isPaused) document.exitPointerLock?.();
    }
    if (this.isPaused) { this.input.endFrame(); return; }

    // time dilation: hitstop + slowmo
    let scale = 1;
    if (this.hitStop > 0) { this.hitStop -= rawDt; scale = 0.04; }
    if (this.slowmo > 0) { this.slowmo -= rawDt; scale = Math.min(scale, this.slowScale); }
    const dt = rawDt * scale;
    this.time += rawDt;
    const h = this.hero;
    const playing = this.state === 'play';

    if (playing) {
      this.stats.time += rawDt;
      if (!this.paused) {
        h.update(dt, this.input, this.cam.yaw, this.props.colliders);
        this.crowd.update(dt, h, this.props.colliders, this.time);
        for (const o of Object.values(this.officers)) o.update(dt, h, this.props.colliders);
        this.updateSpawns(rawDt);
        this.updateGateGarrisons();
        this.updateItems(rawDt);
        this.checkTriggers();
        if (!h.alive) this.onDefeat();
      } else {
        h.update(dt, this.input, this.cam.yaw, this.props.colliders);
        for (const o of Object.values(this.officers)) if (o.active) { o.anim.update(dt); }
      }
      h.animate(dt);
      updateGates(rawDt);
      this.comboT -= rawDt;
      if (this.comboT <= 0) this.combo = 0;
    } else {
      h.anim.update(dt);
      h.cape?.update(dt, groundAt(h.pos.x, h.pos.z));
    }
    this.ladyMi.rig.root.visible && this.ladyMi.update(dt);
    this.zhangFei.update(dt);

    // camera
    const focus = this.tmpV(h.pos.x, h.pos.y + 1.55, h.pos.z);
    if (this.state === 'title' || this.state === 'intro' || this.state === 'loading') {
      const a = this.time * 0.08;
      this.cam.setCinematic(this.tmpV(h.pos.x + Math.sin(a) * 6.5 + 1.5, h.pos.y + 1.1, h.pos.z + Math.cos(a) * 6.5), this.tmpV(h.pos.x + 1.6, h.pos.y + 1.6, h.pos.z), 50);
      h.yaw = 0; h.rig.root.rotation.y = 0;
    }
    this.cam.targetDist = h.move?.musou ? 7.5 : 6.2;
    this.cam.update(rawDt, this.input, focus, h.yaw, false);
    this.input.wantLock = playing && !this.cine;
    this.hud.el.hud.style.opacity = this.cine ? 0 : 1;
    this.hud.el.lockhint.classList.toggle('hidden', !(playing && !this.input.locked && !this.cine && !this.input.usingPad));

    // world updates
    this.sky.update(this.camera, h.pos, this.time);
    this.grass.update(this.time, h.pos, this.camera.position);
    this.props.update(this.time);
    this.fx.update(dt, this.camera.position, h.pos);

    // grade
    const u = this.R.grade.uniforms;
    this.damageFlash = Math.max(0, (this.damageFlash ?? 0) - rawDt * 2);
    const hpLow = playing ? Math.max(0, 0.3 - h.hp / h.maxHp) * 2 : 0;
    u.damage.value = Math.max(this.damageFlash * 0.8, hpLow + Math.sin(this.time * 6) * hpLow * 0.3);
    u.flash.value = Math.max(0, u.flash.value - rawDt * 2.5);
    u.radialBlur.value += ((this.musouFx ? 0.35 : 0) + (this.hitStop > 0 ? 0.25 : 0) - u.radialBlur.value) * Math.min(1, rawDt * 8);
    u.desaturate.value += ((!h.alive ? 0.8 : 0) - u.desaturate.value) * Math.min(1, rawDt * 2);
    u.letterbox.value += (((this.cine || this.state === 'title') ? 1 : 0) - u.letterbox.value) * Math.min(1, rawDt * 3);
    if (this.fadeAnim) {
      const f = this.fadeAnim; f.t += rawDt;
      const k = Math.min(1, f.t / f.dur);
      u.fade.value = f.from + (f.to - f.from) * k;
      if (k >= 1) { this.fadeAnim = null; f.res(); }
    }

    if (playing) this.hud.update(rawDt, {
      hero: h, ko: this.stats.ko, time: this.stats.time, combo: this.combo, camYaw: this.cam.yaw,
      grunts: this.crowd.g, officers: Object.values(this.officers), marker: this.gateMarker ?? this.marker, gates: GATES,
      allies: this.phase === 'toBridge' || this.phase === 'bridge' ? [this.zhangFei.pos] : [],
    });
    this.fpsAcc = (this.fpsAcc ?? 0) + rawDt; this.fpsN = (this.fpsN ?? 0) + 1;
    if (this.fpsAcc > 0.5) { this.hud.el.fps.textContent = `${Math.round(this.fpsN / this.fpsAcc)} fps · ${this.crowd.activeCount} foes`; this.fpsAcc = 0; this.fpsN = 0; }

    this.R.render(rawDt, this.time);
    this.input.endFrame();
    if (this.freezeAt && h.moveName === this.freezeAt.name && h.anim.mt >= this.freezeAt.mt) { this.isPaused = true; this.freezeAt = null; }
  }
}
