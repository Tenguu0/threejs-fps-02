// The match: one state object, one clock. Rounds run buy (12 s) -> live (100 s) ->
// round end (4 s); first to 5 rounds takes the match. The spike is the objective:
// Vanguard plants it at A or B, Ember defuses it, and the fuse decides the rest.
// Money is the player's only: kills, plants and round results pay for the next buy.
import { SITE_A, SITE_B } from './world.js';

export const BUY_TIME = 12;
export const ROUND_TIME = 100;
export const FUSE_TIME = 35;
export const PLANT_TIME = 3;
export const WIN_ROUNDS = 5;
export const MAX_ROUNDS = 9;
export const START_MONEY = 800;

export function createGame(hooks) {
  const state = {
    phase: 'menu',
    round: 0,
    score: { vanguard: 0, ember: 0 },
    money: START_MONEY,
    timer: 0,
    lossStreak: 0,
    spike: { state: 'carried', site: null, x: 0, z: 0, fuse: 0, carrier: 'player' },
    player: { hp: 100, armor: 0, alive: true, kills: 0, deaths: 0 },
    banner: null,
    matchWinner: null,
  };

  function sitePos(site) {
    return site === 'B' ? SITE_B : SITE_A;
  }

  function startMatch() {
    state.round = 0;
    state.score.vanguard = 0;
    state.score.ember = 0;
    state.money = START_MONEY;
    state.lossStreak = 0;
    state.player.hp = 100;
    state.player.armor = 0;
    state.player.alive = true;
    state.player.kills = 0;
    state.player.deaths = 0;
    state.matchWinner = null;
    startRound();
  }

  function startRound() {
    state.round += 1;
    state.phase = 'buy';
    state.timer = BUY_TIME;
    state.spike = { state: 'carried', site: null, x: 0, z: 0, fuse: 0, carrier: 'player' };
    state.player.hp = 100;
    state.player.alive = true;
    state.banner = null;
    hooks.onRoundStart(state.round);
  }

  function endRound(winner, reason) {
    if (state.phase === 'roundEnd' || state.phase === 'matchEnd') return;
    state.score[winner] += 1;
    const playerWon = winner === 'vanguard';
    if (playerWon) {
      state.money += 3250;
      state.lossStreak = 0;
      hooks.audio.roundWin();
    } else {
      state.money += Math.min(2900, 1900 + state.lossStreak * 500);
      state.lossStreak += 1;
      hooks.audio.roundLose();
    }
    state.phase = 'roundEnd';
    state.timer = 4;
    state.banner = { winner, reason };
    hooks.onRoundEnd(winner, reason, state.score);
    if (state.score[winner] >= WIN_ROUNDS || state.round >= MAX_ROUNDS) {
      state.matchWinner = state.score.vanguard > state.score.ember ? 'vanguard' : 'ember';
      state.phase = 'matchEnd';
      state.timer = 0;
      hooks.onMatchEnd(state.matchWinner, state.score);
    }
  }

  function tick(dt, alive) {
    if (state.phase === 'buy') {
      state.timer -= dt;
      if (state.timer <= 0) {
        state.phase = 'live';
        state.timer = ROUND_TIME;
        hooks.onLive();
      }
      return;
    }
    if (state.phase !== 'live') return;
    state.timer -= dt;
    if (state.spike.state === 'planted') {
      state.spike.fuse -= dt;
      if (Math.ceil(state.spike.fuse) !== Math.ceil(state.spike.fuse + dt)) hooks.audio.beep(state.spike.fuse < 10);
      if (state.spike.fuse <= 0) {
        hooks.onDetonate(state.spike.site);
        endRound('vanguard', 'Spike detonated');
        return;
      }
    }
    if (alive.ember === 0) {
      endRound('vanguard', 'Ember team eliminated');
      return;
    }
    if (alive.vanguard === 0 && state.spike.state !== 'planted') {
      endRound('ember', 'Vanguard team eliminated');
      return;
    }
    if (state.timer <= 0) {
      endRound('ember', state.spike.state === 'planted' ? 'Time expired' : 'Time expired — spike never planted');
    }
  }

  return {
    state,
    startMatch,
    startRound,
    endRound,
    tick,
    sitePos,
    awardKill(isPlayer, victimTeam) {
      if (isPlayer) {
        state.money += 300;
        state.player.kills += 1;
      }
    },
    plantSpike(site) {
      const planterWasPlayer = state.spike.carrier === 'player';
      state.spike.state = 'planted';
      state.spike.site = site;
      const pos = sitePos(site);
      state.spike.x = pos.x;
      state.spike.z = pos.z;
      state.spike.fuse = FUSE_TIME;
      state.spike.carrier = null;
      if (planterWasPlayer) state.money += 300;
      hooks.audio.plant();
      hooks.onPlanted(site);
    },
    defuseSpike() {
      state.spike.state = 'gone';
      state.spike.carrier = null;
      endRound('ember', 'Spike defused');
    },
    dropSpike(x, z) {
      state.spike.state = 'dropped';
      state.spike.x = x;
      state.spike.z = z;
      state.spike.carrier = null;
    },
    playerDied() {
      state.player.alive = false;
      state.player.deaths += 1;
      if (state.spike.state === 'carried' && state.spike.carrier === 'player') {
        hooks.onSpikeDropRequest();
      }
    },
    nextRound() {
      if (state.phase === 'matchEnd') return;
      startRound();
    },
    damagePlayer(amount) {
      if (!state.player.alive) return 0;
      let remaining = amount;
      if (state.player.armor > 0) {
        const absorbed = Math.min(state.player.armor, Math.ceil(amount * 0.5));
        state.player.armor -= absorbed;
        remaining = amount - absorbed;
      }
      state.player.hp -= remaining;
      if (state.player.hp <= 0) {
        state.player.hp = 0;
        this.playerDied();
      }
      return remaining;
    },
    buyArmor() {
      if (state.money < 650 || state.player.armor >= 100) return false;
      state.money -= 650;
      state.player.armor = 100;
      return true;
    },
  };
}
