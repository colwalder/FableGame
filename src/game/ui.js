import { CLUES, CLUE_ORDER, CLUE_TOTAL, ENDINGS } from '../world/story.js';

const $ = (id) => document.getElementById(id);

export class UI {
  constructor(game) {
    this.g = game;
    this.el = {};
    for (const id of ['hud', 'hpFill', 'hpLag', 'stFill', 'buff', 'buffFill', 'flasks', 'silver', 'clueN', 'prompt', 'toast', 'say', 'area', 'areaTitle', 'areaSub', 'boss', 'bossName', 'bossFill', 'bossLag', 'lockDot', 'banner', 'bannerTitle', 'bannerSub',
      'reader', 'readTitle', 'readBody', 'readNote', 'journal', 'jList', 'jTitle', 'jBody', 'jNote', 'shrine', 'shrineSilver', 'death', 'fade', 'ending', 'endKind', 'endTitle', 'endBody', 'endStats', 'title']) this.el[id] = $(id);
    this.toastT = 0; this.sayT = 0; this.areaT = 0; this.bannerT = 0; this.jSel = 0; this.promptText = null; this.shownSilver = 0;
    this.hpBar = this.el.hpFill.parentElement; this.stBar = this.el.stFill.parentElement;
    document.querySelectorAll('.srow').forEach((r) => r.addEventListener('click', () => game.buyLevel(r.dataset.k)));
  }
  showHud(on) { this.el.hud.classList.toggle('hidden', !on); }

  frame(dt) {
    const p = this.g.player, e = this.el;
    this.hpBar.style.width = Math.min(560, 300 * p.maxHp / 100) + 'px'; this.stBar.style.width = Math.min(460, 240 * p.maxSt / 100) + 'px';
    const hf = Math.max(0, p.hp / p.maxHp);
    e.hpFill.style.transform = e.hpLag.style.transform = `scaleX(${hf})`;
    e.stFill.style.transform = `scaleX(${Math.max(0, p.st / p.maxSt)})`;
    e.stFill.style.opacity = p.winded ? 0.45 : 1;
    e.buff.classList.toggle('hidden', p.buff <= 0); if (p.buff > 0) e.buffFill.style.transform = `scaleX(${p.buff / 45})`;
    e.flasks.textContent = p.flasks; e.flasks.parentElement.classList.toggle('dim', p.flasks <= 0);
    if (this.shownSilver !== p.silver) { const d = p.silver - this.shownSilver; this.shownSilver += Math.abs(d) < 3 ? d : Math.sign(d) * Math.ceil(Math.abs(d) * Math.min(1, dt * 6)); e.silver.textContent = this.shownSilver; }
    if (this.toastT > 0 && (this.toastT -= dt) <= 0) e.toast.classList.remove('on');
    if (this.sayT > 0 && (this.sayT -= dt) <= 0) e.say.classList.remove('on');
    if (this.areaT > 0 && (this.areaT -= dt) <= 0) e.area.classList.remove('on');
    if (this.bannerT > 0 && (this.bannerT -= dt) <= 0) e.banner.classList.remove('on');
  }
  toast(text, dur = 3.2) { this.el.toast.textContent = text; this.el.toast.classList.add('on'); this.toastT = dur; }
  say(text, dur = 4, demon = false) { const s = this.el.say; s.textContent = text; s.classList.toggle('demon', demon); s.classList.add('on'); this.sayT = dur; }
  area(title, sub) { this.el.areaTitle.textContent = title; this.el.areaSub.textContent = sub || ''; this.el.area.classList.add('on'); this.areaT = 4.5; }
  banner(title, sub, dur = 5) { this.el.bannerTitle.textContent = title; this.el.bannerSub.textContent = sub || ''; this.el.banner.classList.add('on'); this.bannerT = dur; }
  prompt(text) { if (text === this.promptText) return; this.promptText = text; this.el.prompt.classList.toggle('hidden', !text); if (text) this.el.prompt.innerHTML = `<span class="key">E</span> &nbsp;${text}`; }
  boss(name, frac) {
    const e = this.el; e.boss.classList.toggle('hidden', !name);
    if (name) { if (e.bossName.textContent !== name) e.bossName.textContent = name; e.bossFill.style.transform = e.bossLag.style.transform = `scaleX(${Math.max(0, frac)})`; }
  }
  lockDot(x, y) { const d = this.el.lockDot; d.classList.toggle('hidden', x === null); if (x !== null) { d.style.left = x + 'px'; d.style.top = y + 'px'; } }
  clues(n) { this.el.clueN.textContent = n; }

