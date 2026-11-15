// Boot and the one loop: a fixed 60 Hz simulation feeding a render at the display's
// rate. The simulation (player, bots, grenades, spike, timer) is one step() function;
// rendering only draws what step() decided. Nothing in step() allocates per frame
// except the pooled effects it reuses.
// ?shot=start|play|buy|end with &seed=N stages a deterministic frame for a capture,
// renders it twice, then freezes it and sets window.__shotReady.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createWorld, SITE_A, SITE_B, SPAWN_VANGUARD, SPAWN_EMBER } from './world.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { createWeapon, WEAPONS, GRENADE, ARMOR } from './weapon.js';
import { createBots } from './bots.js';
import { createFx } from './fx.js';
import { createAudio } from './audio.js';
import { createHud } from './hud.js';
import { createGame, BUY_TIME, PLANT_TIME } from './game.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;

function mulberry32(initial) {
  let a = initial;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = shot ? mulberry32(seed) : Math.random;

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.canvas);
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.canvas), 26, 70);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 160);
scene.add(camera);

const audio = createAudio();
const fx = createFx(scene);
const world = createWorld(scene);
const hud = createHud();
const weapon = createWeapon(camera);
const player = createPlayer(world.colliders, SPAWN_VANGUARD);
const input = createInput(renderer.domElement, onLockChange);

const game = createGame({
  audio,
  onRoundStart(round) {
    bots.resetRound(SPAWN_VANGUARD, SPAWN_EMBER);
    player.respawn();
    // Fresh magazines for the weapons the player owns; the loadout itself carries over.
    for (const id of Object.keys(ammoStore)) {
      if (ammoStore[id]) ammoStore[id] = { mag: WEAPONS[id].mag, reserve: WEAPONS[id].reserve };
    }
    loadAmmo(weapon.state.id);
    grenadesHeld = ownedGrenade ? 1 : 0;
    plantProgress = 0;
    hud.hideBanner();
    hud.setSpike('SPIKE — plant at A or B', false);
    hud.showOverlay('start', 0);
    if (shot) hud.hideOverlay();
    syncHud();
  },
  onLive() {
    hud.setSpike(game.state.spike.state === 'carried' ? 'SPIKE — plant at A or B' : '', false);
  },
  onRoundEnd(winner, reason, score) {
    hud.banner(
      winner === 'vanguard' ? 'ROUND WON' : 'ROUND LOST',
      `${reason} — Vanguard ${score.vanguard} : ${score.ember} Ember`,
      3400,
    );
    hud.setSpike('', false);
    hud.setPlant(null);
  },
  onMatchEnd(winner, score) {
    hud.showOverlay('match', winner === 'vanguard'
      ? `Vanguard takes the match ${score.vanguard}–${score.ember}. The yard is yours.`
      : `Ember takes the match ${score.ember}–${score.vanguard}. Run it back.`);
    if (document.pointerLockElement) document.exitPointerLock();
  },
  onPlanted(site) {
    hud.setSpike(`SPIKE PLANTED AT ${site} — defend it`, true);
  },
  onDetonate(site) {
    fx.explosion(new THREE.Vector3(site === 'B' ? SITE_B.x : SITE_A.x, 0.6, site === 'B' ? SITE_B.z : SITE_A.z));
    audio.explosion();
  },
  onSpikeDropRequest() {
    game.dropSpike(player.state.body.position.x, player.state.body.position.z);
    hud.setSpike('SPIKE DROPPED — a teammate can pick it up', true);
  },
});

const bots = createBots(scene, world, {
  random: rng,
  fx,
  audio,
  damagePlayer(amount, fromName, head) {
    const dealt = game.damagePlayer(amount);
    if (dealt <= 0) return;
    hud.damageFlash();
    audio.hurt();
    if (!game.state.player.alive) {
      hud.showOverlay('dead');
      if (document.pointerLockElement) document.exitPointerLock();
    }
    syncHud();
  },
  damageBot(bot, amount, part, attacker) {
    const killed = bots.damage(bot, amount, part, attacker);
    if (killed) {
      hud.killfeed(attacker.name, bot.name, part === 'head');
      game.awardKill(false);
      if (attacker.team === 'vanguard') audio.kill();
    }
  },
  spikePlanted(bot) {
    game.plantSpike(bot.spikeSite);
  },
  spikeDefused() {
    game.defuseSpike();
  },
  onSpikeDrop(x, z) {
    game.dropSpike(x, z);
    hud.setSpike('SPIKE DROPPED — a teammate can pick it up', true);
  },
  onSpikePickup(name) {
    hud.setSpike(`${name} has the spike`, false);
  },
});

