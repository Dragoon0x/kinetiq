/**
 * The score, synthesized into the same offline track the components play
 * into — so the music and every captured click share one timeline, sample
 * for sample. Nothing is sampled or downloaded: oscillators, seeded noise,
 * filters and a generated room.
 *
 * Form (112.5 BPM, a beat is 16 frames, a bar 64 — every cut sits on it):
 *   0:00  air, a low D, a held breath; the press; a sub hit on the hard cut
 *   0:05  the five spring notes (cued by the springs shot) over a low pad
 *   0:06.4  the pulse starts: kick, rim, hats — D maj9, B m9, G maj7, A
 *   0:19.2  half time under the agent
 *   0:22.4  four on the floor, sixteenths, a riser into…
 *   0:25.6  the impact: sub, air, one chord left ringing under the wall
 *   0:27.7  the drums stop; the signature (cued by the finale) and a low D
 */
const BEAT = 16 / 30;
const BAR = BEAT * 4;
const PULSE_FROM = 192 / 30;
const IMPACT = 768 / 30;
const CLOSE = 832 / 30;
const END = 30;

/** mulberry32 — the score's only randomness, seeded, so every render matches. */
function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NOTE = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);
const CHORDS: Record<string, number[]> = {
  D: [50, 57, 61, 64, 66], // D maj9
  Bm: [47, 54, 57, 61, 62], // B m9
  G: [43, 50, 54, 59, 61], // G maj7♯11
  A: [45, 52, 59, 61, 66], // A 6/9
};
const ROOT: Record<string, number> = { D: 38, Bm: 35, G: 31, A: 33 };
/** One chord a bar from the pulse's first bar to the impact. */
const PROGRESSION = ["D", "Bm", "G", "A", "D", "Bm", "G", "A", "A"];

