// Weapons: the buy-menu catalogue and the view model. Each entry owns its numbers;
// main.js owns the ray and the damage, game.js owns the money. A weapon is a plain
// data row, so the buy menu, the HUD and the firing code all read the same table.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const WEAPONS = {
  pistol: {
    id: 'pistol', name: 'P9 Sidearm', short: 'P9', price: 0, slot: 2,
    mag: 12, reserve: 96, gap: 0.16, reload: 1.15, damage: 26, headMul: 4,
    spreadStill: 0.0035, spreadMove: 0.026, auto: false, kick: 0.007, range: 55,
    desc: 'Free sidearm. Light, honest, always in your pocket.',
  },
  smg: {
    id: 'smg', name: 'Raptor-9 SMG', short: 'R9', price: 1500, slot: 1,
    mag: 32, reserve: 96, gap: 0.075, reload: 1.7, damage: 19, headMul: 3,
    spreadStill: 0.006, spreadMove: 0.034, auto: true, kick: 0.005, range: 38,
    desc: 'Fast hose for close lanes. Melts at range, sings up close.',
  },
  rifle: {
    id: 'rifle', name: 'VK-47 Rifle', short: 'VK', price: 2500, slot: 1,
    mag: 30, reserve: 90, gap: 0.096, reload: 1.9, damage: 33, headMul: 4,
    spreadStill: 0.0022, spreadMove: 0.028, auto: true, kick: 0.009, range: 70,
    desc: 'The workhorse. One tap to the head ends the argument.',
  },
  dmr: {
    id: 'dmr', name: 'Longbow DMR', short: 'LB', price: 4000, slot: 1,
    mag: 10, reserve: 30, gap: 0.85, reload: 2.6, damage: 82, headMul: 2,
    spreadStill: 0.0006, spreadMove: 0.05, auto: false, kick: 0.03, range: 90,
    desc: 'Long sightlines only. Right-click to scope, miss and you are exposed.',
  },
};
export const GRENADE = { id: 'grenade', name: 'Spark Frag', price: 300, desc: 'Bounces once, then argues loudly. G to throw.' };
export const ARMOR = { id: 'armor', name: 'Kevlar Vest', price: 650, desc: 'Halves bullet damage until it breaks.' };

export const BUY_ORDER = ['rifle', 'smg', 'dmr', 'pistol', 'grenade', 'armor'];

const GRIP = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.7, metalness: 0.2 });
const BODY = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.5, metalness: 0.35 });
const DARK = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.surface), roughness: 0.6, metalness: 0.3 });

function boxMesh(material, w, h, d, x, y, z) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  return mesh;
}

// One view model per weapon, built once and swapped; nothing is allocated per shot.
function buildModel(id) {
  const model = new THREE.Group();
  if (id === 'pistol') {
    model.add(boxMesh(BODY, 0.07, 0.09, 0.24, 0, 0, -0.1));
    model.add(boxMesh(GRIP, 0.06, 0.14, 0.08, 0, -0.09, 0.03));
    model.add(boxMesh(DARK, 0.02, 0.03, 0.05, 0, 0.05, -0.2));
  } else if (id === 'smg') {
    model.add(boxMesh(BODY, 0.08, 0.09, 0.34, 0, 0, -0.12));
    model.add(boxMesh(GRIP, 0.05, 0.12, 0.07, 0, -0.08, 0.0));
    model.add(boxMesh(DARK, 0.05, 0.05, 0.22, 0, 0.01, -0.32));
    model.add(boxMesh(GRIP, 0.04, 0.1, 0.05, 0, -0.07, -0.22));
  } else if (id === 'dmr') {
    model.add(boxMesh(BODY, 0.08, 0.1, 0.62, 0, 0, -0.2));
    model.add(boxMesh(DARK, 0.05, 0.06, 0.5, 0, 0.02, -0.45));
    model.add(boxMesh(GRIP, 0.06, 0.13, 0.08, 0, -0.09, 0.08));
    model.add(boxMesh(DARK, 0.06, 0.05, 0.16, 0, 0.075, -0.18));
  } else {
    model.add(boxMesh(BODY, 0.09, 0.1, 0.42, 0, 0, -0.1));
    model.add(boxMesh(GRIP, 0.045, 0.045, 0.4, 0, 0.025, -0.42));
    model.add(boxMesh(GRIP, 0.075, 0.08, 0.22, 0, -0.02, 0.22));
    model.add(boxMesh(DARK, 0.05, 0.05, 0.1, 0, 0.06, -0.28));
  }
  model.position.set(0.24, -0.2, -0.42);
  return model;
}