bots.spawnAll();

const raycaster = new THREE.Raycaster();
raycaster.far = 90;
const direction = new THREE.Vector3();
const muzzle = new THREE.Vector3();
const rayEnd = new THREE.Vector3();
const grenadeNext = new THREE.Vector3();
const shootables = world.shootables.concat(bots.hitMeshes);

let grenadesHeld = 0;
let ownedGrenade = false;
let primaryId = 'rifle';
let plantProgress = 0;
let buyOpen = false;
let frozen = false;
let started = false;
let elapsed = 0;
let accumulator = 0;
let lastTime = performance.now();
let roundEndAt = 0;
let fovTarget = 74;

// Ammo is kept per weapon, so switching between the rifle and the sidearm never
// refills a magazine for free.
const ammoStore = { rifle: null, pistol: null, smg: null, dmr: null };
function saveAmmo() {
  ammoStore[weapon.state.id] = { mag: weapon.state.mag, reserve: weapon.state.reserve };
}
function loadAmmo(id) {
  const stored = ammoStore[id];
  weapon.equip(id, true);
  if (stored) {
    weapon.state.mag = stored.mag;
    weapon.state.reserve = stored.reserve;
  } else {
    weapon.state.mag = WEAPONS[id].mag;
    weapon.state.reserve = WEAPONS[id].reserve;
  }
  ammoStore[id] = { mag: weapon.state.mag, reserve: weapon.state.reserve };
}

const grenadeMesh = new THREE.Mesh(
  new THREE.SphereGeometry(0.09, 10, 8),
  new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.5, metalness: 0.4 }),
);
grenadeMesh.visible = false;
scene.add(grenadeMesh);
const grenade = { active: false, pos: new THREE.Vector3(), vel: new THREE.Vector3(), fuse: 0 };

const body = player.state;

function syncHud() {
  const s = game.state;
  hud.setAmmo(weapon.state.mag, weapon.state.reserve);
  hud.setWeapon(weapon.def().name);
  hud.setHealth(s.player.hp, s.player.armor);
  hud.setMoney(s.money);
  const label = s.phase === 'buy' ? `BUY — ROUND ${s.round}` : s.phase === 'roundEnd' ? `ROUND ${s.round}` : s.phase === 'matchEnd' ? 'MATCH' : `ROUND ${s.round}`;
  const timerText = s.phase === 'matchEnd' ? '—' : `0:${String(Math.max(0, Math.ceil(s.timer))).padStart(2, '0')}`;
  hud.setTimer(timerText, label);
  hud.setScore(s.score.vanguard, s.score.ember);
  const vanguardAlive = (s.player.alive ? 1 : 0) + bots.aliveCount('vanguard');
  hud.setAlive(vanguardAlive, bots.aliveCount('ember'));
  if (s.spike.state === 'planted') {
    hud.setSpike(`SPIKE PLANTED AT ${s.spike.site} — ${Math.ceil(s.spike.fuse)}s`, true);
  }
  hud.setSpread(weapon.spread(player.groundSpeed()));
}

function aimAt(point) {
  const dx = point.x - body.body.position.x;
  const dy = point.y - (body.body.position.y + body.eye);
  const dz = point.z - body.body.position.z;
  const length = Math.hypot(dx, dy, dz) || 1;
  body.yaw = Math.atan2(-dx, -dz);
  body.pitch = Math.asin(Math.max(-1, Math.min(1, dy / length)));
  syncCamera();
}

function syncCamera() {
  camera.position.set(body.body.position.x, body.body.position.y + body.eye, body.body.position.z);
  camera.rotation.set(body.pitch, body.yaw, 0, 'YXZ');
}

