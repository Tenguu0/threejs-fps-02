// The map: Kestrel Yard, a 48 x 36 m dusk depot. Vanguard (the player's side) attacks
// from the south; Ember defends from the north. Three lanes feed two spike sites:
// A-long down the west wall, Mid through the double doors, and the container maze east.
// Every box is a collider for bodies and a surface a bullet stops on. Plain geometry
// only, no models and no textures; site letters are drawn on a canvas at runtime.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const SITE_A = { x: -17, z: -11, r: 4.5 };
export const SITE_B = { x: 17, z: -11, r: 4.5 };
export const SPAWN_VANGUARD = { x: 0, z: 15 };
export const SPAWN_EMBER = { x: 0, z: -15 };

// Waypoint graph the bots walk: nodes are [x, z], edges are index pairs.
export const WAYPOINTS = [
  [0, 15], [-4, 12], [4, 12], [-2, 6], [2, 6], [0, 0], [0, -5],
  [-8, -6], [8, -6], [-14, -8], [14, -8], [-17, -11], [17, -11],
  [-21, 8], [-21, -2], [-21, -10], [21, 8], [21, 0], [21, -8],
  [-10, 12], [10, 12], [-8, -14], [8, -14], [0, -14],
  [-12, -2], [12, -2],
];
export const WAY_EDGES = [
  [0, 1], [0, 2], [1, 19], [2, 20], [19, 13], [20, 16], [13, 14], [14, 15],
  [15, 11], [11, 21], [21, 23], [1, 3], [2, 4], [3, 5], [4, 5], [5, 6],
  [6, 7], [6, 8], [7, 9], [8, 10], [9, 11], [10, 12], [12, 22], [22, 23],
  [16, 17], [17, 18], [18, 12], [24, 7], [24, 9], [24, 14], [25, 8],
  [25, 10], [25, 17], [7, 21], [8, 22], [15, 21], [18, 22], [13, 19], [16, 20],
];

