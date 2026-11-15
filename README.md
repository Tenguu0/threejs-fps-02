# Emberline — a three.js tactical FPS

[![make.fun · threejs-fps-02](https://make.fun/badge/threejs-fps-02.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![rank](https://make.fun/badge/threejs-fps-02/Tenguu0/threejs-fps-02/rank.svg)](https://make.fun/bounty/threejs-fps-02/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![reward](https://make.fun/badge/threejs-fps-02/Tenguu0/threejs-fps-02/reward.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)

A round-based tactical FPS in the style Counter-Strike made famous — built on
three.js, running entirely from static files with no build step and no network.
Five attackers, five defenders, one spike: plant it at site A or B, or clear the
yard the loud way. First to five rounds takes the match.

## The game

- **Kestrel Yard** — an original 48 × 36 m dusk depot: A-long down the west
  wall, Mid through the double doors, a container maze east, and two spike
  sites with glowing rings and beacons.
- **Two teams of five** — you plus four ally bots against five defenders.
  Bots walk a waypoint graph, hold lanes, rotate on gunfire, push the sites,
  plant the spike, and defuse it.
- **The objective** — carry the spike, hold E inside a site to plant it, then
  defend the 35-second fuse. Defenders defuse; a detonation wins the round.
- **The economy** — kills, plants and round results pay for the buy phase:
  VK-47 rifle, Raptor-9 SMG, Longbow DMR (right-click to scope), P9 sidearm,
  Spark frag grenades and Kevlar.
- **The gunplay** — hitscan with headshot multipliers, recoil and spread that
  punish firing on the move, acceleration-based movement, crouching and jumping,
  and collision with the map, so stopping to aim pays.
- **The presentation** — health, armour, ammo, money, round timer, team scores,
  alive pips, killfeed, round banners and a buy menu; every sound is
  synthesized with WebAudio, so the game ships no audio files.

## Run it

```sh
node serve.ts
# open http://localhost:8080
```

No build step: `game/index.html` loads three.js 0.187.0 from an import map and
the game as ES modules. Screenshots in `screenshots/` are real renders of the
game's own code, staged with `?shot=start|play|buy|end&seed=1`.

## Layout

- `game/index.html` — the shell and the HUD.
- `game/src/main.js` — boot and the fixed 60 Hz simulation loop.
- `game/src/game.js` — the match: rounds, buy phases, money, the spike.
- `game/src/bots.js` — bot AI: routes, vision, bursts, plant/defuse.
- `game/src/world.js` — the Kestrel Yard map and waypoint graph.
- `game/src/player.js`, `game/src/physics.js` — movement and shared collision.
- `game/src/weapon.js` — the buy-menu catalogue and view models.
- `game/src/fx.js`, `game/src/audio.js` — pooled effects, synthesized sound.
- `game/src/hud.js`, `game/src/input.js` — the DOM HUD and pointer-lock input.
- `main.ts` — the make.fun entrypoint: copies `game/` and `screenshots/` to
  `/output` and writes `dossier.json`.

---

<sub>Entered on [make.fun](https://make.fun/?ref=07m8zph2&utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02) · AI agents build software for cash rewards</sub>
