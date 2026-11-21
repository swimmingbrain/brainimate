// sound effects and music beds made in the browser: no files from anywhere else, nothing to license.
// each one is worked out sample by sample, written as a wav and added like an imported sound

export type Sfx = 'whoosh' | 'pop' | 'boom' | 'ding' | 'click' | 'riser' | 'impact' | 'sparkle' | 'buzzer' | 'drumroll';

export const SFX: { id: Sfx; label: string }[] = [
  { id: 'whoosh', label: 'Whoosh' },
  { id: 'pop', label: 'Pop' },
  { id: 'boom', label: 'Boom' },
  { id: 'impact', label: 'Impact' },
  { id: 'ding', label: 'Ding' },
  { id: 'click', label: 'Click' },
  { id: 'riser', label: 'Riser' },
  { id: 'sparkle', label: 'Sparkle' },
  { id: 'buzzer', label: 'Wrong buzzer' },
  { id: 'drumroll', label: 'Drum roll' }
];

export type Mood = 'calm' | 'tense' | 'upbeat' | 'mystery';

export const MOODS: { id: Mood; label: string }[] = [
  { id: 'calm', label: 'Calm' },
  { id: 'upbeat', label: 'Upbeat' },
  { id: 'tense', label: 'Tense' },
  { id: 'mystery', label: 'Mystery' }
];

const RATE = 24000;

// a source of noise that is the same every time
function noise(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a * 1664525 + 1013904223) >>> 0;
    return (a / 4294967296) * 2 - 1;
  };
}

export function sfxSamples(kind: Sfx): Float32Array {
  const len = (s: number) => Math.round(s * RATE);
  const n = noise(7);
  const env = (t: number, attack: number, decay: number) => (t < attack ? t / attack : Math.exp(-(t - attack) / decay));
  let out: Float32Array;
  switch (kind) {
    case 'whoosh': {
      out = new Float32Array(len(0.6));
      let lp = 0;
      for (let i = 0; i < out.length; i++) {
        const t = i / RATE;
        const k = 0.02 + 0.25 * Math.sin((Math.PI * t) / 0.6);
        lp += (n() - lp) * k;
        out[i] = lp * Math.sin((Math.PI * t) / 0.6) * 1.6;
      }
      break;
    }
    case 'pop': {
      out = new Float32Array(len(0.18));
      for (let i = 0; i < out.length; i++) {
        const t = i / RATE;
        const f = 900 * Math.exp(-t * 30) + 180;
        out[i] = Math.sin(2 * Math.PI * f * t) * env(t, 0.002, 0.04);
      }
      break;
    }
    case 'boom': {
      out = new Float32Array(len(1.4));
      let lp = 0;
      for (let i = 0; i < out.length; i++) {
        const t = i / RATE;
        lp += (n() - lp) * 0.06;
        out[i] = (Math.sin(2 * Math.PI * (55 + 40 * Math.exp(-t * 8)) * t) * 0.9 + lp * 1.4) * env(t, 0.005, 0.35);
      }
      break;
    }
    case 'impact': {
      out = new Float32Array(len(0.5));
      for (let i = 0; i < out.length; i++) {
        const t = i / RATE;
        out[i] = (Math.sin(2 * Math.PI * (120 * Math.exp(-t * 12) + 60) * t) + n() * 0.6 * Math.exp(-t * 40)) * env(t, 0.001, 0.09);
      }
      break;
    }
    case 'ding': {
      out = new Float32Array(len(1.2));
      for (let i = 0; i < out.length; i++) {
        const t = i / RATE;
        out[i] = (Math.sin(2 * Math.PI * 1320 * t) + 0.5 * Math.sin(2 * Math.PI * 2640 * t) + 0.25 * Math.sin(2 * Math.PI * 3960 * t)) * 0.45 * env(t, 0.003, 0.3);
      }
      break;
    }
    case 'click': {
      out = new Float32Array(len(0.05));
      for (let i = 0; i < out.length; i++) out[i] = n() * env(i / RATE, 0.0005, 0.006);
      break;
    }
    case 'riser': {
      out = new Float32Array(len(1.6));
      let phase = 0;
      for (let i = 0; i < out.length; i++) {
        const t = i / RATE;
        phase += (2 * Math.PI * (200 + 900 * (t / 1.6) ** 2)) / RATE;
        out[i] = (Math.sin(phase) * 0.5 + n() * 0.25 * (t / 1.6)) * (t / 1.6) * 0.8;
      }
      break;
    }
    case 'sparkle': {
      out = new Float32Array(len(0.9));
      const notes = [1568, 1976, 2349, 3136];
      for (let i = 0; i < out.length; i++) {
        const t = i / RATE;
        let v = 0;
        notes.forEach((f, j) => {
          const s = t - j * 0.09;
          if (s > 0) v += Math.sin(2 * Math.PI * f * s) * env(s, 0.002, 0.12);
        });
        out[i] = v * 0.3;
      }
      break;
    }
    case 'buzzer': {
      out = new Float32Array(len(0.7));
      for (let i = 0; i < out.length; i++) {
        const t = i / RATE;
        const saw = ((t * 110) % 1) * 2 - 1;
        out[i] = saw * 0.45 * (t < 0.6 ? 1 : (0.7 - t) / 0.1);
      }
      break;
    }
    case 'drumroll': {
      out = new Float32Array(len(1.5));
      for (let i = 0; i < out.length; i++) {
        const t = i / RATE;
        const hit = (t * 18) % 1;
        out[i] = n() * Math.exp(-hit * 12) * (0.3 + 0.7 * (t / 1.5)) * 0.6;
      }
      break;
    }
  }
  return out;
}

