// Effects: pooled tracers, impact sparks and the spike explosion. Everything is
// allocated once at boot; a shot never creates an object, it reuses a pool slot.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const TRACERS = 14;
const SPARKS = 40;

export function createFx(scene) {
  const tracerMaterial = new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.85 });
  const tracers = [];
  for (let index = 0; index < TRACERS; index += 1) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 1), tracerMaterial);
    mesh.visible = false;
    scene.add(mesh);
    tracers.push({ mesh, life: 0 });
  }
  let tracerCursor = 0;

  const sparkGeometry = new THREE.BoxGeometry(0.05, 0.05, 0.05);
  const sparkMaterial = new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.ink) });
  const sparks = [];
  for (let index = 0; index < SPARKS; index += 1) {
    const mesh = new THREE.Mesh(sparkGeometry, sparkMaterial);
    mesh.visible = false;
    scene.add(mesh);
    sparks.push({ mesh, life: 0, velocity: new THREE.Vector3() });
  }
  let sparkCursor = 0;

  const boom = new THREE.Mesh(
    new THREE.SphereGeometry(1, 20, 14),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0 }),
  );
  boom.visible = false;
  scene.add(boom);
  const boomLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 26);
  scene.add(boomLight);
  let boomLife = 0;
  let boomPos = new THREE.Vector3();

  const tmpA = new THREE.Vector3();
  const tmpB = new THREE.Vector3();

  return {
    tracer(from, to) {
      const slot = tracers[tracerCursor];
      tracerCursor = (tracerCursor + 1) % TRACERS;
      tmpA.copy(to).sub(from);
      const length = tmpA.length();
      if (length < 0.1) return;
      slot.mesh.position.copy(from).addScaledVector(tmpA, 0.5);
      slot.mesh.scale.set(1, 1, length);
      slot.mesh.lookAt(to);
      slot.mesh.visible = true;
      slot.life = 0.07;
    },
    impact(point, normal) {
      for (let count = 0; count < 5; count += 1) {
        const slot = sparks[sparkCursor];
        sparkCursor = (sparkCursor + 1) % SPARKS;
        slot.mesh.position.copy(point);
        slot.velocity.set(
          normal.x + (Math.random() * 2 - 1) * 1.4,
          normal.y + Math.random() * 1.6 + 0.6,
          normal.z + (Math.random() * 2 - 1) * 1.4,
        );
        slot.mesh.visible = true;
        slot.life = 0.32;
      }
    },
    explosion(point) {
      boomPos.copy(point);
      boom.position.copy(point);
      boom.visible = true;
      boomLife = 0.7;
      boomLight.position.set(point.x, point.y + 1, point.z);
    },
    step(dt) {
      for (const slot of tracers) {
        if (slot.life <= 0) continue;
        slot.life -= dt;
        if (slot.life <= 0) slot.mesh.visible = false;
      }
      for (const slot of sparks) {
        if (slot.life <= 0) continue;
        slot.life -= dt;
        slot.velocity.y -= 12 * dt;
        slot.mesh.position.addScaledVector(slot.velocity, dt);
        if (slot.life <= 0) slot.mesh.visible = false;
      }
      if (boomLife > 0) {
        boomLife -= dt;
        const t = 1 - Math.max(0, boomLife) / 0.7;
        const radius = 0.5 + t * 8;
        boom.scale.set(radius, radius, radius);
        boom.material.opacity = Math.max(0, 0.85 * (1 - t));
        boomLight.intensity = Math.max(0, 90 * (1 - t));
        if (boomLife <= 0) {
          boom.visible = false;
          boomLight.intensity = 0;
        }
      }
    },
  };
}