function shoot(spread) {
  if (!weapon.takeRound()) {
    audio.dry();
    return false;
  }
  camera.getWorldDirection(direction);
  direction.x += (rng() * 2 - 1) * spread;
  direction.y += (rng() * 2 - 1) * spread;
  direction.z += (rng() * 2 - 1) * spread;
  direction.normalize();
  muzzle.copy(camera.position).addScaledVector(direction, 0.7);
  scene.updateMatrixWorld(true);
  raycaster.set(camera.position, direction);
  const hit = raycaster.intersectObjects(shootables, false)[0];
  rayEnd.copy(camera.position).addScaledVector(direction, hit ? hit.distance : 60);
  fx.tracer(muzzle, rayEnd);
  audio.shot(weapon.state.id);
  bots.hearShot(body.body.position.x, body.body.position.z);
  if (hit) {
    if (hit.object.userData.bot) {
      const bot = hit.object.userData.bot;
      const def = weapon.def();
      const falloff = hit.distance > 25 ? 0.8 : 1;
      const damage = Math.round(def.damage * (hit.object.userData.part === 'head' ? def.headMul : 1) * falloff);
      const killed = bots.damage(bot, damage, hit.object.userData.part, { name: 'You', team: 'vanguard' });
      hud.hitMarker(killed, killed ? 400 : 120);
      if (killed) {
        hud.killfeed('You', bot.name, hit.object.userData.part === 'head');
        game.awardKill(true);
        audio.kill();
      } else {
        audio.hit();
      }
    } else {
      fx.impact(hit.point, hit.face ? hit.face.normal : new THREE.Vector3(0, 1, 0));
    }
  }
  weapon.pullTrigger();
  player.recoil(0.009 + rng() * 0.004, (rng() * 2 - 1) * 0.004);
  syncHud();
  return true;
}

function throwGrenade() {
  if (grenadesHeld <= 0 || grenade.active) return;
  grenadesHeld -= 1;
  ownedGrenade = false;
  grenade.active = true;
  grenade.fuse = 1.6;
  camera.getWorldDirection(direction);
  grenade.pos.copy(camera.position).addScaledVector(direction, 0.6);
  grenade.vel.copy(direction).multiplyScalar(16);
  grenade.vel.y += 3.5;
  grenadeMesh.visible = true;
  audio.reload();
}

function explodeGrenade() {
  grenade.active = false;
  grenadeMesh.visible = false;
  fx.explosion(grenade.pos);
  audio.explosion();
  const radius = 7;
  for (const bot of bots.bots) {
    if (!bot.alive) continue;
    const dist = Math.hypot(bot.body.position.x - grenade.pos.x, bot.body.position.z - grenade.pos.z);
    if (dist > radius) continue;
    const damage = Math.round(120 * (1 - dist / radius) + 20);
    const killed = bots.damage(bot, damage, 'torso', { name: 'You', team: 'vanguard' });
    if (killed) {
      hud.killfeed('You', bot.name, false);
      game.awardKill(true);
    }
  }
  const playerDist = Math.hypot(body.body.position.x - grenade.pos.x, body.body.position.z - grenade.pos.z);
  if (playerDist < radius && game.state.player.alive) {
    game.damagePlayer(Math.round(90 * (1 - playerDist / radius) + 10));
    hud.damageFlash();
    if (!game.state.player.alive) hud.showOverlay('dead');
  }
  syncHud();
}

function stepGrenade(dt) {
  if (!grenade.active) return;
  grenade.fuse -= dt;
  grenade.vel.y -= 20 * dt;
  grenadeNext.copy(grenade.pos).addScaledVector(grenade.vel, dt);
  const next = grenadeNext;
  for (const collider of world.colliders) {
    if (next.x > collider.min.x - 0.09 && next.x < collider.max.x + 0.09 &&
        next.y > collider.min.y - 0.09 && next.y < collider.max.y + 0.09 &&
        next.z > collider.min.z - 0.09 && next.z < collider.max.z + 0.09) {
      if (grenade.pos.x <= collider.min.x - 0.09 || grenade.pos.x >= collider.max.x + 0.09) grenade.vel.x *= -0.45;
      if (grenade.pos.y <= collider.min.y - 0.09 || grenade.pos.y >= collider.max.y + 0.09) grenade.vel.y *= -0.45;
      if (grenade.pos.z <= collider.min.z - 0.09 || grenade.pos.z >= collider.max.z + 0.09) grenade.vel.z *= -0.45;
      grenade.vel.multiplyScalar(0.7);
      break;
    }
  }
  grenade.pos.addScaledVector(grenade.vel, dt);
  if (grenade.pos.y < 0.09) {
    grenade.pos.y = 0.09;
    grenade.vel.y *= -0.45;
    grenade.vel.x *= 0.7;
    grenade.vel.z *= 0.7;
  }
  grenadeMesh.position.copy(grenade.pos);
  if (grenade.fuse <= 0) explodeGrenade();
}

function siteNearPlayer() {
  const p = body.body.position;
  if (Math.hypot(SITE_A.x - p.x, SITE_A.z - p.z) < SITE_A.r) return 'A';
  if (Math.hypot(SITE_B.x - p.x, SITE_B.z - p.z) < SITE_B.r) return 'B';
  return null;
}