export function scoreInto(ctx: OfflineAudioContext): void {
  const random = seeded(1097);
  const noise = ctx.createBuffer(2, ctx.sampleRate * 2, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const data = noise.getChannelData(c);
    for (let i = 0; i < data.length; i++) data[i] = random() * 2 - 1;
  }

  // ── buses ────────────────────────────────────────────────────────────
  const master = ctx.createGain();
  master.gain.value = 0.62;
  const glue = ctx.createDynamicsCompressor();
  glue.threshold.value = -14;
  glue.knee.value = 8;
  glue.ratio.value = 3;
  glue.attack.value = 0.006;
  glue.release.value = 0.2;
  // Nothing under 30 Hz: felt on a big system, mud on everything else.
  const floor = ctx.createBiquadFilter();
  floor.type = "highpass";
  floor.frequency.value = 30;
  floor.Q.value = 0.7;
  master.connect(floor);
  floor.connect(glue);
  glue.connect(ctx.destination);

  const room = ctx.createConvolver();
  room.buffer = impulse(ctx, 2.8, seeded(262));
  const roomLevel = ctx.createGain();
  roomLevel.gain.value = 0.42;
  room.connect(roomLevel);
  roomLevel.connect(master);

  const out = (node: AudioNode, level: number, wet = 0) => {
    const g = ctx.createGain();
    g.gain.value = level;
    node.connect(g);
    g.connect(master);
    if (wet > 0) {
      const w = ctx.createGain();
      w.gain.value = wet;
      node.connect(w);
      w.connect(room);
    }
  };
  const noiseSource = (at: number, duration: number) => {
    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    src.start(at, random() * 1.5);
    src.stop(at + duration);
    return src;
  };
  const envelope = (
    at: number,
    peak: number,
    attack: number,
    decay: number,
  ): GainNode => {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(peak, at + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay);
    return g;
  };

  // ── voices ───────────────────────────────────────────────────────────
  const kick = (at: number, level = 1) => {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(140, at);
    osc.frequency.exponentialRampToValueAtTime(44, at + 0.11);
    const g = envelope(at, 0.7 * level, 0.002, 0.38);
    osc.connect(g);
    out(g, 1);
    osc.start(at);
    osc.stop(at + 0.5);
    const click = noiseSource(at, 0.02);
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 3200;
    const cg = envelope(at, 0.12 * level, 0.001, 0.012);
    click.connect(hp);
    hp.connect(cg);
    out(cg, 1);
  };
  const hat = (at: number, level = 1, open = false) => {
    const src = noiseSource(at, open ? 0.3 : 0.06);
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 8200;
    const bp = ctx.createBiquadFilter();
    bp.type = "peaking";
    bp.frequency.value = 11000;
    bp.gain.value = 5;
    const g = envelope(at, 0.16 * level, 0.001, open ? 0.24 : 0.035);
    src.connect(hp);
    hp.connect(bp);
    bp.connect(g);
    out(g, 1, 0.05);
  };
  const rim = (at: number, level = 1) => {
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = 1760;
    const g = envelope(at, 0.16 * level, 0.001, 0.035);
    osc.connect(g);
    out(g, 1, 0.2);
    osc.start(at);
    osc.stop(at + 0.06);
    const src = noiseSource(at, 0.05);
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 2400;
    bp.Q.value = 3;
    const ng = envelope(at, 0.2 * level, 0.001, 0.03);
    src.connect(bp);
    bp.connect(ng);
    out(ng, 1, 0.25);
  };
  const clap = (at: number, level = 1) => {
    for (let k = 0; k < 3; k++) {
      const t0 = at + k * 0.011;
      const src = noiseSource(t0, 0.2);
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 1500;
      bp.Q.value = 1.2;
      const g = envelope(
        t0,
        (k === 2 ? 0.34 : 0.22) * level,
        0.001,
        k === 2 ? 0.16 : 0.012,
      );
      src.connect(bp);
      bp.connect(g);
      out(g, 1, 0.35);
    }
  };
  const bass = (at: number, duration: number, midi: number, level = 1) => {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = NOTE(midi);
    const sub = ctx.createOscillator();
    sub.type = "triangle";
    sub.frequency.value = NOTE(midi + 12);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 420;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(0.17 * level, at + 0.012);
    g.gain.setTargetAtTime(0.1 * level, at + 0.05, 0.2);
    g.gain.setTargetAtTime(0, at + duration - 0.06, 0.03);
    const sg = ctx.createGain();
    sg.gain.value = 0.18;
    osc.connect(lp);
    sub.connect(sg);
    sg.connect(lp);
    lp.connect(g);
    out(g, 1);
    osc.start(at);
    sub.start(at);
    osc.stop(at + duration + 0.2);
    sub.stop(at + duration + 0.2);
  };
  const pad = (
    at: number,
    duration: number,
    notes: number[],
    level: number,
    cutoff = 1400,
  ) => {
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.Q.value = 0.4;
    lp.frequency.setValueAtTime(cutoff * 0.45, at);
    lp.frequency.linearRampToValueAtTime(cutoff, at + duration * 0.6);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(level, at + Math.min(0.5, duration * 0.3));
    g.gain.setValueAtTime(level, at + duration - 0.35);
    g.gain.linearRampToValueAtTime(0, at + duration + 0.45);
    lp.connect(g);
    out(g, 1, 0.55);
    for (const midi of notes) {
      for (const cents of [-7, 6]) {
        const osc = ctx.createOscillator();
        osc.type = "sawtooth";
        osc.frequency.value = NOTE(midi);
        osc.detune.value = cents;
        const v = ctx.createGain();
        v.gain.value = 0.045;
        osc.connect(v);
        v.connect(lp);
        osc.start(at);
        osc.stop(at + duration + 0.6);
      }
    }
  };
  const sweep = (
    from: number,
    to: number,
    lowHz: number,
    highHz: number,
    level: number,
    wet = 0.3,
  ) => {
    const src = noiseSource(from, to - from + 0.1);
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.Q.value = 1.4;
    bp.frequency.setValueAtTime(lowHz, from);
    bp.frequency.exponentialRampToValueAtTime(highHz, to);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, from);
    g.gain.exponentialRampToValueAtTime(level, to - 0.02);
    g.gain.linearRampToValueAtTime(0, to + 0.06);
    src.connect(bp);
    bp.connect(g);
    out(g, 1, wet);
  };
  const tone = (
    at: number,
    duration: number,
    hz: number,
    level: number,
    type: OscillatorType = "sine",
    wet = 0,
  ) => {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = hz;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(level, at + Math.min(0.6, duration * 0.4));
    g.gain.setValueAtTime(level, at + duration * 0.7);
    g.gain.linearRampToValueAtTime(0, at + duration);
    osc.connect(g);
    out(g, 1, wet);
    osc.start(at);
    osc.stop(at + duration + 0.05);
    return osc;
  };
  const hit = (at: number, level: number, from = 62, to = 30, tail = 0.9) => {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(from, at);
    osc.frequency.exponentialRampToValueAtTime(to, at + tail * 0.8);
    const g = envelope(at, level, 0.004, tail);
    osc.connect(g);
    out(g, 1, 0.2);
    osc.start(at);
    osc.stop(at + tail + 0.1);
    const src = noiseSource(at, 0.4);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(5000, at);
    lp.frequency.exponentialRampToValueAtTime(180, at + 0.35);
    const ng = envelope(at, level * 0.32, 0.002, 0.3);
    src.connect(lp);
    lp.connect(ng);
    out(ng, 1, 0.6);
  };

  // ── 0:00 the hook ───────────────────────────────────────────────────
  // Air: the room before anything moves.
  {
    const src = noiseSource(0, 4.6);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 520;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, 0);
    g.gain.linearRampToValueAtTime(0.05, 0.4);
    g.gain.setValueAtTime(0.05, 3.6);
    g.gain.linearRampToValueAtTime(0, 4.6);
    src.connect(lp);
    lp.connect(g);
    out(g, 1);
  }
  // A low D held under the stillness, a breath drawn as the press comes.
  tone(0, 4.4, NOTE(26), 0.06);
  tone(0, 4.4, NOTE(38), 0.035);
  tone(0.15, 0.6, NOTE(86), 0.012, "sine", 0.5);
  tone(0.25, 0.5, NOTE(93), 0.008, "sine", 0.5);
  sweep(0.32, 0.7, 300, 2600, 0.05, 0.4);
  // The hard cut on the pinch.
  hit(33 / 30, 0.7, 70, 34, 0.9);
  // The pull-back: air moving out.
  sweep(62 / 30, 62 / 30 + 0.55, 3200, 380, 0.05, 0.5);

  // ── 0:04.3 the springs: a low bed for the five notes ────────────────
  pad(128 / 30, PULSE_FROM - 128 / 30 + 0.2, [38, 45, 50], 0.5, 700);

  // ── 0:06.4 → 0:25.6 the pulse ───────────────────────────────────────
  PROGRESSION.forEach((name, bar) => {
    const at = PULSE_FROM + bar * BAR;
    const chord = CHORDS[name] ?? [];
    const halfTime = at >= 19.2 - 0.01 && at < 21.33 - 0.01;
    const build = at >= 21.33 - 0.01;
    pad(at, BAR, chord, build ? 0.36 : 0.3, build ? 2200 : 1500);
    const root = ROOT[name] ?? 38;
    if (!halfTime) {
      bass(at, BEAT * 1.5, root, 0.9);
      bass(at + BEAT * 2, BEAT * 0.75, root, 0.7);
      bass(at + BEAT * 3, BEAT * 0.5, root + 12, 0.5);
    } else {
      bass(at, BEAT * 3.5, root, 0.8);
    }
    for (let b = 0; b < 4; b++) {
      const beatAt = at + b * BEAT;
      const montage = beatAt >= 672 / 30 - 0.01;
      const first = bar === 0;
      // Kick: one, and three, and four on the floor once the montage runs.
      if (montage || b === 0 || (b === 2 && !halfTime && !first)) {
        kick(beatAt, first ? 0.75 : 1);
      }
      // Backbeat: rim on two and four, a clap on three in half time.
      if (halfTime && b === 2) clap(beatAt, 0.8);
      if (!halfTime && (b === 1 || b === 3)) {
        if (montage) clap(beatAt, 0.85);
        else rim(beatAt, first ? 0.6 : 0.85);
      }
      // Hats: off-beat eighths, sixteenths in the build.
      if (montage) {
        for (let s = 0; s < 4; s++) {
          hat(
            beatAt + (s * BEAT) / 4,
            s % 2 === 0 ? 0.55 : 0.85,
            s === 2 && b === 3,
          );
        }
      } else if (!halfTime) {
        hat(beatAt + BEAT / 2, first ? 0.5 : 0.75);
        if (bar >= 2) hat(beatAt + (BEAT * 3) / 4, 0.35);
      } else if (b === 1 || b === 3) {
        hat(beatAt + BEAT / 2, 0.45);
      }
    }
  });
  // The last half bar before the impact: a roll that doubles.
  for (let k = 0; k < 16; k++) {
    const at = IMPACT - BEAT * 2 + (k * BEAT * 2) / 16;
    rim(at, 0.25 + (k / 16) * 0.7);
  }
  // The riser, under the whole montage.
  sweep(672 / 30, IMPACT, 260, 7800, 0.22, 0.4);
  {
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(NOTE(57), 672 / 30);
    osc.frequency.exponentialRampToValueAtTime(NOTE(81), IMPACT);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, 672 / 30);
    g.gain.linearRampToValueAtTime(0.045, IMPACT - 0.05);
    g.gain.linearRampToValueAtTime(0, IMPACT + 0.02);
    osc.connect(g);
    out(g, 1, 0.3);
    osc.start(672 / 30);
    osc.stop(IMPACT + 0.1);
  }

  // ── 0:25.6 the impact ───────────────────────────────────────────────
  hit(IMPACT, 0.8, 58, 30, 1.5);
  kick(IMPACT, 1);
  {
    // Air rushing out after the hit.
    const src = noiseSource(IMPACT, 2.4);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(9000, IMPACT);
    lp.frequency.exponentialRampToValueAtTime(300, IMPACT + 2.2);
    const g = envelope(IMPACT, 0.14, 0.004, 2.2);
    src.connect(lp);
    lp.connect(g);
    out(g, 1, 0.5);
  }
  pad(IMPACT, CLOSE - IMPACT + 0.5, [...(CHORDS.D ?? []), 69], 0.42, 2600);
  bass(IMPACT, CLOSE - IMPACT, 38, 0.9);

  // ── 0:27.7 the close ────────────────────────────────────────────────
  pad(CLOSE, END - CLOSE + 0.4, [50, 57, 62, 66], 0.26, 900);
  tone(CLOSE, END - CLOSE + 0.6, NOTE(38), 0.045);
}

/** A generated room: decaying seeded noise with a few early reflections. */
function impulse(ctx: BaseAudioContext, seconds: number, random: () => number) {
  const length = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < length; i++) {
      const t = i / ctx.sampleRate;
      data[i] =
        (random() * 2 - 1) * Math.pow(1 - i / length, 2.2) * Math.exp(-t * 1.4);
    }
    for (const [delay, gain] of [
      [0.011, 0.5],
      [0.019, 0.35],
      [0.031, 0.28],
    ] as const) {
      const at = Math.floor((delay + c * 0.003) * ctx.sampleRate);
      if (at < length) data[at] = (data[at] ?? 0) + gain;
    }
  }
  return buffer;
}