export function createWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);

  const materials = {};
  for (const name of Object.keys(PALETTE)) {
    materials[name] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE[name]),
      roughness: name === 'accent' || name === 'ink' ? 0.55 : 0.92,
      metalness: 0.03,
    });
  }

  const colliders = [];
  const shootables = [];

  function box(width, height, depth, x, y, z, material) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), materials[material]);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    colliders.push(new THREE.Box3().setFromObject(mesh));
    shootables.push(mesh);
    return mesh;
  }

  // Floor and outer walls, 48 x 36 m, 5 m high, open to the dusk sky.
  box(48.4, 0.4, 36.4, 0, -0.2, 0, 'surface');
  box(0.4, 5, 36.4, -24.2, 2.5, 0, 'hairline');
  box(0.4, 5, 36.4, 24.2, 2.5, 0, 'hairline');
  box(48.4, 5, 0.4, 0, 2.5, -18.2, 'hairline');
  box(48.4, 5, 0.4, 0, 2.5, 18.2, 'hairline');

  // Mid wall with a double-door gap (x -1.6..1.6) at z = 2.
  box(19, 4.2, 0.6, -13.5, 2.1, 2, 'hairline');
  box(19, 4.2, 0.6, 13.5, 2.1, 2, 'hairline');
  box(3.2, 1.0, 0.6, 0, 4.7, 2, 'hairline');

  // Central depot block north of mid: a container stack that splits the push to A and B.
  box(10, 3.0, 4.6, 0, 1.5, -10.5, 'hairline');
  box(6.4, 1.4, 3.2, 0, 3.7, -10.5, 'surface');
  box(3.4, 2.6, 3.0, -7.5, 1.3, -10.5, 'surface');

  // A-long corner wall: the west lane turns at z = -4.
  box(0.6, 3.4, 8, -20.4, 1.7, -4, 'surface');
  box(4.4, 3.4, 0.6, -18.4, 1.7, -8, 'surface');

  // Site A cover: crates and a low wall the planter crouches behind.
  box(3.6, 1.1, 1.2, -17, 0.55, -7.2, 'hairline');
  box(1.2, 1.1, 3.6, -13.6, 0.55, -11, 'hairline');
  box(1.6, 1.1, 1.6, -20, 0.55, -13.4, 'hairline');
  box(2.2, 2.6, 1.4, -14.2, 1.3, -14.6, 'surface');

  // Site B cover: container stack and crates.
  box(4.6, 2.6, 2.2, 17, 1.3, -15.2, 'surface');
  box(1.6, 1.1, 1.6, 13.4, 0.55, -8.6, 'hairline');
  box(1.2, 1.1, 3.6, 20.4, 0.55, -11, 'hairline');
  box(2.2, 1.1, 2.2, 19.6, 0.55, -14.8, 'hairline');

  // B-lane container maze (east).
  box(2.4, 2.6, 5.2, 19.4, 1.3, 4, 'surface');
  box(5.2, 2.6, 2.4, 16.4, 1.3, -2, 'surface');
  box(1.6, 1.1, 1.6, 13.2, 0.55, 6.4, 'hairline');
  box(2.4, 2.6, 2.4, 21.6, 1.3, -5.4, 'hairline');

  // Mid cover: crates to stop behind on the push, and spawn cover.
  box(1.6, 1.1, 1.6, -5.4, 0.55, 6.4, 'hairline');
  box(1.6, 1.1, 1.6, 5.4, 0.55, 6.4, 'hairline');
  box(2.4, 0.9, 1.2, -2.6, 0.45, -3.4, 'hairline');
  box(2.4, 0.9, 1.2, 2.6, 0.45, -3.4, 'hairline');
  box(1.6, 1.1, 1.6, -7.6, 0.55, 13.4, 'hairline');
  box(1.6, 1.1, 1.6, 7.6, 0.55, 13.4, 'hairline');
  box(0.9, 1.6, 0.9, -10.4, 0.8, -15.4, 'hairline');
  box(0.9, 1.6, 0.9, 10.4, 0.8, -15.4, 'hairline');

  // Site markers: a glowing floor ring, a floating marker and a warm light each.
  function siteMarker(site, letter) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(site.r - 0.35, site.r, 48),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.55, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(site.x, 0.02, site.z);
    group.add(ring);
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#f0a830';
    ctx.font = 'bold 190px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(letter, 128, 140);
    const texture = new THREE.CanvasTexture(canvas);
    const label = new THREE.Mesh(
      new THREE.PlaneGeometry(3.4, 3.4),
      new THREE.MeshBasicMaterial({ map: texture, transparent: true, opacity: 0.85, depthWrite: false }),
    );
    label.rotation.x = -Math.PI / 2;
    label.position.set(site.x, 0.03, site.z);
    group.add(label);
    const beacon = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.34),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.9 }),
    );
    beacon.position.set(site.x, 2.6, site.z);
    beacon.userData.spin = true;
    group.add(beacon);
    const light = new THREE.PointLight(new THREE.Color(PALETTE.accent), 14, 12);
    light.position.set(site.x, 2.2, site.z);
    scene.add(light);
    return { ring, beacon };
  }
  const siteA = siteMarker(SITE_A, 'A');
  const siteB = siteMarker(SITE_B, 'B');

  // Light: low amber sun from the west, cool dusk fill, dim sky gradient, plus a
  // flat ambient lift so lanes and cover read at a glance instead of going muddy.
  const sky = new THREE.HemisphereLight(new THREE.Color('#4a5a75'), new THREE.Color(PALETTE.canvas), 1.55);
  scene.add(sky);
  scene.add(new THREE.AmbientLight(new THREE.Color('#93a0b8'), 0.6));
  const key = new THREE.DirectionalLight(new THREE.Color('#ffcf9e'), 3.4);
  key.position.set(-18, 16, 10);
  key.target.position.set(0, 0, -4);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -30;
  key.shadow.camera.right = 30;
  key.shadow.camera.top = 24;
  key.shadow.camera.bottom = -24;
  key.shadow.camera.far = 70;
  key.shadow.bias = -0.0006;
  scene.add(key, key.target);
  const fill = new THREE.DirectionalLight(new THREE.Color(PALETTE.muted), 0.75);
  fill.position.set(14, 10, -12);
  scene.add(fill);

  return {
    colliders,
    shootables,
    group,
    sites: [siteA, siteB],
    step(dt, time) {
      for (const site of [siteA, siteB]) {
        site.beacon.rotation.y = time * 1.4;
        site.beacon.position.y = 2.6 + Math.sin(time * 1.8) * 0.18;
      }
    },
  };
}