function buy(id) {
  const s = game.state;
  if (s.phase !== 'buy') return;
  if (id === 'armor') {
    if (game.buyArmor()) audio.buy();
    syncHud();
    return;
  }
  if (id === 'grenade') {
    if (s.money >= GRENADE.price && !ownedGrenade) {
      s.money -= GRENADE.price;
      ownedGrenade = true;
      grenadesHeld = 1;
      audio.buy();
    }
    syncHud();
    return;
  }
  const def = WEAPONS[id];
  if (!def || s.money < def.price) return;
  if (weapon.state.id === id) return;
  s.money -= def.price;
  saveAmmo();
  if (def.slot === 1) primaryId = id;
  ammoStore[id] = { mag: def.mag, reserve: def.reserve };
  loadAmmo(id);
  audio.buy();
  syncHud();
}

function toggleBuy(open) {
  buyOpen = open;
  hud.showBuy(open);
  if (open && document.pointerLockElement) document.exitPointerLock();
}

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    started = true;
    audio.unlock();
    hud.hideOverlay();
    if (buyOpen) toggleBuy(false);
  } else if (game.state.phase === 'live' || game.state.phase === 'buy') {
    if (!buyOpen && game.state.player.alive && game.state.phase !== 'matchEnd') {
      hud.showOverlay(started ? 'paused' : 'start');
    }
  }
}

hud.onPlay(() => {
  if (shot) return;
  if (game.state.phase === 'menu') {
    game.startMatch();
  } else if (game.state.phase === 'matchEnd') {
    game.startMatch();
  }
  hud.hideOverlay();
  input.requestLock();
});
hud.onBuy(buy);

function step(dt) {
  elapsed += dt;
  const s = game.state;
  if (s.phase === 'menu') return;

  // Round-end pacing: after the banner, the next buy phase starts.
  if (s.phase === 'roundEnd') {
    if (roundEndAt === 0) roundEndAt = elapsed;
    if (elapsed - roundEndAt >= 3.6) {
      roundEndAt = 0;
      game.nextRound();
    }
  }

  game.tick(dt, {
    ember: bots.aliveCount('ember'),
    vanguard: (s.player.alive ? 1 : 0) + bots.aliveCount('vanguard'),
  });

  if (s.phase === 'live' || s.phase === 'buy') {
    if (s.player.alive) player.step(dt, input.state.keys);
    weapon.step(dt);
    weapon.setScoped(input.state.scoping && weapon.state.id === 'dmr');
    fovTarget = weapon.state.scoped ? 30 : 74;
    if (Math.abs(camera.fov - fovTarget) > 0.2) {
      camera.fov += (fovTarget - camera.fov) * Math.min(1, dt * 14);
      camera.updateProjectionMatrix();
    }
  }
  bots.step(dt, {
    playerAlive: s.player.alive,
    playerPos: body.body.position,
    playerSpeed: player.groundSpeed(),
    playerCrouching: body.crouching,
    spike: s.spike,
  }, elapsed);
  stepGrenade(dt);
  world.step(dt, elapsed);
  fx.step(dt);

  // Planting: hold E inside a site while carrying the spike.
  if (s.phase === 'live' && s.spike.state === 'carried' && s.spike.carrier === 'player' && s.player.alive) {
    const site = siteNearPlayer();
    if (site && input.state.keys.has('KeyE')) {
      plantProgress += dt / PLANT_TIME;
      hud.setPlant(Math.min(1, plantProgress), `Planting spike at ${site}…`);
      if (plantProgress >= 1) {
        plantProgress = 0;
        hud.setPlant(null);
        game.plantSpike(site);
      }
    } else {
      if (plantProgress > 0) hud.setPlant(null);
      plantProgress = 0;
      if (site) hud.setHint('Hold E to plant the spike');
      else if (s.spike.state === 'carried') hud.setHint('');
    }
  } else {
    hud.setPlant(null);
  }
}

function handlePressed() {
  for (const code of input.takePressed()) {
    if (code === 'KeyB' && game.state.phase === 'buy') toggleBuy(!buyOpen);
    if (code === 'KeyG') throwGrenade();
    if (code === 'KeyR') weapon.reload();
    if (code === 'Digit1' && weapon.state.id !== primaryId) { saveAmmo(); loadAmmo(primaryId); }
    if (code === 'Digit2' && weapon.state.id !== 'pistol') { saveAmmo(); loadAmmo('pistol'); }
  }
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozen) {
    const look = input.takeLook();
    if (game.state.player.alive || game.state.phase === 'menu') player.look(look.x, look.y);
    handlePressed();
    if (input.state.firing && weapon.ready() && game.state.phase === 'live' && game.state.player.alive) {
      shoot(shot ? 0 : weapon.spread(player.groundSpeed()));
    }
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
    syncCamera();
    syncHud();
  }
  renderer.render(scene, camera);
}