  openReader(id) { const c = CLUES[id], e = this.el; e.readTitle.textContent = c.title; e.readBody.textContent = c.body; e.readNote.textContent = c.note || ''; e.reader.classList.remove('hidden'); e.reader.querySelector('.parchment').scrollTop = 0; }
  closeReader() { this.el.reader.classList.add('hidden'); }

  openJournal(found) {
    this.found = found; const e = this.el; e.jList.innerHTML = '';
    CLUE_ORDER.forEach((id, i) => {
      const d = document.createElement('div'), has = found.has(id);
      d.className = 'jitem' + (has ? '' : ' missing'); d.textContent = has ? CLUES[id].title : '— not yet found —';
      d.addEventListener('click', () => this.selectJournal(i)); e.jList.appendChild(d);
    });
    e.journal.classList.remove('hidden'); this.selectJournal(Math.min(this.jSel, CLUE_ORDER.length - 1));
  }
  selectJournal(i) {
    const n = CLUE_ORDER.length; this.jSel = (i + n) % n; const id = CLUE_ORDER[this.jSel], has = this.found.has(id), e = this.el;
    [...e.jList.children].forEach((c, k) => c.classList.toggle('sel', k === this.jSel));
    e.jTitle.textContent = has ? CLUES[id].title : 'Not yet found'; e.jBody.textContent = has ? CLUES[id].body : 'Something in Chernobrod still waits to be read.'; e.jNote.textContent = has ? CLUES[id].note || '' : '';
    e.jList.children[this.jSel].scrollIntoView({ block: 'nearest' });
  }
  closeJournal() { this.el.journal.classList.add('hidden'); }

  openShrine() { this.el.shrine.classList.remove('hidden'); this.refreshShrine(); }
  refreshShrine() {
    const g = this.g, p = g.player, cost = g.levelCost();
    for (const k of ['vigor', 'endurance', 'strength']) {
      const K = k[0].toUpperCase() + k.slice(1);
      $('lv' + K).textContent = p.lv[k]; $('cost' + K).textContent = cost;
      document.querySelector(`.srow[data-k="${k}"]`).classList.toggle('cant', p.silver < cost);
    }
    this.el.shrineSilver.textContent = p.silver;
  }
  closeShrine() { this.el.shrine.classList.add('hidden'); }

  death(on) { this.el.death.classList.toggle('hidden', !on); }
  fade(on) { this.el.fade.classList.toggle('on', on); }
  hideTitle() { this.el.title.classList.add('hidden'); }
  ending(kind, found, deaths, secs) {
    const E = ENDINGS[kind], e = this.el;
    e.endKind.textContent = E.kind; e.endTitle.textContent = E.title; e.endTitle.className = 'endtitle ' + kind; e.endBody.textContent = E.body;
    const n = [...found].filter((x) => x !== 'contract').length, m = Math.floor(secs / 60);
    e.endStats.textContent = `Clues found ${n} / ${CLUE_TOTAL}   ·   Deaths ${deaths}   ·   ${m} min` + (kind === 'bad' && n < CLUE_TOTAL ? '   ·   The village knew another way.' : '');
    e.ending.classList.remove('hidden');
  }
}
