/** Synthesised sounds: no audio files, nothing to download. */

let ctx: AudioContext | null = null;

/** Must be called from a user gesture (click / Enter VR) to unlock audio. */
export function unlockAudio() {
  ctx ??= new AudioContext();
  if (ctx.state === 'suspended') void ctx.resume();
}

function tone(freq: number, start: number, dur: number, gain: number, type: OscillatorType = 'sine') {
  if (!ctx) return;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.frequency.value = freq;
  const t = ctx.currentTime + start;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(ctx.destination);
  o.start(t);
  o.stop(t + dur + 0.05);
}

export type Sound = 'light' | 'relight' | 'miss' | 'tick' | 'record' | 'snap';

export function play(s: Sound) {
  if (!ctx) return;
  switch (s) {
    case 'light':
      tone(523.25, 0, 1.2, 0.18);
      tone(783.99, 0.08, 1.4, 0.12);
      break;
    case 'relight':
      // Warm major arpeggio with a soft shimmer: the core reward.
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, i * 0.07, 1.6, 0.14));
      tone(2093, 0.3, 1.0, 0.03, 'triangle');
      break;
    case 'miss':
      tone(329.63, 0, 0.6, 0.1, 'triangle');
      tone(293.66, 0.15, 0.8, 0.08, 'triangle');
      break;
    case 'tick':
      tone(880, 0, 0.12, 0.08);
      break;
    case 'record':
      tone(660, 0, 0.25, 0.1);
      break;
    case 'snap':
      tone(440, 0, 0.15, 0.05, 'triangle');
      break;
  }
}

/**
 * Recall Rush's music: a soft pentatonic arpeggio over a low pulse, one step per call. `level` (0..4, from the
 * combo) brightens it: more voices, higher notes. The caller sets the tempo by how often it calls.
 */
const PENTA = [261.63, 293.66, 329.63, 392, 440, 523.25, 587.33, 659.25];
export function beat(step: number, level: number) {
  if (!ctx) return;
  if (step % 4 === 0) tone(65.41 * (level >= 3 ? 1.5 : 1), 0, 0.35, 0.09, 'triangle');
  const note = PENTA[(step * 3 + level) % PENTA.length] * (level >= 2 ? 2 : 1);
  tone(note, 0, 0.22, 0.045 + 0.01 * level);
  if (level >= 1 && step % 2 === 1) tone(note * 1.5, 0.06, 0.16, 0.025);
  if (level >= 4) tone(note * 2, 0.11, 0.12, 0.02, 'triangle');
}
