import { PATH } from '../world/level.js';
import { DIFFICULTY, DIFFICULTY_ORDER } from '../data/difficulty.js';

const $ = (sel, root = document) => root.querySelector(sel);
// `html` is only for fixed markup. Character names, dialogue and story text go through
// textContent (`el`, `nameNodes`, `rich`) so data is never parsed as HTML.
const html = (s) => { const t = document.createElement('template'); t.innerHTML = s.trim(); return t.content.firstElementChild; };
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const nameNodes = (cn, name) => [el('span', 'cn', cn), name];
// Story card: a string, or an array of strings and { b | date | name } spans. '\n' becomes <br>.
function rich(card) {
  const out = [];
  for (const part of Array.isArray(card) ? card : [card]) {
    if (typeof part === 'string') part.split('\n').forEach((s, i) => { if (i) out.push(el('br')); if (s) out.push(s); });
    else if (part.b != null) out.push(el('b', null, part.b));
    else if (part.date != null) out.push(el('span', 'date', part.date));
    else if (part.name != null) out.push(el('span', 'name', part.name));
  }
  return out;
}

export class HUD {
  constructor(root) {
    this.root = root;
    this.portraits = {};
    root.append(html(`<div id="loading"><div class="seal">趙</div><div class="bar"><i></i></div><div class="msg">Preparing the battlefield</div></div>`));
    root.append(html(`<div id="hud" class="hidden">
      <div id="objective" class="panel"><div class="label">OBJECTIVE</div><div class="text"></div></div>
      <div id="topright"><canvas id="minimap" width="380" height="380"></canvas><div id="ko" class="panel">KO<b>0</b></div><div id="timer">00:00</div></div>
      <div id="boss" class="hidden"><img class="portrait" alt=""><div class="info"><div class="nm"></div><div class="bar hp"><i class="lag"></i><i class="fill"></i></div></div></div>
      <div id="combo"><div class="n">0</div><div class="l">HITS</div></div>
      <div id="player"><div class="portrait"><img alt=""></div><div class="bars"><div class="name"></div>
        <div class="bar hp"><i class="lag"></i><i class="fill"></i></div><div class="bar musou"><i class="fill"></i></div></div></div>
      <div id="buff"></div>
      <div id="toast"><div class="t"></div><div class="s"></div></div>
      <div id="lockhint" class="hidden">Click to control the camera</div>
      <div id="fps"></div>
    </div>`));
    root.append(html(`<div id="dialogue" class="panel"><img alt=""><div><div class="who"></div><div class="line"></div></div><div class="next">ENTER ▸</div></div>`));
    this.el = {
      loading: $('#loading'), hud: $('#hud'), obj: $('#objective .text'), ko: $('#ko b'), timer: $('#timer'),
      boss: $('#boss'), bossImg: $('#boss .portrait'), bossName: $('#boss .nm'), bossFill: $('#boss .fill'), bossLag: $('#boss .lag'),
      combo: $('#combo'), comboN: $('#combo .n'),
      pImg: $('#player img'), pName: $('#player .name'), hpBar: $('#player .bar.hp'), hpFill: $('#player .bar.hp .fill'), hpLag: $('#player .bar.hp .lag'),
      musouBar: $('#player .bar.musou'), musouFill: $('#player .bar.musou .fill'), buff: $('#buff'),
      toast: $('#toast'), toastT: $('#toast .t'), toastS: $('#toast .s'),
      dlg: $('#dialogue'), dlgImg: $('#dialogue img'), dlgWho: $('#dialogue .who'), dlgLine: $('#dialogue .line'),
      map: $('#minimap'), lockhint: $('#lockhint'), fps: $('#fps'),
    };
    this.mapCtx = this.el.map.getContext('2d');
    this.comboT = 0; this.lastCombo = 0; this.toastT = 0;
    this.typing = null;
  }

  loading(p, msg) {
    this.el.loading.querySelector('i').style.width = `${Math.round(p * 100)}%`;
    if (msg) this.el.loading.querySelector('.msg').textContent = msg;
  }
  hideLoading() { this.el.loading.style.opacity = 0; setTimeout(() => this.el.loading.remove(), 1100); }