function settle(steps) {
  for (let index = 0; index < steps; index += 1) step(FIXED_STEP);
}

function runShot(name) {
  hud.hideOverlay();
  body.pitch = 0;
  body.yaw = 0;
  if (name === 'start') {
    body.body.position.set(6, 0, 15.2);
    body.yaw = 0;
    settle(20);
    aimAt(new THREE.Vector3(-6, 1.3, -8));
    hud.showOverlay('start', 0);
  } else if (name === 'buy') {
    game.startMatch();
    settle(10);
    body.body.position.set(0, 0, 13);
    body.yaw = 0;
    settle(10);
    aimAt(new THREE.Vector3(0, 1.4, -6));
    toggleBuy(true);
  } else if (name === 'play') {
    game.startMatch();
    game.state.phase = 'live';
    game.state.timer = 87;
    settle(30);
    // Stage a firefight at mid: two defenders ahead, one ally beside the player.
    const defenders = bots.bots.filter((b) => b.team === 'ember');
    defenders[0].body.position.set(-2.5, 0, -4);
    defenders[1].body.position.set(3.2, 0, -6.5);
    defenders[1].yaw = Math.PI;
    defenders[2].body.position.set(7, 0, -9);
    bots.bots[0].body.position.set(-2.2, 0, 6);
    body.body.position.set(0, 0, 9);
    settle(12);
    aimAt(new THREE.Vector3(-2.5, 1.2, -4));
    shoot(0);
    settle(6);
    aimAt(new THREE.Vector3(3.2, 1.25, -6.5));
    shoot(0);
    settle(8);
  } else if (name === 'end') {
    game.startMatch();
    game.state.phase = 'live';
    game.state.timer = 60;
    settle(20);
    const defenders = bots.bots.filter((b) => b.team === 'ember');
    for (const bot of defenders) {
      bots.damage(bot, 999, 'torso', { name: 'You', team: 'vanguard' });
      bot.group.rotation.x = -1.45;
      bot.group.position.y = -0.08;
    }
    game.state.score.vanguard = 2;
    game.state.score.ember = 1;
    game.endRound('vanguard', 'Ember team eliminated');
    settle(10);
    body.body.position.set(-6, 0, 2);
    aimAt(new THREE.Vector3(-14, 1.2, -8));
    hud.setSpike('', false);
  }
  syncHud();
  paintTwiceThenReady();
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    syncCamera();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozen = true;
      return; // stop scheduling frames: the capture is frozen, and a spinning
      // loop would only burn the software renderer while the next shot loads.
    }
    requestAnimationFrame(paint);
  }
  requestAnimationFrame(paint);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

syncCamera();
syncHud();
// Read-only snapshot for play-testing and review: phase, economy, positions, spike.
window.__emberline = {
  snapshot() {
    const s = game.state;
    return {
      phase: s.phase,
      round: s.round,
      timer: Math.round(s.timer * 10) / 10,
      score: { ...s.score },
      money: s.money,
      player: {
        hp: Math.round(s.player.hp),
        armor: Math.round(s.player.armor),
        alive: s.player.alive,
        x: Math.round(body.body.position.x * 10) / 10,
        z: Math.round(body.body.position.z * 10) / 10,
        yaw: Math.round(body.yaw * 100) / 100,
        mag: weapon.state.mag,
      },
      alive: {
        vanguard: (s.player.alive ? 1 : 0) + bots.aliveCount('vanguard'),
        ember: bots.aliveCount('ember'),
      },
      spike: { ...s.spike },
      grenades: grenadesHeld,
      bots: bots.bots.map((bot) => ({
        name: bot.name,
        team: bot.team,
        x: Math.round(bot.body.position.x * 10) / 10,
        z: Math.round(bot.body.position.z * 10) / 10,
        hp: Math.round(bot.hp),
        alive: bot.alive,
        target: bot.target ? (bot.target.kind === 'player' ? 'player' : bot.target.bot.name) : null,
      })),
    };
  },
};
if (shot) runShot(shot);
else requestAnimationFrame(frame);
