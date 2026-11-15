// Player movement: acceleration, friction, gravity, crouch and jump, on the shared
// body physics in physics.js. It owns look and recoil; game.js owns health.
import { createBody, steer, stepBody, groundSpeed } from './physics.js';

const RADIUS = 0.34;
const STAND_HEIGHT = 1.72;
const CROUCH_HEIGHT = 1.12;
const STAND_EYE = 1.6;
const CROUCH_EYE = 1.02;
const WALK_SPEED = 5.2;
const CROUCH_SPEED = 2.4;
const GROUND_ACCEL = 42;
const AIR_ACCEL = 9;
const FRICTION = 9;
const JUMP_SPEED = 6.2;

export function createPlayer(colliders, spawn) {
  const body = createBody(spawn.x, spawn.z, RADIUS, STAND_HEIGHT);
  const player = {
    body,
    yaw: 0,
    pitch: 0,
    eye: STAND_EYE,
    crouching: false,
    height: STAND_HEIGHT,
  };

  function look(dx, dy, sensitivity = 0.0022) {
    player.yaw -= dx * sensitivity;
    player.pitch = Math.max(-1.45, Math.min(1.45, player.pitch - dy * sensitivity));
  }

  function recoil(pitchKick, yawKick) {
    player.pitch = Math.min(1.45, player.pitch + pitchKick);
    player.yaw += yawKick;
  }

  function step(dt, keys) {
    const crouching = keys.has('ControlLeft') || keys.has('ControlRight') || keys.has('KeyC');
    if (crouching && !player.crouching) {
      player.crouching = true;
      player.height = CROUCH_HEIGHT;
      body.height = CROUCH_HEIGHT;
    } else if (!crouching && player.crouching) {
      // Stand only when the full height fits.
      const probe = body.position;
      let fits = true;
      for (const collider of colliders) {
        if (probe.x + RADIUS > collider.min.x && probe.x - RADIUS < collider.max.x &&
            probe.y + STAND_HEIGHT > collider.min.y && probe.y < collider.max.y &&
            probe.z + RADIUS > collider.min.z && probe.z - RADIUS < collider.max.z) {
          fits = false;
          break;
        }
      }
      if (fits) {
        player.crouching = false;
        player.height = STAND_HEIGHT;
        body.height = STAND_HEIGHT;
      }
    }
    const eyeTarget = player.crouching ? CROUCH_EYE : STAND_EYE;
    player.eye += (eyeTarget - player.eye) * Math.min(1, dt * 12);

    const forward = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
    const strafe = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    const sin = Math.sin(player.yaw);
    const cos = Math.cos(player.yaw);
    const wishX = -sin * forward + cos * strafe;
    const wishZ = -cos * forward - sin * strafe;
    const length = Math.hypot(wishX, wishZ) || 1;
    const speed = player.crouching ? CROUCH_SPEED : WALK_SPEED;
    steer(body, wishX / length, wishZ / length, speed, body.onGround ? GROUND_ACCEL : AIR_ACCEL, FRICTION, dt);

    if (keys.has('Space') && body.onGround) {
      body.velocity.y = JUMP_SPEED;
      body.onGround = false;
    }
    stepBody(body, dt, colliders);
  }

  return {
    state: player,
    step,
    look,
    recoil,
    groundSpeed() {
      return groundSpeed(body);
    },
    respawn() {
      body.position.set(spawn.x, 0, spawn.z);
      body.velocity.set(0, 0, 0);
      player.yaw = 0;
      player.pitch = 0;
    },
  };
}
