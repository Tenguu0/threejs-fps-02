// Shared body physics: one box (radius, height) resolved against the world's Box3
// colliders one axis at a time, so a wall never swallows a body. Both the player and
// the bots step through here; neither module re-implements collision.
import * as THREE from 'three';

const GRAVITY = 20;

export function createBody(x, z, radius, height) {
  return {
    position: new THREE.Vector3(x, 0, z),
    velocity: new THREE.Vector3(),
    radius,
    height,
    onGround: true,
  };
}

const probe = new THREE.Box3();

function overlaps(colliders, x, y, z, radius, height, lift) {
  probe.min.set(x - radius, y + lift, z - radius);
  probe.max.set(x + radius, y + height - lift, z + radius);
  for (let index = 0; index < colliders.length; index += 1) {
    if (probe.intersectsBox(colliders[index])) return colliders[index];
  }
  return null;
}

// Blend horizontal velocity toward a wish direction at a speed, with friction when idle.
export function steer(body, wishX, wishZ, speed, accel, friction, dt) {
  const blend = Math.min(1, (accel * dt) / Math.max(speed, 0.001));
  body.velocity.x += (wishX * speed - body.velocity.x) * blend;
  body.velocity.z += (wishZ * speed - body.velocity.z) * blend;
  if (body.onGround && wishX === 0 && wishZ === 0) {
    const damp = Math.max(0, 1 - friction * dt);
    body.velocity.x *= damp;
    body.velocity.z *= damp;
  }
}

export function stepBody(body, dt, colliders) {
  body.velocity.y -= GRAVITY * dt;
  const nextX = body.position.x + body.velocity.x * dt;
  if (!overlaps(colliders, nextX, body.position.y, body.position.z, body.radius, body.height, 0.04)) {
    body.position.x = nextX;
  } else {
    body.velocity.x = 0;
  }
  const nextZ = body.position.z + body.velocity.z * dt;
  if (!overlaps(colliders, body.position.x, body.position.y, nextZ, body.radius, body.height, 0.04)) {
    body.position.z = nextZ;
  } else {
    body.velocity.z = 0;
  }
  body.position.y += body.velocity.y * dt;
  body.onGround = false;
  const hit = overlaps(colliders, body.position.x, body.position.y, body.position.z, body.radius, body.height, 0);
  if (hit && body.velocity.y <= 0) {
    body.position.y = hit.max.y;
    body.velocity.y = 0;
    body.onGround = true;
  } else if (hit) {
    body.position.y = hit.min.y - body.height;
    body.velocity.y = 0;
  }
  if (body.position.y < 0) {
    body.position.y = 0;
    body.velocity.y = 0;
    body.onGround = true;
  }
  body.velocity.y = Math.max(-30, body.velocity.y);
}

export function groundSpeed(body) {
  return Math.hypot(body.velocity.x, body.velocity.z);
}

// Cheap segment-vs-box test for line of sight: true when nothing stands between a and b.
const rayBox = new THREE.Box3();
export function segmentBlocked(colliders, ax, ay, az, bx, by, bz) {
  const dx = bx - ax;
  const dy = by - ay;
  const dz = bz - az;
  const length = Math.hypot(dx, dy, dz);
  if (length < 0.001) return false;
  const invX = 1 / (dx || 1e-9);
  const invY = 1 / (dy || 1e-9);
  const invZ = 1 / (dz || 1e-9);
  for (let index = 0; index < colliders.length; index += 1) {
    const box = colliders[index];
    let tmin = 0;
    let tmax = length;
    let t1 = (box.min.x - ax) * invX;
    let t2 = (box.max.x - ax) * invX;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) continue;
    t1 = (box.min.y - ay) * invY;
    t2 = (box.max.y - ay) * invY;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) continue;
    t1 = (box.min.z - az) * invZ;
    t2 = (box.max.z - az) * invZ;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin <= tmax && tmax > 0.5 && tmin < length - 0.5) return true;
  }
  return false;
}

export { rayBox };