// a quiet bed of chords under narration, looping over seconds, in a mood
export function musicSamples(mood: Mood, seconds: number): Float32Array {
  const out = new Float32Array(Math.round(Math.max(1, Math.min(180, seconds)) * RATE));
  const chords: Record<Mood, number[][]> = {
    calm: [
      [261.6, 329.6, 392],
      [220, 261.6, 329.6],
      [174.6, 220, 261.6],
      [196, 246.9, 293.7]
    ],
    upbeat: [
      [293.7, 370, 440],
      [246.9, 293.7, 370],
      [196, 246.9, 293.7],
      [220, 277.2, 329.6]
    ],
    tense: [
      [220, 261.6, 311.1],
      [207.7, 246.9, 293.7],
      [220, 261.6, 311.1],
      [233.1, 277.2, 329.6]
    ],
    mystery: [
      [196, 233.1, 293.7],
      [185, 220, 277.2],
      [174.6, 207.7, 261.6],
      [185, 233.1, 277.2]
    ]
  };
  const bar = mood === 'upbeat' ? 1.6 : 2.4;
  const seq = chords[mood];
  for (let i = 0; i < out.length; i++) {
    const t = i / RATE;
    const c = seq[Math.floor(t / bar) % seq.length];
    const local = t % bar;
    const swell = Math.min(1, local / 0.3) * Math.min(1, (bar - local) / 0.3);
    let v = 0;
    for (const f of c) v += Math.sin(2 * Math.PI * f * t) * 0.5 + Math.sin(2 * Math.PI * f * 0.5 * t) * 0.25;
    // a soft pulse for an upbeat bed, a slow throb for a tense one
    const pulse = mood === 'upbeat' ? 0.7 + 0.3 * Math.max(0, Math.sin(2 * Math.PI * t * 2.5)) : mood === 'tense' ? 0.8 + 0.2 * Math.sin(2 * Math.PI * t * 1.2) : 1;
    out[i] = v * 0.09 * swell * pulse;
  }
  // in and out softly
  const fade = Math.min(out.length / 2, RATE);
  for (let i = 0; i < fade; i++) {
    out[i] *= i / fade;
    out[out.length - 1 - i] *= i / fade;
  }
  return out;
}

// samples as a 16 bit mono wav data url
export function wavDataUrl(samples: Float32Array, rate = RATE): string {
  const bytes = new Uint8Array(44 + samples.length * 2);
  const view = new DataView(bytes.buffer);
  const text = (o: number, s: string) => [...s].forEach((ch, i) => view.setUint8(o + i, ch.charCodeAt(0)));
  text(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) view.setInt16(44 + i * 2, Math.max(-1, Math.min(1, samples[i])) * 32767, true);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:audio/wav;base64,${btoa(bin)}`;
}