  showTitle(quality, onQuality, difficulty, onDifficulty) {
    const t = html(`<div id="title">
      <div class="quality">GRAPHICS ${['low', 'medium', 'high', 'ultra'].map((q) => `<button data-q="${q}" class="${q === quality ? 'on' : ''}">${q.toUpperCase()}</button>`).join('')}</div>
      <div class="cn">長坂坡</div>
      <h1>SANGO WARRIORS</h1>
      <div class="chapter">Chapter I &nbsp;<b>·</b>&nbsp; The Lone Rider of Changban</div>
      <div class="difficulty">${DIFFICULTY_ORDER.map((d) => `<button data-d="${d}">${DIFFICULTY[d].label}</button>`).join('')}<div class="desc"></div></div>
      <div class="press">PRESS ENTER OR CLICK TO BEGIN</div>
      <div class="controls">
        <span><b>WASD</b>Move</span><span><b>MOUSE</b>Camera</span><span><b>LMB / J</b>Attack</span><span><b>RMB / K</b>Charge attack</span>
        <span><b>SPACE</b>Jump</span><span><b>SHIFT</b>Dash</span><span><b>L / F</b>Musou</span><span><b>Q</b>Center camera</span>
      </div></div>`);
    t.querySelectorAll('.quality button').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); onQuality(b.dataset.q); }));
    t.querySelectorAll('.difficulty button').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); this.selectDifficulty(b.dataset.d); }));
    this.root.append(t);
    this.title = t;
    this.onDifficulty = onDifficulty;
    this.selectDifficulty(difficulty, true);
    return t;
  }
  selectDifficulty(d, silent = false) {
    if (!this.title || !DIFFICULTY[d]) return;
    this.title.querySelectorAll('.difficulty button').forEach((b) => b.classList.toggle('on', b.dataset.d === d));
    this.title.querySelector('.difficulty .desc').textContent = DIFFICULTY[d].desc;
    if (!silent) this.onDifficulty?.(d);
  }
  hideTitle() { this.title?.remove(); this.title = null; }

  async cards(list, input) {
    const wrap = html(`<div id="cards"><div class="card"></div><div class="skip">ENTER ▸ CONTINUE</div></div>`);
    this.root.append(wrap);
    const card = wrap.querySelector('.card');
    input.clearUI();
    for (const c of list) {
      card.replaceChildren(...rich(c));
      card.classList.add('on');
      await waitFor(input, 6500);
      card.classList.remove('on');
      await sleep(900);
    }
    wrap.style.transition = 'opacity 1s'; wrap.style.opacity = 0;
    await sleep(900);
    wrap.remove();
  }

  showHUD(v) { this.el.hud.classList.toggle('hidden', !v); }
  setPlayer(def) {
    this.el.pName.replaceChildren(...nameNodes(def.cn, def.name));
    if (this.portraits[def.id]) this.el.pImg.src = this.portraits[def.id];
  }
  objective(text) {
    const o = this.el.obj;
    o.parentElement.animate([{ opacity: 0.2, transform: 'translateX(-10px)' }, { opacity: 1, transform: 'none' }], { duration: 500 });
    o.textContent = text;
  }
  toast(title, sub = '', dur = 3) {
    this.el.toastT.textContent = title; this.el.toastS.textContent = sub;
    this.el.toast.classList.add('on'); this.toastT = dur;
  }
  boss(officer) {
    if (!officer) { this.el.boss.classList.add('hidden'); this.bossRef = null; return; }
    this.bossRef = officer;
    const d = officer.def;
    this.el.bossName.replaceChildren(...nameNodes(d.cn, d.name), el('small', null, d.title),
      ...(d.rtk ? [el('em', 'rtk', `統率 ${d.rtk.lea} · 武力 ${d.rtk.war} · 知力 ${d.rtk.int}`)] : []));
    const img = this.portraits[d.id];
    this.el.bossImg.style.display = img ? '' : 'none';
    if (img) this.el.bossImg.src = img;
    this.el.boss.classList.remove('hidden');
  }

  async say(lines, input) {
    const d = this.el;
    d.dlg.classList.add('on');
    input.clearUI();
    for (const [id, name, cn, text] of lines) {
      d.dlgImg.src = this.portraits[id] || '';
      d.dlgImg.style.display = this.portraits[id] ? '' : 'none';
      d.dlgWho.replaceChildren(...nameNodes(cn, name));
      d.dlgLine.textContent = '';
      let i = 0; let skip = false;
      const full = text;
      await new Promise((res) => {
        const iv = setInterval(() => {
          if (input.consumeUI()) skip = true;
          i = skip ? full.length : i + 1;
          d.dlgLine.textContent = full.slice(0, i);
          if (i >= full.length) { clearInterval(iv); res(); }
        }, 22);
      });
      await waitFor(input, Math.max(2200, full.length * 55));
    }
    d.dlg.classList.remove('on');
    await sleep(250);
  }

  update(dt, s) {
    const e = this.el;
    const hp = s.hero.hp / s.hero.maxHp;
    e.hpFill.style.transform = `scaleX(${hp})`; e.hpLag.style.transform = `scaleX(${hp})`;
    e.hpBar.classList.toggle('low', hp < 0.3);
    e.musouFill.style.transform = `scaleX(${s.hero.musou / 100})`;
    e.musouBar.classList.toggle('full', s.hero.musou >= 100);
    e.ko.textContent = s.ko;
    const t = Math.floor(s.time);
    e.timer.textContent = `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
    e.buff.textContent = s.hero.hasSword ? 'QINGGANG SWORD · ATTACK ↑' : '';
    if (s.combo !== this.lastCombo) {
      if (s.combo > this.lastCombo) { e.comboN.textContent = s.combo; e.comboN.classList.remove('pop'); void e.comboN.offsetWidth; e.comboN.classList.add('pop'); }
      this.lastCombo = s.combo;
    }
    e.combo.classList.toggle('on', s.combo > 1);
    if (this.bossRef) {
      const b = Math.max(0, this.bossRef.hp / this.bossRef.maxHp);
      e.bossFill.style.transform = `scaleX(${b})`; e.bossLag.style.transform = `scaleX(${b})`;
    }
    if (this.toastT > 0) { this.toastT -= dt; if (this.toastT <= 0) e.toast.classList.remove('on'); }
    this.drawMap(s);
  }

  drawMap(s) {
    const c = this.mapCtx, W = 380, R = W / 2, scale = 2.6;
    const hx = s.hero.pos.x, hz = s.hero.pos.z, rot = s.camYaw;
    c.clearRect(0, 0, W, W);
    c.save();
    c.beginPath(); c.arc(R, R, R - 2, 0, Math.PI * 2); c.clip();
    c.fillStyle = 'rgba(40,34,24,0.85)'; c.fillRect(0, 0, W, W);
    c.translate(R, R);
    c.rotate(rot);
    const P = (x, z) => [(x - hx) * scale, (z - hz) * scale];
    // corridor
    c.strokeStyle = 'rgba(120,110,80,0.35)'; c.lineWidth = 92 * scale; c.lineCap = 'round'; c.lineJoin = 'round';
    c.beginPath(); PATH.forEach(([x, z], i) => { const [a, b] = P(x, z); i ? c.lineTo(a, b) : c.moveTo(a, b); }); c.stroke();
    c.strokeStyle = 'rgba(190,160,110,0.8)'; c.lineWidth = 7 * scale;
    c.beginPath(); PATH.forEach(([x, z], i) => { const [a, b] = P(x, z); i ? c.lineTo(a, b) : c.moveTo(a, b); }); c.stroke();
    // river
    c.strokeStyle = 'rgba(60,120,150,0.85)'; c.lineWidth = 18 * scale;
    c.beginPath(); for (let x = -300; x <= 300; x += 10) { const [a, b] = P(x, 200 + Math.sin(x * 0.018) * 7); x === -300 ? c.moveTo(a, b) : c.lineTo(a, b); } c.stroke();
    // palisade gates: red while shut, a gap once open
    for (const g of s.gates ?? []) {
      const seg = (a0, a1) => { const [x0, y0] = P(g.x + g.lx * a0, g.z + g.lz * a0), [x1, y1] = P(g.x + g.lx * a1, g.z + g.lz * a1); c.moveTo(x0, y0); c.lineTo(x1, y1); };
      c.lineCap = 'butt'; c.lineWidth = 2.2 * scale; c.strokeStyle = g.open ? 'rgba(150,110,70,0.9)' : '#e0402c';
      c.beginPath();
      if (g.open) { seg(-60, -3.5); seg(3.5, 60); } else seg(-60, 60);
      c.stroke();
    }
    // enemies
    c.fillStyle = '#d23a2a';
    for (const g of s.grunts) { if (!g.active || !g.alive) continue; const [a, b] = P(g.x, g.z); if (a * a + b * b < R * R * 1.2) c.fillRect(a - 3, b - 3, 6, 6); }
    for (const o of s.officers) {
      if (!o.active || !o.alive) continue;
      const [a, b] = P(o.pos.x, o.pos.z);
      c.fillStyle = '#ff5a3a'; c.beginPath(); c.arc(a, b, 10, 0, Math.PI * 2); c.fill();
      c.strokeStyle = '#fff'; c.lineWidth = 2; c.stroke();
    }
    // allies
    for (const a0 of s.allies) { const [a, b] = P(a0.x, a0.z); c.fillStyle = '#5ad08a'; c.beginPath(); c.arc(a, b, 8, 0, Math.PI * 2); c.fill(); }
    // objective marker (clamped to rim)
    if (s.marker) {
      let [a, b] = P(s.marker.x, s.marker.z);
      const l = Math.hypot(a, b), max = R - 16;
      if (l > max) { a *= max / l; b *= max / l; }
      c.save(); c.translate(a, b); c.rotate(-rot);
      c.fillStyle = '#ffd25a'; c.strokeStyle = '#3a2a08'; c.lineWidth = 3;
      star(c, 0, 0, 13, 6); c.fill(); c.stroke(); c.restore();
    }
    c.restore();
    // hero arrow (map rotates with camera, so hero points relative)
    c.save(); c.translate(R, R); c.rotate(Math.PI - (s.hero.yaw - rot));
    c.fillStyle = '#7fe0ff'; c.strokeStyle = '#0a2030'; c.lineWidth = 3;
    c.beginPath(); c.moveTo(0, -14); c.lineTo(9, 10); c.lineTo(0, 5); c.lineTo(-9, 10); c.closePath(); c.fill(); c.stroke();
    c.restore();
    c.strokeStyle = 'rgba(217,180,90,0.9)'; c.lineWidth = 4; c.beginPath(); c.arc(R, R, R - 3, 0, Math.PI * 2); c.stroke();
    c.fillStyle = '#d9b45a'; c.font = 'bold 22px Cinzel, serif'; c.textAlign = 'center';
    c.save(); c.translate(R, R); c.rotate(rot); c.fillText('N', 0, -R + 26); c.restore();
  }

  results(win, stats, onRetry, difficulty = '') {
    const rank = win ? (stats.ko >= 600 && stats.time < 900 ? 'S' : stats.ko >= 350 ? 'A' : stats.ko >= 150 ? 'B' : 'C') : '';
    const fmt = (t) => `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
    const el = html(`<div id="results" class="${win ? 'win' : 'lose'}">
      <div class="cn">${win ? '勝利' : '敗北'}</div>
      <h2>${win ? 'VICTORY' : 'DEFEAT'}</h2>
      <div>${win ? 'Zhao Yun carried the young lord through a hundred thousand men.' : 'Zhao Yun has fallen at Changban.'}</div>
      <table><tr><td>K.O. count</td><td>${stats.ko}</td></tr><tr><td>Officers defeated</td><td>${stats.officers}</td></tr>
      <tr><td>Max combo</td><td>${stats.maxCombo}</td></tr><tr><td>Time</td><td>${fmt(stats.time)}</td></tr>
      ${difficulty ? '<tr><td>Difficulty</td><td class="diff"></td></tr>' : ''}</table>
      ${win ? `<div class="rank">RANK ${rank}</div>` : ''}
      <button class="btn">${win ? 'PLAY AGAIN' : 'RETRY FROM CHECKPOINT'}</button></div>`);
    if (difficulty) $('.diff', el).textContent = difficulty;
    el.querySelector('button').addEventListener('click', () => { el.remove(); onRetry(); });
    this.root.append(el);
    return el;
  }

  pause(show, onResume) {
    if (!show) { $('#pause')?.remove(); return; }
    const el = html(`<div id="pause"><h2>PAUSED</h2><div class="keys">
      <b>WASD</b><span>Move</span><b>MOUSE</b><span>Camera (click to lock)</span><b>LMB / J</b><span>Normal attack (up to 6)</span>
      <b>RMB / K</b><span>Charge attack — after N normals gives C(N+1)</span><b>SPACE</b><span>Jump (attack in air: plunge)</span>
      <b>SHIFT</b><span>Dash / evade</span><b>L / F</b><span>Musou when the gauge is full</span><b>Q</b><span>Center camera</span>
      <b>ESC / P</b><span>Pause</span></div><button class="btn">RESUME</button></div>`);
    el.querySelector('button').addEventListener('click', onResume);
    this.root.append(el);
  }
}

function star(c, x, y, r, n) {
  c.beginPath();
  for (let i = 0; i < n * 2; i++) { const a = (i / (n * 2)) * Math.PI * 2 - Math.PI / 2; const rr = i % 2 ? r * 0.45 : r; c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
  c.closePath();
}
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export function waitFor(input, maxMs) {
  return new Promise((res) => {
    const t0 = performance.now();
    const iv = setInterval(() => {
      if (input.consumeUI() || performance.now() - t0 > maxMs) { clearInterval(iv); res(); }
    }, 30);
  });
}
