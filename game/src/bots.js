// Bots: two teams of five that play the round. Attackers push lanes to a site and plant
// the spike; defenders hold sites, rotate on noise and defuse. Each bot walks a waypoint
// graph (world.js), sees with a vision cone and line of sight, reacts, then fires in
// bursts whose hit chance falls with distance and target speed. No bot teleports, no
// bot knows what it cannot see: hearing a shot only turns it toward the sound.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { WAYPOINTS, WAY_EDGES, SITE_A, SITE_B } from './world.js';
import { createBody, steer, stepBody, segmentBlocked } from './physics.js';

const NAMES_VANGUARD = ['Rook', 'Fable', 'Iris', 'Moss'];
const NAMES_EMBER = ['Cinder', 'Ash', 'Sable', 'Wren', 'Flint'];
const BOT_SPEED = 4.1;
const VISION_RANGE = 42;
const VISION_COS = Math.cos((100 * Math.PI) / 360);
const EYE = 1.5;
const CHEST = 1.15;

// Breadth-first search over the waypoint graph; the map is small, so this is cheap.
const ADJ = WAYPOINTS.map(() => []);
for (const [a, b] of WAY_EDGES) {
  ADJ[a].push(b);
  ADJ[b].push(a);
}

function nearestNode(x, z) {
  let best = 0;
  let bestDist = Infinity;
  for (let index = 0; index < WAYPOINTS.length; index += 1) {
    const dx = WAYPOINTS[index][0] - x;
    const dz = WAYPOINTS[index][1] - z;
    const dist = dx * dx + dz * dz;
    if (dist < bestDist) {
      bestDist = dist;
      best = index;
    }
  }
  return best;
}

function findPath(from, to) {
  if (from === to) return [to];
  const prev = new Array(WAYPOINTS.length).fill(-1);
  const queue = [from];
  prev[from] = from;
  while (queue.length) {
    const node = queue.shift();
    for (const next of ADJ[node]) {
      if (prev[next] !== -1) continue;
      prev[next] = node;
      if (next === to) {
        const path = [to];
        let at = to;
        while (at !== from) {
          at = prev[at];
          path.unshift(at);
        }
        return path;
      }
      queue.push(next);
    }
  }
  return [to];
}

const TORSO_GEO = new THREE.BoxGeometry(0.52, 0.78, 0.3);
const HEAD_GEO = new THREE.SphereGeometry(0.155, 12, 10);
const GUN_GEO = new THREE.BoxGeometry(0.07, 0.09, 0.55);
const LEG_GEO = new THREE.BoxGeometry(0.16, 0.62, 0.16);
const BAR_GEO = new THREE.BoxGeometry(0.5, 0.06, 0.02);

