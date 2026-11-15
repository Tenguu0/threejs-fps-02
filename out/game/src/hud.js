// The DOM HUD: crosshair, hit marker, health, ammo, money, timer, score, killfeed,
// buy menu and the overlay panels. It never touches the simulation; main.js pushes
// numbers in and reads the callbacks out. All reads are cached so the DOM is only
// touched when a value actually changes.
import { WEAPONS, GRENADE, ARMOR, BUY_ORDER } from './weapon.js';

const COPY = {
  start: {
    title: 'Emberline',
    copy: 'Five attackers, five defenders, one spike. Plant it at A or B — or clear the yard the loud way.',
    action: 'Click to play',
  },
  paused: {
    title: 'Emberline',
    copy: 'Paused. The yard waits.',
    action: 'Click to resume',
  },
  dead: {
    title: 'You are down',
    copy: 'Your squad fights on. Watch the round, or wait for the next buy phase.',
    action: 'Spectate',
  },
  match: {
    title: 'Match over',
    copy: '',
    action: 'Play again',
  },
};

export function createHud() {
  const $ = (id) => document.getElementById(id);
  const overlay = $('overlay');
  const title = $('overlay-title');
  const copy = $('overlay-copy');
  const play = $('play');
  const ammo = $('ammo');
  const ammoMag = $('ammo-mag');
  const ammoReserve = $('ammo-reserve');
  const weaponName = $('weapon-name');
  const healthFill = $('health-fill');
  const healthValue = $('health-value');
  const armorValue = $('armor-value');
  const moneyValue = $('money-value');
  const timerValue = $('timer-value');
  const roundLabel = $('round-label');
  const scoreV = $('score-v');
  const scoreE = $('score-e');
  const aliveV = $('alive-v');
  const aliveE = $('alive-e');
  const killfeed = $('killfeed');
  const banner = $('banner');
  const bannerTitle = $('banner-title');
  const bannerSub = $('banner-sub');
  const spikeStatus = $('spike-status');
  const crosshair = $('crosshair');
  const hitmarker = $('hitmarker');
  const damageFlash = $('damage-flash');
  const plantBar = $('plant-bar');
  const plantFill = $('plant-fill');
  const plantLabel = $('plant-label');
  const hint = $('hint');
  const buyMenu = $('buy-menu');
  const buyList = $('buy-list');
  const buyMoney = $('buy-money');

  let lastMag = -1;
  let lastReserve = -1;
  let lastHp = -1;
  let lastArmor = -1;
  let lastMoney = -1;
  let lastTimer = '';
  let lastScore = '';
  let lastAlive = '';
  let lastWeapon = '';
  let lastSpread = -1;
  let hitTimer = 0;
  let bannerTimer = 0;
  let buyHandler = null;

  // Build the buy menu once from the weapon table, so menu and game never disagree.
  for (const id of BUY_ORDER) {
    const item = id === 'grenade' ? GRENADE : id === 'armor' ? ARMOR : WEAPONS[id];
    const row = document.createElement('div');
    row.className = 'buy-row';
    row.innerHTML = `<button type="button" class="buy-item" data-buy="${id}">
      <span class="buy-name">${item.name}</span>
      <span class="buy-desc">${item.desc}</span>
      <span class="buy-price">$${item.price}</span>
    </button>`;
    buyList.appendChild(row);
  }
  buyList.addEventListener('click', (event) => {
    const button = event.target.closest('[data-buy]');
    if (button && buyHandler) buyHandler(button.dataset.buy);
  });

  return {
    setAmmo(mag, reserve) {
      if (mag === lastMag && reserve === lastReserve) return;
      lastMag = mag;
      lastReserve = reserve;
      ammoMag.textContent = String(mag);
      ammoReserve.textContent = `/ ${reserve}`;
      ammo.classList.toggle('empty', mag === 0);
    },
    setWeapon(name) {
      if (name === lastWeapon) return;
      lastWeapon = name;
      weaponName.textContent = name;
    },
    setHealth(hp, armor) {
      if (hp === lastHp && armor === lastArmor) return;
      lastHp = hp;
      lastArmor = armor;
      healthFill.style.width = `${Math.max(0, hp)}%`;
      healthFill.classList.toggle('low', hp <= 30);
      healthValue.textContent = String(Math.max(0, Math.ceil(hp)));
      armorValue.textContent = armor > 0 ? `Kevlar ${Math.ceil(armor)}` : '';
    },
    setMoney(value) {
      if (value === lastMoney) return;
      lastMoney = value;
      moneyValue.textContent = `$${value}`;
      buyMoney.textContent = `$${value}`;
    },
    setTimer(text, label) {
      if (text === lastTimer && label === roundLabel.textContent) return;
      lastTimer = text;
      timerValue.textContent = text;
      roundLabel.textContent = label;
    },
    setScore(v, e) {
      const key = `${v}-${e}`;
      if (key === lastScore) return;
      lastScore = key;
      scoreV.textContent = String(v);
      scoreE.textContent = String(e);
    },
    setAlive(v, e) {
      const key = `${v}-${e}`;
      if (key === lastAlive) return;
      lastAlive = key;
      aliveV.textContent = '●'.repeat(v) + '○'.repeat(Math.max(0, 5 - v));
      aliveE.textContent = '●'.repeat(e) + '○'.repeat(Math.max(0, 5 - e));
    },
    setSpread(spread) {
      const px = Math.round(4 + spread * 900);
      if (px === lastSpread) return;
      lastSpread = px;
      crosshair.style.setProperty('--gap', `${px}px`);
    },
    hitMarker(killed, holdMs = 90) {
      hitmarker.classList.add('on');
      hitmarker.classList.toggle('kill', killed);
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => hitmarker.classList.remove('on', 'kill'), holdMs);
    },
    damageFlash() {
      damageFlash.classList.add('on');
      setTimeout(() => damageFlash.classList.remove('on'), 180);
    },
    killfeed(killer, victim, head) {
      const line = document.createElement('div');
      line.className = 'feed-line';
      line.innerHTML = `<b>${killer}</b> ${head ? '◉' : '✕'} <b>${victim}</b>`;
      killfeed.prepend(line);
      while (killfeed.children.length > 5) killfeed.removeChild(killfeed.lastChild);
      setTimeout(() => line.remove(), 6000);
    },
    banner(titleText, subText, ms = 3200) {
      bannerTitle.textContent = titleText;
      bannerSub.textContent = subText;
      banner.hidden = false;
      clearTimeout(bannerTimer);
      bannerTimer = setTimeout(() => { banner.hidden = true; }, ms);
    },
    hideBanner() {
      banner.hidden = true;
    },
    setSpike(text, urgent) {
      spikeStatus.textContent = text;
      spikeStatus.classList.toggle('urgent', !!urgent);
      spikeStatus.hidden = !text;
    },
    setPlant(progress, label) {
      if (progress == null) {
        plantBar.hidden = true;
        return;
      }
      plantBar.hidden = false;
      plantFill.style.width = `${Math.round(progress * 100)}%`;
      plantLabel.textContent = label;
    },
    setHint(text) {
      hint.textContent = text || '';
      hint.hidden = !text;
    },
    showBuy(open) {
      buyMenu.hidden = !open;
      if (open) buyMoney.textContent = `$${lastMoney}`;
    },
    onBuy(handler) {
      buyHandler = handler;
    },
    showOverlay(mode, detail) {
      const text = COPY[mode];
      title.textContent = text.title;
      copy.textContent = mode === 'match' ? detail || '' : text.copy;
      play.textContent = text.action;
      overlay.hidden = false;
      play.focus();
    },
    hideOverlay() {
      overlay.hidden = true;
    },
    onPlay(handler) {
      play.addEventListener('click', handler);
    },
  };
}
