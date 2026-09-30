"use client";

import * as React from "react";

import {
  animate,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { project, rubberClamp, useDrag } from "@/registry/lib/tactile-gesture";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type ClipTrimValue = { start: number; end: number };
export type ClipTrimHandle = "frame" | "bar" | "tab";

export type ClipTrimProps = {
  /** Controlled kept span, in seconds from the clip's start. */
  value?: ClipTrimValue;
  /** Initial kept span when uncontrolled. @default the whole clip */
  defaultValue?: ClipTrimValue;
  /** Fires from the drag or key that changed the span, with the new one. */
  onValueChange?: (value: ClipTrimValue) => void;
  /** The clip's length, in seconds. @default 12 */
  duration?: number;
  /** The clip's tempo: the beat grid, the beat snaps and the waveform's pulse. @default 120 */
  bpm?: number;
  /** Seeds the procedural waveform: the same seed draws the same clip. @default 7 */
  seed?: number;
  /** The clip's name; the three sliders are named after it. @default "Clip" */
  label?: string;
  /** The span's resolution when not snapping to beats, and one arrow key's move. @default 0.1 */
  step?: number;
  /** A time as printed under the strip. @default "0:02.5" */
  format?: (seconds: number) => string;
  /** Fires when the preview starts and when it stops. */
  onPreviewChange?: (playing: boolean) => void;
  /** The shortest the kept span can be, in seconds. @default 1 */
  minLength?: number;
  /** Handles and window move in beats, over a drawn beat grid. @default true */
  snapBeats?: boolean;
  /** How the handles are drawn. @default "frame" */
  handle?: ClipTrimHandle;
  /** The waveform's resolution, in bars per second. @default 5 */
  density?: number;
  /** A tick when a handle is grabbed or finds a beat, a blip per beat of the preview. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

type Part = "start" | "end" | "window";

const STRIP_H = 72;
/** Release speed a handle keeps to itself before it counts as a throw, px/s. */
const DEAD_ZONE = 300;
/** How far, in px, a handle gives past a limit at most. */
const GIVE = 24;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const r3 = (v: number) => Number(v.toFixed(3));
const trim = (v: number) => String(Number(v.toFixed(2)));
const pct = (v: number, of: number) => `${r3((v / of) * 100)}%`;
const seconds = (v: number) => {
  const t = trim(v);
  return `${t} ${t === "1" ? "second" : "seconds"}`;
};

/** m:ss.s, counted in tenths so 59.96 never prints as 0:60.0. */
const clock = (t: number) => {
  const tenths = Math.max(0, Math.round(t * 10));
  const m = Math.floor(tenths / 600);
  const rem = tenths - m * 600;
  return `${m}:${String(Math.floor(rem / 10)).padStart(2, "0")}.${rem % 10}`;
};

/**
 * The clip's loudness, one bar per `1 / density` seconds: a kick on every
 * beat, harder on the downbeat, over a phrase-long swell, with a little seeded
 * noise. Deterministic, and rounded, so the server and the browser agree.
 */
function peaksOf(
  seed: number,
  duration: number,
  bpm: number,
  density: number,
): number[] {
  const bars = clamp(Math.round(duration * density), 8, 480);
  let state = (Math.imul(seed | 0, 2654435761) ^ 0x5bd1e995) >>> 0 || 1;
  const rand = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
  const beat = 60 / bpm;
  const out: number[] = [];
  for (let i = 0; i < bars; i += 1) {
    let peak = 0;
    for (let k = 0; k < 4; k += 1) {
      const t = ((i + k / 4) / bars) * duration;
      const b = t / beat;
      const phase = b - Math.floor(b);
      const kick = Math.exp(-phase * 6) * (Math.floor(b) % 4 === 0 ? 1 : 0.7);
      const swell = 0.55 + 0.45 * Math.sin(Math.PI * clamp(t / duration, 0, 1));
      peak = Math.max(peak, swell * (0.16 + 0.62 * kick + 0.22 * rand()));
    }
    out.push(Number(clamp(peak, 0.06, 1).toFixed(2)));
  }
  return out;
}

type Held = {
  part: Part;
  /** Seconds per screen px, from the strip's width when the drag began. */
  scale: number;
  s0: number;
  e0: number;
  /** Where the span was when the drag began, for Escape. */
  from: ClipTrimValue;
  /** The beat (or step) the dragged edge last landed on. */
  landed: number;
  /** Where the finger puts the dragged edge, before snaps and limits. */
  raw: number;
};

type Api = {
  sync: () => void;
  abort: () => void;
  crossed: (from: number, to: number) => void;
  endPreview: () => void;
  interrupt: () => void;
  teardown: () => void;
};

/**
 * A trimmer over a procedural waveform. Two handles mark the kept part of a
 * clip and everything outside them dims. A handle follows the finger 1:1,
 * rubber-bands against the clip's ends and against the other handle once the
 * kept part is `minLength` long, and springs back from there with its release
 * velocity; the middle slides the whole window, and a flick throws it. With
 * `snapBeats` the clip's beat grid is drawn and every beat is a detent the
 * handle jumps to with a tick. The readout under the strip — in point, kept
 * length, out point — runs from the same motion values, frame by frame.
 *
 * Space (or a tap on the middle) previews the kept part: a playhead runs from
 * the start to the end in real time on a linear tween and blips on each beat
 * it crosses. Three real sliders — start, kept part, end — with arrow, Page,
 * Home and End keys; Space previews, Escape stops. Under reduced motion snaps
 * and spring-backs land in one frame and the playhead still runs, because it
 * is progress.
 */
export function ClipTrim({
  value,
  defaultValue,
  onValueChange,
  duration = 12,
  bpm = 120,
  seed = 7,
  label = "Clip",
  step = 0.1,
  format,
  onPreviewChange,
  minLength = 1,
  snapBeats = true,
  handle = "frame",
  density = 5,
  sound = false,
  disabled = false,
  className,
}: ClipTrimProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const clipId = `clip-kept-${uid}`;
  const hintId = `clip-hint-${uid}`;

  const total = Math.max(0.5, duration);
  const beat = 60 / clamp(bpm, 20, 400);
  const unit = step > 0 ? step : 0.1;
  const shortest = clamp(minLength, 0, total);
  const say = format ?? clock;

  const quantT = (v: number) =>
    r3(clamp(Math.round(v / unit) * unit, 0, total));
  const norm = (v: ClipTrimValue): ClipTrimValue => {
    let s = clamp(v.start, 0, total);
    let e = clamp(v.end, 0, total);
    if (e < s) [s, e] = [e, s];
    if (e - s < shortest) {
      e = Math.min(total, s + shortest);
      s = Math.max(0, e - shortest);
    }
    return { start: r3(s), end: r3(e) };
  };

  const [own, setOwn] = React.useState<ClipTrimValue>(
    () => defaultValue ?? { start: 0, end: total },
  );
  const shown = norm(value ?? own);
  const [check, setCheck] = React.useState(0);
  const [pressed, setPressed] = React.useState<Part | null>(null);
  const [said, setSaid] = React.useState("");

  const peaks = React.useMemo(
    () => peaksOf(seed, total, bpm, density),
    [seed, total, bpm, density],
  );
  const bars = peaks.length;

  const start = useMotionValue(shown.start);
  const end = useMotionValue(shown.end);
  const play = useMotionValue(shown.start);
  const playOn = useMotionValue(0);

  const [strip, setStrip] = React.useState<HTMLDivElement | null>(null);
  // One running animation per edge: a key on one grip never freezes the
  // other grip's spring mid-flight.
  const anims = React.useRef(
    new Map<MotionValue<number>, AnimationPlaybackControls>(),
  );
  const playAnim = React.useRef<AnimationPlaybackControls | null>(null);
  const fadeAnim = React.useRef<AnimationPlaybackControls | null>(null);
  const playing = React.useRef(false);
  const held = React.useRef<Held | null>(null);
  const goal = React.useRef<ClipTrimValue>(shown);
  const reported = React.useRef(`${shown.start}:${shown.end}`);
  const detach = React.useRef<(() => void) | null>(null);
  const bridge = React.useRef<(() => void) | null>(null);
  const api = React.useRef<Api | null>(null);

  const halt = () => {
    for (const c of anims.current.values()) c.stop();
    anims.current.clear();
  };
  const hold = (mv: MotionValue<number>) => {
    anims.current.get(mv)?.stop();
    anims.current.delete(mv);
  };

  const moveTo = (
    mv: MotionValue<number>,
    to: number,
    kind: "flick" | "glide" | "snap",
    velocity?: number,
  ) => {
    hold(mv);
    if (!motionSafe) {
      mv.set(to);
      return;
    }
    anims.current.set(
      mv,
      animate(mv, to, {
        ...springs[kind],
        velocity: velocity ?? mv.getVelocity(),
      }),
    );
  };

  const panAt = (t: number) =>
    strip
      ? panFrom(
          strip.getBoundingClientRect().left +
            (t / total) * strip.getBoundingClientRect().width,
          strip,
        )
      : 0;

  const tick = (t: number, gain: number) => {
    audio.play("tick", {
      pitch: r3(0.8 + 0.5 * clamp(t / total, 0, 1)),
      gain,
      pan: panAt(t),
    });
  };

  const ampAt = (t: number) =>
    peaks[clamp(Math.floor((t / total) * bars), 0, bars - 1)] ?? 0.5;

  /** The nearest beat inside [lo, hi], or the nearest step when not snapping. */
  const snapTo = (raw: number, lo: number, hi: number) => {
    const inside = clamp(raw, lo, hi);
    if (!snapBeats) return quantT(inside);
    let b = Math.round(inside / beat) * beat;
    if (b > hi + 1e-6) b = Math.floor(hi / beat + 1e-6) * beat;
    if (b < lo - 1e-6) b = Math.ceil(lo / beat - 1e-6) * beat;
    if (b < lo - 1e-6 || b > hi + 1e-6) return quantT(inside);
    return r3(b);
  };

  const report = (next: ClipTrimValue) => {
    const key = `${next.start}:${next.end}`;
    if (key === reported.current) return;
    reported.current = key;
    if (value === undefined) setOwn(next);
    onValueChange?.(next);
  };

  const commit = (next: ClipTrimValue) => {
    goal.current = next;
    report(next);
    // A controlled host answers in this same batch; the sync after it
    // leaves a taken span alone and glides a refused one back.
    setCheck((c) => c + 1);
  };

  const stopPreview = (announce = true) => {
    if (!playing.current) return;
    playing.current = false;
    playAnim.current?.stop();
    playAnim.current = null;
    fadeAnim.current?.stop();
    fadeAnim.current = animate(playOn, 0, {
      duration: durations.fast,
      ease: easings.exit,
    });
    if (announce) setSaid("Preview stopped");
    onPreviewChange?.(false);
  };

  const startPreview = () => {
    const { start: s, end: e } = goal.current;
    if (e - s <= 0) return;
    playing.current = true;
    playAnim.current?.stop();
    fadeAnim.current?.stop();
    play.set(s);
    playOn.set(1);
    audio.play("plip", { pitch: 1.25, gain: 0.45, pan: panAt(s) });
    playAnim.current = animate(play, e, {
      duration: e - s,
      ease: "linear",
      onComplete: () => api.current?.endPreview(),
    });
    setSaid(`Previewing ${seconds(r3(e - s))}`);
    onPreviewChange?.(true);
  };

  const togglePreview = () => {
    if (disabled) return;
    if (playing.current) stopPreview();
    else startPreview();
  };

  /** The edges a drag or key may reach, from where the span rests. */
  const limits = (part: Part, s: number, e: number) =>
    part === "start"
      ? { lo: 0, hi: Math.max(0, e - shortest) }
      : part === "end"
        ? { lo: Math.min(total, s + shortest), hi: total }
        : { lo: 0, hi: Math.max(0, total - (e - s)) };

  const finish = () => {
    held.current = null;
    detach.current?.();
    detach.current = null;
    setPressed(null);
  };

  const begin = (part: Part) => {
    if (!strip) return;
    const rect = strip.getBoundingClientRect();
    if (rect.width <= 0) return;
    stopPreview();
    // The dragged edge starts where it is drawn; the edge left alone is
    // counted where it is heading.
    if (part !== "end") hold(start);
    if (part !== "start") hold(end);
    const s0 = part === "end" ? goal.current.start : start.get();
    const e0 = part === "start" ? goal.current.end : end.get();
    held.current = {
      part,
      scale: total / rect.width,
      s0,
      e0,
      from: goal.current,
      landed: part === "end" ? e0 : s0,
      raw: part === "end" ? e0 : s0,
    };
    setPressed(part);
    tick(part === "end" ? e0 : s0, 0.45);
    // Escape puts the span back; it is claimed so the stage stays open.
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !held.current) return;
      event.preventDefault();
      api.current?.abort();
    };
    document.addEventListener("keydown", onKey);
    detach.current = () => document.removeEventListener("keydown", onKey);
  };

  const follow = (dx: number) => {
    const h = held.current;
    if (!h) return;
    const give = GIVE * h.scale;
    const len = h.e0 - h.s0;
    const { lo, hi } = limits(h.part, h.s0, h.e0);
    const raw = (h.part === "end" ? h.e0 : h.s0) + dx * h.scale;
    const edge = h.part === "end" ? end : start;
    h.raw = raw;
    let at: number;
    if (raw < lo || raw > hi) {
      hold(edge);
      if (h.part === "window") hold(end);
      at = r3(rubberClamp(raw, lo, hi, give));
      edge.set(at);
      if (h.part === "window") end.set(r3(at + len));
      at = clamp(at, lo, hi);
    } else if (snapBeats) {
      at = snapTo(raw, lo, hi);
      if (at !== h.landed) {
        moveTo(edge, at, "flick");
        if (h.part === "window") moveTo(end, r3(at + len), "flick");
        tick(at, 0.28);
      }
    } else {
      hold(edge);
      if (h.part === "window") hold(end);
      edge.set(r3(raw));
      if (h.part === "window") end.set(r3(raw + len));
      at = quantT(raw);
    }
    h.landed = at;
    report(
      h.part === "start"
        ? { start: at, end: goal.current.end }
        : h.part === "end"
          ? { start: goal.current.start, end: at }
          : { start: at, end: r3(at + len) },
    );
  };

  const settle = (vx: number) => {
    const h = held.current;
    if (!h) return;
    finish();
    const len = h.e0 - h.s0;
    const { lo, hi } = limits(h.part, h.s0, h.e0);
    const edge = h.part === "end" ? end : start;
    const outside = h.raw < lo - 1e-6 || h.raw > hi + 1e-6;
    // A slow release lands where the finger lifted — not where a beat's
    // spring has got to — and only speed past the dead zone is a throw,
    // carried on a heavy surface.
    const thrown = Math.sign(vx) * Math.max(0, Math.abs(vx) - DEAD_ZONE);
    const dest = snapTo(
      clamp(h.raw, lo, hi) + project(0, thrown, 0.99) * h.scale,
      lo,
      hi,
    );
    const velocity = vx * h.scale;
    const kind = outside ? "snap" : thrown !== 0 ? "glide" : "flick";
    moveTo(edge, dest, kind, outside || thrown !== 0 ? velocity : undefined);
    if (h.part === "window") {
      moveTo(
        end,
        r3(dest + len),
        kind,
        outside || thrown !== 0 ? velocity : undefined,
      );
    }
    commit(
      h.part === "start"
        ? { start: dest, end: goal.current.end }
        : h.part === "end"
          ? { start: goal.current.start, end: dest }
          : { start: dest, end: r3(dest + len) },
    );
  };

  const abort = () => {
    const h = held.current;
    if (!h) return;
    finish();
    moveTo(start, h.from.start, "glide");
    moveTo(end, h.from.end, "glide");
    commit(h.from);
  };

  const startDrag = useDrag({
    axis: "x",
    threshold: 3,
    disabled,
    onStart: () => begin("start"),
    onMove: ({ offset }) => follow(offset.x),
    onEnd: ({ velocity }) => settle(velocity.x),
    onCancel: () => settle(0),
  });
  const endDrag = useDrag({
    axis: "x",
    threshold: 3,
    disabled,
    onStart: () => begin("end"),
    onMove: ({ offset }) => follow(offset.x),
    onEnd: ({ velocity }) => settle(velocity.x),
    onCancel: () => settle(0),
  });
  const windowDrag = useDrag({
    axis: "x",
    threshold: 3,
    disabled,
    onStart: () => begin("window"),
    onMove: ({ offset }) => follow(offset.x),
    onEnd: ({ velocity }) => settle(velocity.x),
    onCancel: () => settle(0),
    onTap: () => togglePreview(),
  });

  /**
   * A grip is narrow. A quick first mouse move can leave it before the drag
   * has travelled far enough to capture the pointer, and then the grip never
   * hears the move. Until the capture, moves and the release that land
   * elsewhere are passed on, so the drag still starts. Touch captures by
   * itself and needs none of this.
   */
  const press = (
    event: React.PointerEvent,
    drag: ReturnType<typeof useDrag>,
  ) => {
    drag.onPointerDown(event);
    bridge.current?.();
    if (event.pointerType === "touch") return;
    const el = event.currentTarget;
    const id = event.pointerId;
    const off = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      bridge.current = null;
    };
    const elsewhere = (e: PointerEvent) =>
      !(e.target instanceof Node && el.contains(e.target));
    const move = (e: PointerEvent) => {
      if (e.pointerId !== id) return;
      if (el.hasPointerCapture(id)) {
        off();
        return;
      }
      if (elsewhere(e)) drag.onPointerMove(e as unknown as React.PointerEvent);
    };
    const up = (e: PointerEvent) => {
      if (e.pointerId !== id) return;
      if (elsewhere(e) && !el.hasPointerCapture(id)) {
        if (e.type === "pointercancel") {
          drag.onPointerCancel(e as unknown as React.PointerEvent);
        } else {
          drag.onPointerUp(e as unknown as React.PointerEvent);
        }
      }
      off();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    bridge.current = off;
  };

  const bump = (part: Part, dir: number) => {
    if (!motionSafe) return;
    const edge = part === "end" ? end : start;
    const rest = part === "end" ? goal.current.end : goal.current.start;
    moveTo(edge, rest, "snap", dir * total * 0.12);
    if (part === "window") {
      moveTo(end, goal.current.end, "snap", dir * total * 0.12);
    }
  };

  const onKeyDown = (part: Part, event: React.KeyboardEvent) => {
    if (disabled || held.current) return;
    if (event.key === " ") {
      event.preventDefault();
      togglePreview();
      return;
    }
    if (event.key === "Escape") {
      if (playing.current) {
        event.preventDefault();
        stopPreview();
      }
      return;
    }
    if (event.altKey || event.metaKey || event.ctrlKey) return;
    const small = snapBeats ? beat : unit;
    const big = snapBeats ? beat * 4 : 1;
    const { start: s, end: e } = goal.current;
    const len = e - s;
    const { lo, hi } = limits(part, s, e);
    const from = part === "end" ? e : s;
    let to: number;
    switch (event.key) {
      case "ArrowLeft":
      case "ArrowDown":
        to = from - small;
        break;
      case "ArrowRight":
      case "ArrowUp":
        to = from + small;
        break;
      case "PageDown":
        to = from - big;
        break;
      case "PageUp":
        to = from + big;
        break;
      case "Home":
        to = lo;
        break;
      case "End":
        to = hi;
        break;
      default:
        return;
    }
    event.preventDefault();
    const dir = Math.sign(to - from);
    const at = snapTo(to, lo, hi);
    if (at === from || Math.sign(at - from) !== dir) {
      bump(part, dir);
      return;
    }
    stopPreview();
    const kind = Math.abs(at - from) > big ? "glide" : "flick";
    moveTo(part === "end" ? end : start, at, kind);
    if (part === "window") moveTo(end, r3(at + len), kind);
    tick(at, 0.45);
    commit(
      part === "start"
        ? { start: at, end: e }
        : part === "end"
          ? { start: s, end: at }
          : { start: at, end: r3(at + len) },
    );
  };

  React.useEffect(() => {
    api.current = {
      // The host's span is where the handles rest; a drag is never
      // interrupted by the echo of its own reports.
      sync: () => {
        if (held.current) return;
        reported.current = `${shown.start}:${shown.end}`;
        const g = goal.current;
        if (g.start === shown.start && g.end === shown.end) return;
        goal.current = shown;
        stopPreview(false);
        halt();
        moveTo(start, shown.start, "glide");
        moveTo(end, shown.end, "glide");
      },
      abort,
      crossed: (a, b) => {
        const first = Math.floor(a / beat) + 1;
        for (let k = first; k * beat <= b + 1e-6; k += 1) {
          const t = k * beat;
          if (t <= goal.current.start + 1e-3) continue;
          const amp = ampAt(t);
          audio.play("plip", {
            pitch: r3(0.8 + 0.6 * amp),
            gain: r3(0.25 + 0.3 * amp),
            pan: panAt(t),
          });
        }
      },
      endPreview: () => {
        if (!playing.current) return;
        stopPreview(false);
        setSaid("Preview finished");
      },
      interrupt: () => {
        stopPreview(false);
        if (held.current) settle(0);
      },
      teardown: () => {
        detach.current?.();
        detach.current = null;
        bridge.current?.();
        // Finished, not frozen: a re-run in development must not leave a
        // grip stopped halfway. The preview is playback, and just stops.
        for (const c of anims.current.values()) c.complete();
        anims.current.clear();
        playAnim.current?.stop();
        fadeAnim.current?.stop();
        if (playing.current) {
          playing.current = false;
          onPreviewChange?.(false);
        }
      },
    };
  });

  React.useEffect(() => {
    api.current?.sync();
  }, [shown.start, shown.end, check]);

  // Each beat the playhead crosses blips on the frame it crosses it.
  React.useEffect(() => {
    let prev = play.get();
    return play.on("change", (t) => {
      if (playing.current && t > prev) api.current?.crossed(prev, t);
      prev = t;
    });
  }, [play]);

  React.useEffect(() => {
    const interrupted = () => api.current?.interrupt();
    const onVisibility = () => {
      if (document.hidden) interrupted();
    };
    window.addEventListener("blur", interrupted);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("blur", interrupted);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  React.useEffect(() => {
    if (disabled) api.current?.interrupt();
  }, [disabled]);

  React.useEffect(() => () => api.current?.teardown(), []);

  const startPct = useTransform(start, (s) => pct(clamp(s, 0, total), total));
  const endPct = useTransform(end, (e) => pct(clamp(e, 0, total), total));
  const lenPct = useTransform(
    [start, end] as MotionValue<number>[],
    ([s = 0, e = 0]: number[]) =>
      pct(Math.max(0, clamp(e, 0, total) - clamp(s, 0, total)), total),
  );
  const clipX = useTransform(start, (s) =>
    r3((clamp(s, 0, total) / total) * bars),
  );
  const clipW = useTransform(
    [start, end] as MotionValue<number>[],
    ([s = 0, e = 0]: number[]) =>
      r3((Math.max(0, clamp(e, 0, total) - clamp(s, 0, total)) / total) * bars),
  );
  const playPct = useTransform(play, (t) => pct(clamp(t, 0, total), total));
  const inText = useTransform(start, (s) => say(clamp(s, 0, total)));
  const outText = useTransform(end, (e) => say(clamp(e, 0, total)));
  const lenText = useTransform(
    [start, end] as MotionValue<number>[],
    ([s = 0, e = 0]: number[]) =>
      `${trim(Math.max(0, clamp(e, 0, total) - clamp(s, 0, total)))} s kept`,
  );

  const len = r3(shown.end - shown.start);
  const beats = snapBeats
    ? Array.from({ length: Math.floor(total / beat + 1e-6) + 1 }, (_, k) => k)
    : [];
  const startLimits = limits("start", shown.start, shown.end);
  const endLimits = limits("end", shown.start, shown.end);
  const windowLimits = limits("window", shown.start, shown.end);

  return (
    <div
      className={cn(
        "flex w-full flex-col gap-2 select-none",
        disabled && "opacity-50",
        className,
      )}
    >
      <div
        className={cn(
          "px-4",
          // Room for the grips that stand proud of the strip, and their rings.
          handle === "tab" ? "pt-1 pb-5" : handle === "bar" ? "py-2.5" : "py-1",
        )}
      >
        <div
          ref={setStrip}
          className="relative w-full"
          style={{ height: STRIP_H }}
        >
          <div className="absolute inset-0 overflow-clip rounded-2 border border-hairline bg-surface-2/60 [contain:paint]">
            <svg
              aria-hidden
              viewBox={`0 0 ${bars} 100`}
              preserveAspectRatio="none"
              className="absolute inset-0 size-full"
            >
              <defs>
                <clipPath id={clipId}>
                  <motion.rect x={clipX} y={0} width={clipW} height={100} />
                </clipPath>
              </defs>
              {beats.map((k) => (
                <path
                  key={k}
                  d={`M${r3(((k * beat) / total) * bars)} 0V100`}
                  fill="none"
                  strokeWidth={1}
                  vectorEffect="non-scaling-stroke"
                  className={
                    k % 4 === 0 ? "stroke-ink-3/35" : "stroke-ink-3/15"
                  }
                />
              ))}
              <g className="fill-ink-3/45">
                {peaks.map((p, i) => {
                  const h = r3(Math.max(2, p * 88));
                  return (
                    <rect
                      key={i}
                      x={r3(i + 0.2)}
                      width={0.6}
                      y={r3(50 - h / 2)}
                      height={h}
                    />
                  );
                })}
              </g>
              <g className="fill-cobalt-bright" clipPath={`url(#${clipId})`}>
                {peaks.map((p, i) => {
                  const h = r3(Math.max(2, p * 88));
                  return (
                    <rect
                      key={i}
                      x={r3(i + 0.2)}
                      width={0.6}
                      y={r3(50 - h / 2)}
                      height={h}
                    />
                  );
                })}
              </g>
            </svg>
            <motion.span
              aria-hidden
              className="pointer-events-none absolute inset-y-0 left-0 bg-card/60"
              style={{ width: startPct }}
            />
            <motion.span
              aria-hidden
              className="pointer-events-none absolute inset-y-0 right-0 bg-card/60"
              style={{ left: endPct }}
            />
          </div>

          <motion.div
            role="slider"
            tabIndex={disabled ? -1 : 0}
            aria-label={`${label} kept part`}
            aria-valuemin={0}
            aria-valuemax={r3(windowLimits.hi)}
            aria-valuenow={shown.start}
            aria-valuetext={`Keeps ${trim(shown.start)} to ${seconds(shown.end)}`}
            aria-describedby={hintId}
            aria-disabled={disabled || undefined}
            onKeyDown={(event) => onKeyDown("window", event)}
            {...windowDrag}
            onPointerDown={(event) => press(event, windowDrag)}
            className={cn(
              "absolute inset-y-0 touch-pan-y outline-none",
              "focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-ring focus-visible:outline-solid",
              handle === "frame" && "border-y-2 border-cobalt-bright",
              disabled
                ? "cursor-not-allowed"
                : pressed === "window"
                  ? "cursor-grabbing bg-cobalt-bright/10"
                  : "cursor-grab hover:bg-cobalt-bright/5",
            )}
            style={{ left: startPct, width: lenPct }}
          />

          <motion.span
            aria-hidden
            className="pointer-events-none absolute inset-y-0 z-10 w-0.5 -translate-x-1/2 rounded-full bg-foreground"
            style={{ left: playPct, opacity: playOn }}
          />

          <Grip
            side="start"
            handle={handle}
            left={startPct}
            pressed={pressed === "start"}
            disabled={disabled}
            drag={startDrag}
            onPress={(event) => press(event, startDrag)}
            onKeyDown={(event) => onKeyDown("start", event)}
            name={`${label} start`}
            min={0}
            max={r3(startLimits.hi)}
            now={shown.start}
            text={`Starts at ${seconds(shown.start)}, ${seconds(len)} kept`}
            describedBy={hintId}
          />
          <Grip
            side="end"
            handle={handle}
            left={endPct}
            pressed={pressed === "end"}
            disabled={disabled}
            drag={endDrag}
            onPress={(event) => press(event, endDrag)}
            onKeyDown={(event) => onKeyDown("end", event)}
            name={`${label} end`}
            min={r3(endLimits.lo)}
            max={total}
            now={shown.end}
            text={`Ends at ${seconds(shown.end)}, ${seconds(len)} kept`}
            describedBy={hintId}
          />
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 px-4 font-mono text-[11px] leading-4 text-ink-3 tabular-nums">
        <motion.span aria-hidden>{inText}</motion.span>
        <motion.span aria-hidden className="text-foreground">
          {lenText}
        </motion.span>
        <motion.span aria-hidden>{outText}</motion.span>
      </div>

      <span id={hintId} className="sr-only">
        {snapBeats
          ? "Arrow keys move a beat, Page keys four. Space previews the kept part."
          : "Arrow keys move a tenth of a second, Page keys a second. Space previews the kept part."}
      </span>
      <span role="status" aria-live="polite" className="sr-only">
        {said}
      </span>
    </div>
  );
}

function Grip({
  side,
  handle,
  left,
  pressed,
  disabled,
  drag,
  onPress,
  onKeyDown,
  name,
  min,
  max,
  now,
  text,
  describedBy,
}: {
  side: "start" | "end";
  handle: ClipTrimHandle;
  left: MotionValue<string>;
  pressed: boolean;
  disabled: boolean;
  drag: ReturnType<typeof useDrag>;
  onPress: (event: React.PointerEvent) => void;
  onKeyDown: (event: React.KeyboardEvent) => void;
  name: string;
  min: number;
  max: number;
  now: number;
  text: string;
  describedBy: string;
}) {
  const start = side === "start";
  // The grip's own box: 20 px to grab, reaching mostly outside the kept part
  // so a short span can still be slid by its middle.
  const box =
    handle === "frame"
      ? { marginLeft: start ? -12 : -8, width: 20 }
      : { marginLeft: -10, width: 20 };
  const ring =
    "group-focus-visible/clip-trim:outline-2 group-focus-visible/clip-trim:outline-solid group-focus-visible/clip-trim:outline-offset-1 group-focus-visible/clip-trim:outline-ring";
  const tint = pressed
    ? "bg-cobalt-bright ring-2 ring-cobalt-bright/35"
    : "bg-cobalt-bright group-hover/clip-trim:opacity-90";

  return (
    <motion.div
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-label={name}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={now}
      aria-valuetext={text}
      aria-describedby={describedBy}
      aria-disabled={disabled || undefined}
      onKeyDown={onKeyDown}
      {...drag}
      onPointerDown={onPress}
      className={cn(
        "group/clip-trim absolute inset-y-0 z-20 touch-pan-y outline-none",
        disabled ? "cursor-not-allowed" : "cursor-ew-resize",
      )}
      style={{ left, ...box }}
    >
      {handle === "frame" ? (
        <span
          className={cn(
            "absolute inset-y-0 flex w-3 items-center justify-center transition-shadow",
            start ? "left-0 rounded-l-2" : "right-0 rounded-r-2",
            tint,
            ring,
          )}
        >
          <span className="h-4 w-0.5 rounded-full bg-primary-foreground/80" />
        </span>
      ) : handle === "bar" ? (
        <span
          className={cn(
            "absolute -top-1.5 -bottom-1.5 left-1/2 flex w-1.5 -translate-x-1/2 items-center justify-center rounded-full transition-shadow",
            tint,
            ring,
          )}
        >
          <span className="h-3 w-px rounded-full bg-primary-foreground/80" />
        </span>
      ) : (
        <>
          <span className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-cobalt-bright" />
          <span
            className={cn(
              "absolute top-full left-1/2 mt-0.5 size-3.5 -translate-x-1/2 rounded-full transition-shadow",
              tint,
              ring,
            )}
          />
        </>
      )}
    </motion.div>
  );
}