export function createBots(scene, world, hooks) {
  const colliders = world.colliders;
  const bots = [];
  const hitMeshes = [];
  let botIndex = 0;

  function makeBot(team, name, x, z, role, weapon) {
    const color = team === 'vanguard' ? PALETTE.vanguard : PALETTE.ember;
    const bodyMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: 0.65, metalness: 0.05 });
    const darkMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.85 });
    const group = new THREE.Group();
    const torso = new THREE.Mesh(TORSO_GEO, bodyMat);
    torso.position.y = 1.0;
    torso.castShadow = true;
    const head = new THREE.Mesh(HEAD_GEO, bodyMat);
    head.position.y = 1.53;
    head.castShadow = true;
    const gun = new THREE.Mesh(GUN_GEO, darkMat);
    gun.position.set(0.22, 1.05, -0.2);
    const legL = new THREE.Mesh(LEG_GEO, darkMat);
    legL.position.set(-0.13, 0.31, 0);
    const legR = new THREE.Mesh(LEG_GEO, darkMat);
    legR.position.set(0.13, 0.31, 0);
    const bar = new THREE.Mesh(BAR_GEO, new THREE.MeshBasicMaterial({ color: new THREE.Color('#7fd08a') }));
    bar.position.y = 1.86;
    group.add(torso, head, gun, legL, legR, bar);
    group.position.set(x, 0, z);
    scene.add(group);

    const bot = {
      id: botIndex,
      team,
      name,
      role,
      weapon,
      body: createBody(x, z, 0.34, 1.72),
      group,
      torso,
      head,
      bar,
      yaw: team === 'vanguard' ? Math.PI : 0,
      pitch: 0,
      hp: 100,
      armor: role === 'holdA' || role === 'holdB' ? 50 : 0,
      alive: true,
      fall: 0,
      path: [],
      pathIndex: 0,
      holdNode: -1,
      target: null,
      lastSeen: null,
      reactLeft: 0,
      aimTime: 0,
      burstLeft: 0,
      burstGap: 0,
      fireCooldown: 0,
      thinkAt: Math.random() * 0.12,
      strafeDir: 1,
      strafeAt: 0,
      channel: null,
      hasSpike: false,
      heardAt: 0,
      heardX: 0,
      heardZ: 0,
      stuckFor: 0,
      detourLeft: 0,
      detourX: 0,
      detourZ: 0,
      detourSide: 1,
      speed: BOT_SPEED * (0.92 + Math.random() * 0.16),
    };
    botIndex += 1;
    torso.userData.bot = bot;
    torso.userData.part = 'torso';
    head.userData.bot = bot;
    head.userData.part = 'head';
    hitMeshes.push(torso, head);
    bots.push(bot);
    return bot;
  }

  function spawnAll() {
    // Vanguard attackers push: two down A-long, one mid, one B.
    makeBot('vanguard', NAMES_VANGUARD[0], -2, 14, 'pushA', 'rifle');
    makeBot('vanguard', NAMES_VANGUARD[1], -5, 15, 'pushA', 'rifle');
    makeBot('vanguard', NAMES_VANGUARD[2], 1, 14, 'mid', 'rifle');
    makeBot('vanguard', NAMES_VANGUARD[3], 4, 15, 'pushB', 'smg');
    // Ember defenders hold: two on A, two on B, one mid roam.
    makeBot('ember', NAMES_EMBER[0], -14, -13, 'holdA', 'rifle');
    makeBot('ember', NAMES_EMBER[1], -9, -15, 'holdA', 'rifle');
    makeBot('ember', NAMES_EMBER[2], 14, -13, 'holdB', 'rifle');
    makeBot('ember', NAMES_EMBER[3], 9, -15, 'holdB', 'dmr');
    makeBot('ember', NAMES_EMBER[4], 0, -12, 'roam', 'rifle');
  }

  function setRoute(bot, node) {
    const from = nearestNode(bot.body.position.x, bot.body.position.z);
    bot.path = findPath(from, node);
    bot.pathIndex = 0;
  }

  function goalNode(bot, game) {
    if (bot.team === 'ember') {
      if (game.spike.state === 'planted') {
        return game.spike.site === 'A' ? 11 : 12;
      }
      if (bot.role === 'holdA') return bot.holdNode >= 0 ? bot.holdNode : 9;
      if (bot.role === 'holdB') return bot.holdNode >= 0 ? bot.holdNode : 10;
      return 6;
    }
    if (bot.hasSpike) return bot.spikeSite === 'B' ? 12 : 11;
    if (bot.role === 'pushA') return 11;
    if (bot.role === 'pushB') return 12;
    return 6;
  }

  function canSee(bot, targetPos, targetEye) {
    const dx = targetPos.x - bot.body.position.x;
    const dz = targetPos.z - bot.body.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist > VISION_RANGE) return false;
    const forwardX = -Math.sin(bot.yaw);
    const forwardZ = -Math.cos(bot.yaw);
    if ((dx * forwardX + dz * forwardZ) / Math.max(dist, 0.001) < VISION_COS) return false;
    const eyeY = bot.body.position.y + EYE;
    return !segmentBlocked(colliders, bot.body.position.x, eyeY, bot.body.position.z, targetPos.x, targetEye, targetPos.z);
  }

  function pickTarget(bot, game, now) {
    const eyeY = bot.body.position.y + EYE;
    let best = null;
    let bestDist = Infinity;
    const enemies = [];
    if (bot.team === 'ember' && game.playerAlive) {
      enemies.push({ kind: 'player', pos: game.playerPos, eye: game.playerPos.y + 1.5, speed: game.playerSpeed, crouching: game.playerCrouching });
    }
    for (const other of bots) {
      if (!other.alive || other.team === bot.team) continue;
      enemies.push({ kind: 'bot', bot: other, pos: other.body.position, eye: other.body.position.y + 1.4, speed: Math.hypot(other.body.velocity.x, other.body.velocity.z), crouching: false });
    }
    for (const enemy of enemies) {
      const dist = Math.hypot(enemy.pos.x - bot.body.position.x, enemy.pos.z - bot.body.position.z);
      if (dist > VISION_RANGE || dist >= bestDist) continue;
      if (!canSee(bot, enemy.pos, enemy.eye)) continue;
      best = enemy;
      bestDist = dist;
    }
    if (best) {
      bot.target = best;
      bot.lastSeen = { x: best.pos.x, z: best.pos.z, at: now };
      bot.reactLeft = 0.28 + hooks.random() * 0.24;
      bot.aimTime = 0;
    }
    return best;
  }

  function fireAt(bot, game, now) {
    const target = bot.target;
    if (!target) return;
    const muzzle = new THREE.Vector3(
      bot.body.position.x - Math.sin(bot.yaw) * 0.5,
      bot.body.position.y + 1.35,
      bot.body.position.z - Math.cos(bot.yaw) * 0.5,
    );
    const targetPos = target.pos;
    const dist = Math.hypot(targetPos.x - bot.body.position.x, targetPos.z - bot.body.position.z);
    const movingPenalty = target.speed > 2 ? 0.7 : 1;
    const crouchPenalty = target.crouching ? 0.85 : 1;
    const rangeFall = Math.max(0.25, 1 - dist / 70);
    const hitChance = 0.62 * rangeFall * movingPenalty * crouchPenalty;
    const hit = hooks.random() < hitChance;
    const head = hit && hooks.random() < 0.12;
    const aimPoint = new THREE.Vector3(
      targetPos.x + (hit ? 0 : (hooks.random() * 2 - 1) * 1.6),
      targetPos.y + (head ? 1.5 : 1.15) + (hit ? 0 : (hooks.random() * 2 - 1) * 0.9),
      targetPos.z + (hit ? 0 : (hooks.random() * 2 - 1) * 1.6),
    );
    hooks.fx.tracer(muzzle, aimPoint);
    hooks.audio.enemyShot(dist);
    if (!hit) return;
    const base = bot.weapon === 'dmr' ? 82 : bot.weapon === 'smg' ? 19 : 33;
    const falloff = dist > 25 ? 0.8 : 1;
    const damage = Math.round(base * (head ? (bot.weapon === 'dmr' ? 2 : 4) : 1) * falloff);
    if (target.kind === 'player') hooks.damagePlayer(damage, bot.name, head);
    else hooks.damageBot(target.bot, damage, head ? 'head' : 'torso', bot);
  }

  function stepBot(bot, dt, game, now) {
    if (!bot.alive) {
      bot.fall = Math.min(1, bot.fall + dt / 0.4);
      bot.group.rotation.x = -bot.fall * 1.45;
      bot.group.position.y = -bot.fall * 0.08;
      return;
    }
    bot.thinkAt -= dt;
    bot.fireCooldown = Math.max(0, bot.fireCooldown - dt);

    // Channel: planting or defusing. Damage interrupts it.
    if (bot.channel) {
      bot.channel.left -= dt;
      if (bot.channel.left <= 0) {
        const done = bot.channel;
        bot.channel = null;
        if (done.type === 'plant') hooks.spikePlanted(bot);
        else hooks.spikeDefused(bot);
      }
      return;
    }

    // Vision, staggered so nine bots do not all raycast on the same tick.
    if (bot.thinkAt <= 0) {
      bot.thinkAt = 0.12;
      if (bot.target && bot.target.kind === 'bot' && !bot.target.bot.alive) bot.target = null;
      if (bot.target && bot.target.kind === 'player' && !game.playerAlive) bot.target = null;
      if (!bot.target || (bot.lastSeen && now - bot.lastSeen.at > 2)) {
        bot.target = null;
        pickTarget(bot, game, now);
      } else if (bot.target) {
        const targetPos = bot.target.pos;
        if (!canSee(bot, targetPos, bot.target.eye)) {
          if (now - bot.lastSeen.at > 1.2) bot.target = null;
        } else {
          bot.lastSeen = { x: targetPos.x, z: targetPos.z, at: now };
        }
      }
    }

    const pos = bot.body.position;
    let wishX = 0;
    let wishZ = 0;
    let moving = false;

    if (bot.target && bot.reactLeft <= 0) {
      // Engage: face the target, strafe, fire in bursts.
      const targetPos = bot.target.pos;
      const dx = targetPos.x - pos.x;
      const dz = targetPos.z - pos.z;
      const dist = Math.hypot(dx, dz) || 1;
      const wantYaw = Math.atan2(-dx, -dz);
      let yawDiff = wantYaw - bot.yaw;
      while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
      while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
      bot.yaw += Math.max(-dt * 6, Math.min(dt * 6, yawDiff));
      const targetEye = targetPos.y + (bot.target.kind === 'player' ? 1.35 : 1.2);
      bot.pitch += ((Math.atan2(targetEye - (pos.y + EYE), dist) - bot.pitch) * Math.min(1, dt * 8));
      bot.aimTime += dt;
      if (bot.strafeAt <= now) {
        bot.strafeAt = now + 0.7 + hooks.random() * 0.7;
        bot.strafeDir = hooks.random() < 0.5 ? -1 : 1;
        if (dist < 6) bot.strafeDir = -bot.strafeDir;
      }
      const strafeX = Math.cos(bot.yaw) * bot.strafeDir;
      const strafeZ = -Math.sin(bot.yaw) * bot.strafeDir;
      wishX = strafeX * 0.55;
      wishZ = strafeZ * 0.55;
      moving = true;
      if (bot.fireCooldown <= 0) {
        if (bot.burstLeft <= 0) {
          bot.burstLeft = bot.weapon === 'dmr' ? 1 : 3 + Math.floor(hooks.random() * 3);
          bot.fireCooldown = bot.weapon === 'dmr' ? 0.9 : 0.55 + hooks.random() * 0.4;
        } else {
          bot.burstLeft -= 1;
          bot.burstGap = 0.11;
          fireAt(bot, game, now);
          bot.fireCooldown = 0.11;
        }
      }
    } else if (bot.target) {
      bot.reactLeft -= dt;
    } else {
      // No target: walk the route, or hold a position and watch a lane.
      const goal = goalNode(bot, game);
      if (bot.team === 'ember' && (bot.role === 'holdA' || bot.role === 'holdB')) {
        const hold = WAYPOINTS[goal];
        const dx = hold[0] - pos.x;
        const dz = hold[1] - pos.z;
        if (Math.hypot(dx, dz) > 1.2) {
          if (!bot.path.length || bot.path[bot.path.length - 1] !== goal) setRoute(bot, goal);
          const next = WAYPOINTS[bot.path[Math.min(bot.pathIndex, bot.path.length - 1)]];
          const ndx = next[0] - pos.x;
          const ndz = next[1] - pos.z;
          if (Math.hypot(ndx, ndz) < 0.8 && bot.pathIndex < bot.path.length - 1) bot.pathIndex += 1;
          const len = Math.hypot(ndx, ndz) || 1;
          wishX = ndx / len;
          wishZ = ndz / len;
          moving = true;
        } else {
          // Holding: face the lane junction the attackers come down (south-west
          // for A, south-east for B) and sweep it slowly, so a planter at the
          // site and a pusher down the lane both cross the vision cone.
          const facePoint = bot.role === 'holdA' ? { x: -20, z: 2 } : { x: 20, z: 2 };
          const face = Math.atan2(-(facePoint.x - pos.x), -(facePoint.z - pos.z))
            + Math.sin(now * 0.6 + bot.id * 1.7) * 1.0;
          bot.yaw += (face - bot.yaw) * Math.min(1, dt * 2);
        }
      } else {
        if (!bot.path.length || bot.path[bot.path.length - 1] !== goal) setRoute(bot, goal);
        const next = WAYPOINTS[bot.path[Math.min(bot.pathIndex, bot.path.length - 1)]];
        const ndx = next[0] - pos.x;
        const ndz = next[1] - pos.z;
        const dist = Math.hypot(ndx, ndz);
        if (dist < 0.8 && bot.pathIndex < bot.path.length - 1) bot.pathIndex += 1;
        else if (dist >= 0.8) {
          wishX = ndx / dist;
          wishZ = ndz / dist;
          moving = true;
          bot.yaw += (Math.atan2(-wishX, -wishZ) - bot.yaw) * Math.min(1, dt * 6);
        }
      }
      // Spike duties.
      if (bot.team === 'vanguard' && bot.hasSpike) {
        const site = bot.spikeSite === 'B' ? SITE_B : SITE_A;
        const dist = Math.hypot(site.x - pos.x, site.z - pos.z);
        if (dist < site.r * 0.7 && !bot.channel) {
          bot.channel = { type: 'plant', left: 3 };
          hooks.audio.plant();
        }
      }
      if (bot.team === 'ember' && game.spike.state === 'planted' && !bot.channel) {
        const site = game.spike.site === 'B' ? SITE_B : SITE_A;
        const dist = Math.hypot(site.x - pos.x, site.z - pos.z);
        if (dist < 2.2) {
          bot.channel = { type: 'defuse', left: 5 };
          hooks.audio.plant();
        }
      }
      // Pick up a dropped spike by walking over it.
      if (bot.team === 'vanguard' && game.spike.state === 'dropped' && !game.spike.carrier) {
        const dist = Math.hypot(game.spike.x - pos.x, game.spike.z - pos.z);
        if (dist < 1.4) {
          bot.hasSpike = true;
          bot.spikeSite = hooks.random() < 0.5 ? 'A' : 'B';
          game.spike.state = 'carried';
          game.spike.carrier = bot;
          hooks.onSpikePickup(bot.name);
        }
      }
    }

    // Unstick: a bot that wants to move but is not getting anywhere (strafed
    // into a crate, wedged on a corner) sidesteps around the obstacle instead
    // of pushing at it forever, flipping side each time it gets stuck.
    if (moving) {
      const speedNow = Math.hypot(bot.body.velocity.x, bot.body.velocity.z);
      if (speedNow < 0.5) bot.stuckFor += dt;
      else bot.stuckFor = 0;
      if (bot.detourLeft > 0) {
        bot.detourLeft -= dt;
        wishX = bot.detourX;
        wishZ = bot.detourZ;
      } else if (bot.stuckFor > 0.8) {
        bot.detourSide = -bot.detourSide;
        bot.detourX = -wishZ * bot.detourSide;
        bot.detourZ = wishX * bot.detourSide;
        bot.detourLeft = 0.7;
        bot.stuckFor = 0;
      }
    } else {
      bot.stuckFor = 0;
    }

    steer(bot.body, wishX, wishZ, bot.speed, 30, 8, dt);
    stepBody(bot.body, dt, colliders);
    bot.group.position.set(pos.x, pos.y, pos.z);
    bot.group.rotation.y = bot.yaw;
    bot.group.rotation.x = 0;
    // Walk cycle: legs swing, torso bobs; a dead-simple read of movement.
    const speed = Math.hypot(bot.body.velocity.x, bot.body.velocity.z);
    const phase = now * (4 + speed * 1.6);
    bot.group.children[3].rotation.x = moving ? Math.sin(phase) * 0.5 : 0;
    bot.group.children[4].rotation.x = moving ? -Math.sin(phase) * 0.5 : 0;
    bot.bar.material.color.set(bot.hp > 50 ? '#7fd08a' : bot.hp > 25 ? '#f0a830' : '#d95f4b');
    bot.bar.scale.x = Math.max(0.02, bot.hp / 100);
    bot.bar.visible = bot.hp < 100;
  }

  function hearShot(x, z) {
    for (const bot of bots) {
      if (!bot.alive || bot.target) continue;
      const dist = Math.hypot(x - bot.body.position.x, z - bot.body.position.z);
      if (dist < 26) {
        bot.heardAt = performance.now() / 1000;
        bot.heardX = x;
        bot.heardZ = z;
        if (bot.team === 'ember' && bot.role === 'roam') {
          setRoute(bot, nearestNode(x, z));
        }
      }
    }
  }

  return {
    bots,
    hitMeshes,
    spawnAll,
    hearShot,
    resetRound(spawnVanguard, spawnEmber) {
      for (const bot of bots) {
        const spawn = bot.team === 'vanguard' ? spawnVanguard : spawnEmber;
        const jitter = (hooks.random() * 2 - 1) * 2;
        bot.body.position.set(spawn.x + jitter, 0, spawn.z + (hooks.random() * 2 - 1) * 1.5);
        bot.body.velocity.set(0, 0, 0);
        bot.hp = 100;
        bot.alive = true;
        bot.fall = 0;
        bot.path = [];
        bot.pathIndex = 0;
        bot.target = null;
        bot.lastSeen = null;
        bot.channel = null;
        bot.hasSpike = false;
        bot.yaw = bot.team === 'vanguard' ? Math.PI : 0;
        bot.group.rotation.set(0, bot.yaw, 0);
        bot.group.position.set(bot.body.position.x, 0, bot.body.position.z);
        bot.bar.visible = false;
      }
    },
    step(dt, game, now) {
      for (const bot of bots) stepBot(bot, dt, game, now);
    },
    damage(bot, amount, part, attacker) {
      if (!bot.alive) return false;
      if (bot.channel) bot.channel = null;
      const mult = part === 'head' ? 1 : 1;
      bot.hp -= amount * mult;
      if (bot.hp > 0) return false;
      bot.hp = 0;
      bot.alive = false;
      bot.fall = 0;
      if (bot.hasSpike) {
        bot.hasSpike = false;
        hooks.onSpikeDrop(bot.body.position.x, bot.body.position.z);
      }
      return true;
    },
    aliveCount(team) {
      return bots.filter((bot) => bot.alive && bot.team === team).length;
    },
  };
}
