// Sound: every effect is synthesized with WebAudio, so the game ships no audio files
// and makes no network request. One noise buffer is built at boot and reused.
export function createAudio() {
  let ctx = null;
  let master = null;
  let noiseBuffer = null;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return true;
    }
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return false;
      ctx = new AudioContext();
      master = ctx.createGain();
      master.gain.value = 0.32;
      master.connect(ctx.destination);
      noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let index = 0; index < data.length; index += 1) data[index] = Math.random() * 2 - 1;
      return true;
    } catch {
      return false;
    }
  }

  function noise(duration, filterFreq, gainValue, type = 'lowpass') {
    if (!ensure()) return;
    const source = ctx.createBufferSource();
    source.buffer = noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = filterFreq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(gainValue, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start();
    source.stop(ctx.currentTime + duration);
  }

  function tone(freq, duration, gainValue, type = 'sine', slideTo = 0) {
    if (!ensure()) return;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + duration);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(gainValue, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(master);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  }

  return {
    unlock() {
      ensure();
    },
    shot(id) {
      if (id === 'dmr') { noise(0.28, 900, 0.9); tone(120, 0.18, 0.5, 'sawtooth', 55); }
      else if (id === 'smg') { noise(0.09, 1800, 0.5); }
      else if (id === 'pistol') { noise(0.12, 1400, 0.6); }
      else { noise(0.14, 1200, 0.75); tone(160, 0.1, 0.25, 'square', 70); }
    },
    enemyShot(distance) {
      noise(0.12, 900, Math.max(0.08, 0.5 - distance * 0.012));
    },
    dry() {
      tone(1400, 0.04, 0.2, 'square');
    },
    reload() {
      tone(500, 0.05, 0.25, 'square');
      setTimeout(() => tone(700, 0.05, 0.25, 'square'), 160);
    },
    hit() {
      tone(1800, 0.05, 0.3, 'sine');
    },
    kill() {
      tone(1800, 0.05, 0.3, 'sine');
      setTimeout(() => tone(2400, 0.07, 0.3, 'sine'), 70);
    },
    hurt() {
      tone(220, 0.14, 0.4, 'sawtooth', 110);
    },
    beep(final) {
      tone(final ? 1400 : 950, final ? 0.3 : 0.09, 0.35, 'sine');
    },
    plant() {
      tone(950, 0.09, 0.35, 'sine');
      setTimeout(() => tone(950, 0.09, 0.35, 'sine'), 180);
    },
    explosion() {
      noise(0.9, 320, 1.0);
      tone(70, 0.8, 0.8, 'sine', 32);
    },
    roundWin() {
      tone(523, 0.14, 0.3, 'sine');
      setTimeout(() => tone(659, 0.14, 0.3, 'sine'), 140);
      setTimeout(() => tone(784, 0.26, 0.3, 'sine'), 280);
    },
    roundLose() {
      tone(392, 0.18, 0.3, 'sine');
      setTimeout(() => tone(311, 0.3, 0.3, 'sine'), 180);
    },
    buy() {
      tone(880, 0.06, 0.25, 'sine');
      setTimeout(() => tone(1174, 0.08, 0.25, 'sine'), 70);
    },
  };
}