export function createWeapon(camera) {
  const models = {};
  for (const id of Object.keys(WEAPONS)) models[id] = buildModel(id);
  let current = models.rifle;
  camera.add(current);

  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.24, 0.24),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0.24, -0.18, -0.95);
  flash.visible = false;
  camera.add(flash);
  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 5);
  flashLight.position.set(0.24, -0.16, -0.6);
  camera.add(flashLight);

  const state = {
    id: 'rifle', mag: WEAPONS.rifle.mag, reserve: WEAPONS.rifle.reserve,
    cooldown: 0, reloadLeft: 0, flash: 0, kick: 0, scoped: false,
  };

  function step(dt) {
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.flash = Math.max(0, state.flash - dt);
    state.kick += (0 - state.kick) * Math.min(1, dt * 14);
    current.position.z = -0.42 + state.kick;
    current.position.y = -0.2 + state.kick * 0.4;
    current.rotation.x = state.kick * 2.2;
    current.visible = !state.scoped;
    flash.visible = state.flash > 0 && !state.scoped;
    flash.rotation.z = state.flash * 30;
    flashLight.intensity = state.flash > 0 ? 18 : 0;
    if (state.reloadLeft > 0) {
      state.reloadLeft = Math.max(0, state.reloadLeft - dt);
      const def = WEAPONS[state.id];
      current.rotation.x = -0.55 * Math.min(1, (def.reload - state.reloadLeft) * 2);
      if (state.reloadLeft === 0) {
        const need = def.mag - state.mag;
        const take = Math.min(need, state.reserve);
        state.mag += take;
        state.reserve -= take;
      }
    }
  }

  return {
    state,
    step,
    def() {
      return WEAPONS[state.id];
    },
    ready() {
      return state.mag > 0 && state.cooldown === 0 && state.reloadLeft === 0;
    },
    pullTrigger() {
      const def = WEAPONS[state.id];
      state.cooldown = def.gap;
      state.flash = 0.06;
      state.kick = 0.055;
    },
    takeRound() {
      if (state.mag <= 0) return false;
      state.mag -= 1;
      return true;
    },
    reload() {
      const def = WEAPONS[state.id];
      if (state.reloadLeft > 0 || state.mag === def.mag || state.reserve === 0) return;
      state.reloadLeft = def.reload;
    },
    spread(speed) {
      const def = WEAPONS[state.id];
      const still = state.scoped ? def.spreadStill * 0.4 : def.spreadStill;
      return still + Math.min(1, speed / 5.2) * def.spreadMove;
    },
    equip(id, keepAmmo) {
      const def = WEAPONS[id];
      if (!def) return;
      camera.remove(current);
      current = models[id];
      camera.add(current);
      state.id = id;
      state.cooldown = 0;
      state.reloadLeft = 0;
      state.scoped = false;
      if (!keepAmmo) {
        state.mag = def.mag;
        state.reserve = def.reserve;
      }
    },
    refill() {
      const def = WEAPONS[state.id];
      state.mag = def.mag;
      state.reserve = def.reserve;
      state.cooldown = 0;
      state.reloadLeft = 0;
      state.flash = 0;
      state.kick = 0;
      state.scoped = false;
    },
    setScoped(on) {
      state.scoped = on && state.id === 'dmr';
    },
  };
}
