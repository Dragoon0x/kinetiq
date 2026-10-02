"use client";

import * as React from "react";

import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";
import { Upload } from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, durations, easings, springs } from "@/registry/lib/motion";
import {
  panFrom,
  semitones,
  useTactileSound,
} from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type UploadOrbitStatus = "queued" | "uploading" | "done" | "error";

export type UploadOrbitFile = {
  id: string;
  name: string;
  /** In bytes. */
  size?: number;
  /** How much of it has gone up, 0 to 1. */
  progress: number;
  status: UploadOrbitStatus;
  /** Why it failed, in a few words: "Too large", "Connection dropped". */
  error?: string;
};

export type UploadOrbitState = "idle" | "pending" | "success" | "error";

export type UploadOrbitSize = "sm" | "md" | "lg";

export type UploadOrbitHandle = {
  /** Queue files as if they had been dropped on the button. */
  add: (files: File[]) => void;
  /** Open the system file picker. */
  open: () => void;
  /** Stop everything queued or in flight; those files fail as cancelled. */
  cancel: () => void;
  /** Queue the failed files again. */
  retry: () => void;
};

export type UploadOrbitProps = {
  /** Uploads one file: report progress (0 to 1) as it goes and settle the promise when it is done. Called for at most `queue` files at once. */
  onUpload?: (
    file: File,
    progress: (share: number) => void,
    signal: AbortSignal,
  ) => Promise<unknown>;
  /** Controlled list of files. The button reports every list it wants through `onFilesChange` and draws this one. */
  files?: UploadOrbitFile[];
  /** Every new list: files added, progress, completions and failures. */
  onFilesChange?: (files: UploadOrbitFile[]) => void;
  /** The files the visitor chose or dropped that passed `accept` and `maxSize`. */
  onSelect?: (files: File[]) => void;
  /** What the picker offers and a drop accepts, as for a file input: "image/*,.pdf". */
  accept?: string;
  /** Take several files at a time. @default true */
  multiple?: boolean;
  /** The largest file accepted, in bytes. Larger ones fall off at once. */
  maxSize?: number;
  /** How far each dot's comet tail trails it while it moves, 0 to 1. 0 draws no tail. @default 0.6 */
  tail?: number;
  /** How quickly a dot runs to its reported progress, 0 to 1: a lazy glide or a tight follow. @default 0.5 */
  speed?: number;
  /** How many files fly at once; the rest wait in line as smaller dots, 1 to 4. @default 2 */
  queue?: number;
  /** The text at rest. @default "Upload" */
  label?: string;
  /** The text while files are queued or in flight. @default "Uploading" */
  pendingLabel?: string;
  /** The text once a batch has landed. @default "Uploaded" */
  successLabel?: string;
  /** The text after a batch with failures; a press queues them again. @default "Retry" */
  errorLabel?: string;
  /** Controlled button state. Without it, the state follows the files. */
  state?: UploadOrbitState;
  /** Each state the button moves to, from the change that caused it. */
  onStateChange?: (state: UploadOrbitState) => void;
  /** How long "Uploaded" holds before the button rests, in ms. @default 1600 */
  successHold?: number;
  /** How long "Retry" holds before the button rests, in ms. @default 4000 */
  errorHold?: number;
  /** @default "md" */
  size?: UploadOrbitSize;
  /** The orbit's colour: dots, tails, the lit track. Any CSS colour. @default "var(--accent-bright)" */
  accent?: string;
  /** Play the drop and each dot finding its place. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
  /** Add files, open the picker, cancel and retry from outside. */
  ref?: React.Ref<UploadOrbitHandle>;
};

type Geometry = { h: number; pad: number; gap: number; k: number };

const GEOMETRY: Record<UploadOrbitSize, Geometry> = {
  sm: { h: 32, pad: 12, gap: 6, k: 0.85 },
  md: { h: 40, pad: 16, gap: 8, k: 1 },
  lg: { h: 48, pad: 20, gap: 10, k: 1.15 },
};

const TEXT: Record<UploadOrbitSize, string> = {
  sm: "text-xs",
  md: "text-sm",
  lg: "text-base",
};

/** The effect frame round the button: the orbit, the hops and the falls. */
const FRAME = 12;
/** How far the orbit runs outside the button's edge. */
const ORBIT_GAP = 5;
const TAIL_SEGMENTS = 6;
const QUEUE_SHOWN = 8;

const r2 = (v: number) => Math.round(v * 100) / 100;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** A spring from a stiffness, critically damped: progress never runs backwards. */
const follow = (stiffness: number) => ({
  type: "spring" as const,
  stiffness,
  damping: 2 * Math.sqrt(stiffness),
  mass: 1,
});

type Seg =
  | {
      kind: "line";
      ax: number;
      ay: number;
      bx: number;
      by: number;
      len: number;
    }
  | { kind: "arc"; cx: number; cy: number; r: number; a0: number; len: number };

type Track = { segs: Seg[]; length: number };

type Pt = { x: number; y: number; tx: number; ty: number };

/**
 * The orbit as a walk round a pill, from the top centre clockwise: straight
 * runs and half-circle ends, each with its length, so any distance along it
 * is a point and any stretch of it a path.
 */
function makeTrack(x0: number, y0: number, x1: number, y1: number): Track {
  const r = Math.max(0, Math.min((y1 - y0) / 2, (x1 - x0) / 2));
  const cx = (x0 + x1) / 2;
  const segs: Seg[] = [];
  const line = (ax: number, ay: number, bx: number, by: number) =>
    segs.push({
      kind: "line",
      ax,
      ay,
      bx,
      by,
      len: Math.hypot(bx - ax, by - ay),
    });
  const arc = (acx: number, acy: number, a0: number) =>
    segs.push({ kind: "arc", cx: acx, cy: acy, r, a0, len: r * Math.PI });
  line(cx, y0, x1 - r, y0);
  arc(x1 - r, y0 + r, -Math.PI / 2);
  line(x1 - r, y1, x0 + r, y1);
  arc(x0 + r, y0 + r, Math.PI / 2);
  line(x0 + r, y0, cx, y0);
  return { segs, length: segs.reduce((sum, s) => sum + s.len, 0) };
}

function pointOn(seg: Seg, d: number): Pt {
  if (seg.kind === "line") {
    const t = seg.len > 0 ? d / seg.len : 0;
    return {
      x: seg.ax + (seg.bx - seg.ax) * t,
      y: seg.ay + (seg.by - seg.ay) * t,
      tx: seg.len > 0 ? (seg.bx - seg.ax) / seg.len : 1,
      ty: seg.len > 0 ? (seg.by - seg.ay) / seg.len : 0,
    };
  }
  const a = seg.a0 + (seg.r > 0 ? d / seg.r : 0);
  return {
    x: seg.cx + seg.r * Math.cos(a),
    y: seg.cy + seg.r * Math.sin(a),
    tx: -Math.sin(a),
    ty: Math.cos(a),
  };
}

const wrap = (track: Track, s: number) => {
  const L = track.length;
  return L > 0 ? ((s % L) + L) % L : 0;
};

function pointAt(track: Track, s: number): Pt {
  let d = s >= track.length ? track.length : wrap(track, s);
  for (const seg of track.segs) {
    if (d <= seg.len) return pointOn(seg, d);
    d -= seg.len;
  }
  return { x: 0, y: 0, tx: 1, ty: 0 };
}

/** The stretch of the track between two distances (a < b, at most one lap). */
function stretch(track: Track, a: number, b: number): string {
  const L = track.length;
  if (b - a < 0.3 || L <= 0) return "";
  if (a < 0 && b > 0)
    return `${stretch(track, a + L, L)} ${stretch(track, 0, b)}`;
  const from = a < 0 ? a + L : a;
  const to = a < 0 ? b + L : Math.min(b, L);
  const start = pointAt(track, from);
  const parts = [`M ${r2(start.x)} ${r2(start.y)}`];
  let run = 0;
  for (const seg of track.segs) {
    const lo = Math.max(from, run);
    const hi = Math.min(to, run + seg.len);
    if (hi > lo) {
      const end = pointOn(seg, hi - run);
      parts.push(
        seg.kind === "line"
          ? `L ${r2(end.x)} ${r2(end.y)}`
          : `A ${r2(seg.r)} ${r2(seg.r)} 0 0 1 ${r2(end.x)} ${r2(end.y)}`,
      );
    }
    run += seg.len;
    if (run >= to) break;
  }
  return parts.join(" ");
}

type Box = { w: number; h: number };

type DotProps = {
  file: UploadOrbitFile;
  /** Its place in the waiting line, or -1. */
  slot: number;
  track: Track;
  box: Box;
  badge: { x: number; y: number };
  radius: number;
  spacing: number;
  tail: number;
  speed: number;
  delay: number;
  motionSafe: boolean;
  onLanded: (id: string) => void;
};

/**
 * One file. Waiting, it is a small bead in line; flying, its place round the
 * orbit is its progress and a softer spring drags its tail behind it; done,
 * it finishes the lap and hops into the count; failed, it leaves along its
 * tangent and falls.
 */
function Dot({
  file,
  slot,
  track,
  box,
  badge,
  radius,
  spacing,
  tail,
  speed,
  delay,
  motionSafe,
  onLanded,
}: DotProps) {
  const L = track.length;
  const queueAt = (n: number) => -(n + 1) * spacing;
  const head = useMotionValue(
    file.status === "queued" ? queueAt(Math.max(0, slot)) : file.progress * L,
  );
  const trailStiffness = lerp(900, 70, clamp01(tail));
  const trail = useSpring(head, follow(trailStiffness));
  const grow = useMotionValue(file.status === "queued" ? 0.55 : 1);
  const appear = useMotionValue(0);
  const land = useMotionValue(0);
  const fall = useMotionValue(0);
  const fade = useMotionValue(1);
  const fx = useMotionValue(0);
  const fy = useMotionValue(0);
  const fvx = useMotionValue(0);
  const fvy = useMotionValue(0);
  const failed = useMotionValue(file.status === "error" ? 1 : 0);
  const [gone, setGone] = React.useState(false);

  const anims = React.useRef(new Map<string, AnimationPlaybackControls>());
  const phase = React.useRef<UploadOrbitStatus | "landed" | "fallen" | null>(
    null,
  );
  const live = React.useRef({ onLanded, motionSafe, speed, L });
  React.useEffect(() => {
    live.current = { onLanded, motionSafe, speed, L };
  });

  const run = (key: string, controls: AnimationPlaybackControls) => {
    anims.current.get(key)?.stop();
    anims.current.set(key, controls);
  };

  const jumpTo = (s: number) => {
    head.jump(s);
    trail.jump(s);
  };

  const hop = () => {
    phase.current = "landed";
    const done = () => {
      setGone(true);
      live.current.onLanded(file.id);
    };
    if (!live.current.motionSafe) {
      run(
        "fade",
        animate(fade, 0, {
          duration: durations.fast,
          ease: easings.exit,
          onComplete: done,
        }),
      );
      return;
    }
    land.jump(0);
    run(
      "land",
      animate(land, 1, {
        duration: 0.34,
        ease: easings.enter,
        onComplete: done,
      }),
    );
  };

  const drop = () => {
    phase.current = "fallen";
    if (!live.current.motionSafe) {
      failed.set(1);
      run(
        "fade",
        animate(fade, 0, {
          duration: durations.slow,
          ease: easings.exit,
          onComplete: () => setGone(true),
        }),
      );
      return;
    }
    for (const c of anims.current.values()) c.stop();
    const at = pointAt(track, Math.min(head.get(), L - 0.01));
    // Off along the tangent and a little outward, then gravity has it.
    fx.set(at.x);
    fy.set(at.y);
    fvx.set(at.tx * 70 + at.ty * 26);
    fvy.set(at.ty * 70 - at.tx * 26);
    run(
      "failed",
      animate(failed, 1, { duration: durations.fast, ease: easings.enter }),
    );
    fall.jump(0);
    run(
      "fall",
      animate(fall, 1, {
        duration: 0.5,
        ease: "linear",
        onComplete: () => setGone(true),
      }),
    );
  };

  // The dot follows its file: each change of status or progress moves it.
  React.useEffect(() => {
    const was = phase.current;
    const { motionSafe: safe, speed: sp, L: length } = live.current;
    const chase = follow(lerp(40, 600, clamp01(sp)));
    if (file.status === "queued") {
      if (was !== "queued") {
        // New in line, or queued again after failing: it pops into its slot.
        phase.current = "queued";
        setGone(false);
        land.jump(0);
        fall.jump(0);
        failed.jump(0);
        fade.jump(1);
        grow.jump(0.55);
        jumpTo(queueAt(Math.max(0, slot)));
        if (safe) {
          appear.jump(0);
          run("appear", animate(appear, 1, { ...springs.snap, delay }));
        } else {
          appear.set(1);
        }
        return;
      }
      if (safe)
        run("head", animate(head, queueAt(Math.max(0, slot)), springs.glide));
      else jumpTo(queueAt(Math.max(0, slot)));
      return;
    }
    if (file.status === "uploading") {
      if (was !== "uploading") {
        phase.current = "uploading";
        appear.set(1);
        if (safe) run("grow", animate(grow, 1, springs.snap));
        else grow.set(1);
      }
      const target = clamp01(file.progress) * length;
      if (!safe) {
        jumpTo(target);
        return;
      }
      // Stepping out of the line is a glide; after that it chases progress.
      const step = head.get() < 0 ? springs.glide : chase;
      run(
        "head",
        animate(head, Math.max(0, target), {
          ...step,
          velocity: head.getVelocity(),
        }),
      );
      return;
    }
    if (file.status === "done") {
      if (was === "landed") return;
      if (was === null) {
        // Already done when it arrived: it counts without flying.
        phase.current = "landed";
        setGone(true);
        live.current.onLanded(file.id);
        return;
      }
      phase.current = "done";
      appear.set(1);
      grow.set(1);
      if (!safe) {
        jumpTo(length);
        hop();
        return;
      }
      run(
        "head",
        animate(head, length, {
          ...chase,
          velocity: head.getVelocity(),
          onComplete: hop,
        }),
      );
      return;
    }
    if (file.status === "error") {
      if (was === "fallen") return;
      if (was === null) {
        phase.current = "fallen";
        setGone(true);
        return;
      }
      appear.set(1);
      drop();
    }
    // Moves follow the file's own status and progress, and its slot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file.status, file.progress, slot]);

  // Mounting again (StrictMode) finishes rather than freezes: a dot whose
  // animation was stopped mid-flight is put back where its file says.
  React.useEffect(() => {
    const running = anims.current;
    return () => {
      for (const c of running.values()) c.stop();
      running.clear();
      phase.current = null;
    };
  }, []);

  const place = useTransform(
    [
      head,
      land,
      fall,
      grow,
      appear,
      fade,
      fx,
      fy,
      fvx,
      fvy,
    ] as MotionValue<number>[],
    ([
      s = 0,
      ld = 0,
      fl = 0,
      gr = 1,
      ap = 0,
      fd = 1,
      x0 = 0,
      y0 = 0,
      vx = 0,
      vy = 0,
    ]: number[]) => {
      const r = radius * gr * ap;
      if (fl > 0) {
        const t = fl * 0.5;
        const x = x0 + vx * t;
        const y = y0 + vy * t + 0.5 * 260 * t * t;
        return {
          x: r2(Math.min(box.w - r, Math.max(r, x))),
          y: r2(Math.min(box.h - r, Math.max(r, y))),
          r: r2(r),
          o: r2(fd * (1 - fl)),
        };
      }
      if (ld > 0) {
        // A short hop from the top of the orbit into the badge.
        const start = pointAt(track, 0);
        const cx = lerp(start.x, badge.x, 0.55);
        const cy = Math.max(radius, start.y - 4);
        const u = 1 - ld;
        const x = u * u * start.x + 2 * u * ld * cx + ld * ld * badge.x;
        const y = u * u * start.y + 2 * u * ld * cy + ld * ld * badge.y;
        return {
          x: r2(x),
          y: r2(y),
          r: r2(r * lerp(1, 0.45, ld)),
          o: r2(fd * (ld > 0.75 ? (1 - ld) / 0.25 : 1)),
        };
      }
      const at = pointAt(track, Math.min(s, L));
      return {
        x: r2(at.x),
        y: r2(at.y),
        r: r2(r),
        o: r2(fd * Math.min(1, ap * 1.5)),
      };
    },
  );
  const cx = useTransform(place, (p) => p.x);
  const cy = useTransform(place, (p) => p.y);
  const r = useTransform(place, (p) => p.r);
  const opacity = useTransform(place, (p) => p.o);
  const fill = useTransform(failed, (f) =>
    f <= 0
      ? "var(--upload-orbit-accent)"
      : f >= 1
        ? "var(--danger)"
        : `color-mix(in oklab, var(--danger) ${Math.round(f * 100)}%, var(--upload-orbit-accent))`,
  );

  const tails = useTransform(
    [head, trail, land, fall] as MotionValue<number>[],
    ([s = 0, t = 0, ld = 0, fl = 0]: number[]) => {
      const empty = Array.from({ length: TAIL_SEGMENTS }, () => "");
      if (ld > 0 || fl > 0 || tail <= 0) return empty;
      const front = Math.min(s, L);
      const span = Math.min(front - t, tail * 0.35 * L);
      if (span < 1) return empty;
      const back = front - span;
      return empty.map((_, j) =>
        stretch(
          track,
          back + (span * j) / TAIL_SEGMENTS,
          back + (span * (j + 1)) / TAIL_SEGMENTS + 0.4,
        ),
      );
    },
  );

  if (gone) return null;
  return (
    <g>
      {motionSafe && tail > 0
        ? Array.from({ length: TAIL_SEGMENTS }, (_, j) => (
            <TailSegment
              key={j}
              index={j}
              paths={tails}
              width={radius * 2 * (0.25 + (0.75 * (j + 1)) / TAIL_SEGMENTS)}
            />
          ))
        : null}
      <motion.circle cx={cx} cy={cy} r={r} style={{ fill, opacity }} />
    </g>
  );
}

function TailSegment({
  index,
  paths,
  width,
}: {
  index: number;
  paths: MotionValue<string[]>;
  width: number;
}) {
  const d = useTransform(paths, (p) => p[index] ?? "");
  const share = (index + 1) / TAIL_SEGMENTS;
  return (
    <motion.path
      d={d}
      fill="none"
      strokeLinecap="round"
      strokeWidth={r2(width)}
      style={{
        stroke: "var(--upload-orbit-accent)",
        opacity: r2(0.6 * share * share),
      }}
    />
  );
}

type Geo = {
  w: number;
  h: number;
  bw: number;
  bh: number;
  badge: { x: number; y: number };
};

type Api = {
  add: (list: File[], quiet?: boolean) => void;
  cancel: () => void;
  retry: () => void;
  pump: () => void;
  rest: () => void;
  refuse: (why: ReadonlyMap<string, string>) => void;
};

/**
 * A batch is busy while anything is queued or in flight, and until each of
 * its finished files has landed in the count: the label moves with the dots.
 */
const isBusy = (
  list: readonly UploadOrbitFile[],
  batch: ReadonlySet<string>,
  landed: ReadonlySet<string>,
) =>
  list.some(
    (f) =>
      f.status === "queued" ||
      f.status === "uploading" ||
      (f.status === "done" && batch.has(f.id) && !landed.has(f.id)),
  );

const plural = (n: number, word: string) =>
  `${n} ${n === 1 ? word : `${word}s`}`;

function accepts(file: File, accept: string | undefined): boolean {
  if (!accept) return true;
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();
  return accept
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean)
    .some((t) =>
      t.startsWith(".")
        ? name.endsWith(t)
        : t.endsWith("/*")
          ? type.startsWith(t.slice(0, -1))
          : type === t,
    );
}

const reasonOf = (error: unknown, signal: AbortSignal) =>
  signal.aborted
    ? "Cancelled"
    : error instanceof Error && error.message
      ? error.message
      : "Upload failed";

/**
 * An upload button whose files orbit it while they go up. It is a real button
 * over a real file input — click, Enter or Space opens the picker — and files
 * can be dropped anywhere on it: the orbit lights up and the button swells to
 * take them. Each file becomes a dot. Waiting files sit in line on the top
 * edge as small beads; up to `queue` at a time step out and fly, and a
 * flying dot's place round the button IS its progress: one lap is the whole
 * file, walked by arc length from 12 o'clock. The dot chases each reported
 * progress on a critically damped spring (`speed`), and a softer spring drags
 * its comet tail behind it, so a dot that dashes stretches and a stalled one
 * shrinks back to a bead.
 *
 * A finished dot completes its lap and hops into the count in the label; the
 * badge recoils as it lands and the digit rolls. A failed dot leaves along its
 * tangent, turns red and falls, and the badge grows a red counter. Escape
 * cancels what is in flight; after a batch with failures, a press queues them
 * again. Under reduced motion the dots jump to their progress, fade into the
 * badge and fade out red when they fail, and the count still moves.
 */
export function UploadOrbit({
  onUpload,
  files,
  onFilesChange,
  onSelect,
  accept,
  multiple = true,
  maxSize,
  tail = 0.6,
  speed = 0.5,
  queue = 2,
  label = "Upload",
  pendingLabel = "Uploading",
  successLabel = "Uploaded",
  errorLabel = "Retry",
  state,
  onStateChange,
  successHold = 1600,
  errorHold = 4000,
  size = "md",
  accent = "var(--accent-bright)",
  sound = false,
  disabled = false,
  className,
  ref,
}: UploadOrbitProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const hintId = `orbit-${uid}-hint`;
  const g = GEOMETRY[size] ?? GEOMETRY.md;
  const limit = Math.max(1, Math.min(4, Math.round(queue)));

  const [own, setOwn] = React.useState<UploadOrbitFile[]>([]);
  const list = files ?? own;
  const [batch, setBatch] = React.useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [landed, setLanded] = React.useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [phase, setPhase] = React.useState<"idle" | "success" | "error">(
    "idle",
  );
  // Refused files (wrong type, too large) fail for good: no retry brings them.
  const [refusedIds, setRefusedIds] = React.useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [dragging, setDragging] = React.useState(false);
  const [hovered, setHovered] = React.useState(false);
  const [said, setSaid] = React.useState("");
  const [node, setNode] = React.useState<HTMLButtonElement | null>(null);
  const [geo, setGeo] = React.useState<Geo | null>(null);

  // The batch settles in the render that sees it settle, whoever moved it.
  const busy = isBusy(list, batch, landed);
  const [wasBusy, setWasBusy] = React.useState(busy);
  if (busy !== wasBusy) {
    setWasBusy(busy);
    setPhase(
      busy
        ? "idle"
        : list.some((f) => batch.has(f.id) && f.status === "error")
          ? "error"
          : "success",
    );
  }
  const shown: UploadOrbitState = state ?? (busy ? "pending" : phase);

  const badgeRef = React.useRef<HTMLSpanElement | null>(null);
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const latest = React.useRef<UploadOrbitFile[]>(list);
  const batchRef = React.useRef<Set<string>>(new Set());
  const landedRef = React.useRef<Set<string>>(new Set());
  const blobs = React.useRef(new Map<string, File>());
  const inflight = React.useRef(new Map<string, AbortController>());
  const fixed = React.useRef(new Set<string>());
  const counter = React.useRef(0);
  const depth = React.useRef(0);
  const timers = React.useRef<number[]>([]);
  const api = React.useRef<Api | null>(null);
  const badgeScale = useMotionValue(1);
  const badgeFlash = useMotionValue(0);
  const holdClock = useMotionValue(0);

  React.useEffect(() => {
    latest.current = list;
  });

  const pan = () => {
    const rect = node?.getBoundingClientRect();
    return rect ? panFrom(rect.left + rect.width / 2, null) : 0;
  };

  const busyNow = () =>
    isBusy(latest.current, batchRef.current, landedRef.current);

  /** Reports the batch starting or settling, from the change that did it. */
  const tell = (was: boolean) => {
    const now = busyNow();
    if (!was && now) onStateChange?.("pending");
    else if (was && !now) {
      onStateChange?.(
        latest.current.some(
          (f) => batchRef.current.has(f.id) && f.status === "error",
        )
          ? "error"
          : "success",
      );
    }
  };

  const commit = (fn: (now: UploadOrbitFile[]) => UploadOrbitFile[]) => {
    const was = busyNow();
    const next = fn(latest.current);
    latest.current = next;
    if (files === undefined) setOwn(next);
    onFilesChange?.(next);
    tell(was);
  };

  const patch = (id: string, fields: Partial<UploadOrbitFile>) =>
    commit((now) => now.map((f) => (f.id === id ? { ...f, ...fields } : f)));

  const grow = (ids: string[]) => {
    const fresh = !busyNow();
    const next = new Set(fresh ? [] : batchRef.current);
    for (const id of ids) next.add(id);
    batchRef.current = next;
    setBatch(next);
  };

  const start = (id: string, file: File) => {
    if (!onUpload) return;
    const controller = new AbortController();
    inflight.current.set(id, controller);
    patch(id, { status: "uploading", progress: 0, error: undefined });
    let last = 0;
    const report = (share: number) => {
      if (inflight.current.get(id) !== controller) return;
      const p = Math.round(clamp01(share) * 1000) / 1000;
      if (p < 1 && p < last + 0.004) return;
      last = p;
      patch(id, { progress: p });
    };
    let result: Promise<unknown>;
    try {
      result = Promise.resolve(onUpload(file, report, controller.signal));
    } catch (error) {
      result = Promise.reject(error);
    }
    result.then(
      () => {
        if (inflight.current.get(id) !== controller) return;
        inflight.current.delete(id);
        patch(id, { status: "done", progress: 1, error: undefined });
        api.current?.pump();
      },
      (error: unknown) => {
        if (inflight.current.get(id) !== controller) return;
        inflight.current.delete(id);
        const reason = reasonOf(error, controller.signal);
        const name = latest.current.find((f) => f.id === id)?.name ?? "A file";
        setSaid(`${name} failed: ${reason.toLowerCase()}.`);
        patch(id, { status: "error", error: reason });
        api.current?.pump();
      },
    );
  };

  const pump = () => {
    if (!onUpload) return;
    const now = latest.current;
    let flying = now.filter(
      (f) => f.status === "uploading" && inflight.current.has(f.id),
    ).length;
    for (const f of now) {
      if (flying >= limit) break;
      if (f.status !== "queued" || inflight.current.has(f.id)) continue;
      if (fixed.current.has(f.id)) continue;
      const file = blobs.current.get(f.id);
      if (!file) continue;
      start(f.id, file);
      flying += 1;
    }
  };

  const add = (incoming: File[], quiet = false) => {
    if (disabled || incoming.length === 0) return;
    const chosen = multiple ? incoming : incoming.slice(0, 1);
    const entries: UploadOrbitFile[] = [];
    const ok: File[] = [];
    const refused = new Map<string, string>();
    for (const file of chosen) {
      counter.current += 1;
      const id = `${uid}-f${counter.current}`;
      const reason = !accepts(file, accept)
        ? "Not accepted"
        : maxSize !== undefined && file.size > maxSize
          ? "Too large"
          : null;
      blobs.current.set(id, file);
      if (reason) {
        refused.set(id, reason);
        fixed.current.add(id);
      } else {
        ok.push(file);
      }
      // Refused files still arrive, so the visitor sees them fall.
      entries.push({
        id,
        name: file.name,
        size: file.size,
        progress: 0,
        status: "queued",
      });
    }
    grow(entries.map((e) => e.id));
    commit((now) => [...now, ...entries]);
    if (ok.length) onSelect?.(ok);
    if (refused.size) {
      setRefusedIds(new Set(fixed.current));
      // A beat in line first, then they fall: refused, not lost.
      timers.current.push(
        window.setTimeout(() => api.current?.refuse(refused), 260),
      );
    }
    setSaid(
      `${plural(ok.length, "file")} added.${refused.size ? ` ${refused.size} refused.` : ""}`,
    );
    if (quiet) {
      pump();
      return;
    }
    audio.play("pop", { pitch: 1, gain: 0.5, pan: pan() });
    const gap = cascade(entries.length);
    entries.forEach((entry, i) => {
      if (refused.has(entry.id)) return;
      timers.current.push(
        window.setTimeout(
          () =>
            audio.play("plip", {
              pitch: Number(semitones(Math.min(12, i * 2)).toFixed(4)),
              gain: 0.4,
              pan: pan(),
            }),
          Math.round(80 + i * gap * 1000),
        ),
      );
    });
    pump();
  };

  const refuse = (why: ReadonlyMap<string, string>) =>
    commit((now) =>
      now.map((f) =>
        why.has(f.id) ? { ...f, status: "error", error: why.get(f.id) } : f,
      ),
    );

  const cancel = () => {
    const stopping = new Set<string>();
    for (const [id, controller] of inflight.current) {
      controller.abort();
      stopping.add(id);
    }
    inflight.current.clear();
    for (const f of latest.current) {
      if (f.status === "queued" && !fixed.current.has(f.id)) stopping.add(f.id);
    }
    if (stopping.size === 0) return;
    setSaid(`${plural(stopping.size, "upload")} cancelled.`);
    commit((now) =>
      now.map((f) =>
        stopping.has(f.id) ? { ...f, status: "error", error: "Cancelled" } : f,
      ),
    );
  };

  const retryable = (f: UploadOrbitFile) =>
    f.status === "error" && !fixed.current.has(f.id) && blobs.current.has(f.id);

  const retry = () => {
    const again = latest.current.filter(retryable).map((f) => f.id);
    if (again.length === 0) return;
    const ids = new Set(again);
    grow(again);
    setSaid(`Trying ${plural(again.length, "file")} again.`);
    commit((now) =>
      now.map((f) =>
        ids.has(f.id)
          ? { ...f, status: "queued", progress: 0, error: undefined }
          : f,
      ),
    );
    pump();
  };

  const rest = () => {
    setPhase("idle");
    batchRef.current = new Set();
    setBatch(new Set());
    onStateChange?.("idle");
  };

  const onLanded = (id: string) => {
    if (landedRef.current.has(id)) return;
    const was = busyNow();
    landedRef.current = new Set(landedRef.current).add(id);
    setLanded(landedRef.current);
    tell(was);
    const now = latest.current;
    const name = now.find((f) => f.id === id)?.name;
    const inBatch = [...batchRef.current];
    const home = inBatch.filter((b) => landedRef.current.has(b)).length;
    if (name) {
      setSaid(
        inBatch.length > 1
          ? `${name} uploaded, ${home} of ${inBatch.length}.`
          : `${name} uploaded.`,
      );
    }
    if (motionSafe) {
      badgeScale.jump(1.16);
      animate(badgeScale, 1, springs.recoil);
    } else {
      badgeFlash.jump(1);
      animate(badgeFlash, 0, { duration: durations.slow, ease: easings.exit });
    }
  };

  React.useEffect(() => {
    api.current = { add, cancel, retry, pump, rest, refuse };
  });

  React.useImperativeHandle(
    ref,
    () => ({
      // Heard only when a person's press or key is behind the call; a host
      // adding files on its own adds them silently.
      add: (list) =>
        api.current?.add(
          list,
          typeof navigator !== "undefined" && navigator.userActivation
            ? !navigator.userActivation.isActive
            : false,
        ),
      open: () => inputRef.current?.click(),
      cancel: () => api.current?.cancel(),
      retry: () => api.current?.retry(),
    }),
    [],
  );

  // Files a host queues itself start on the next frame.
  React.useEffect(() => {
    const id = window.requestAnimationFrame(() => api.current?.pump());
    return () => window.cancelAnimationFrame(id);
  });

  // The orbit is measured off the button once it is on the page, and again
  // whenever its size changes.
  React.useEffect(() => {
    if (!node) return;
    const measure = () => {
      const badge = badgeRef.current;
      const next: Geo = {
        w: node.offsetWidth + 2 * FRAME,
        h: node.offsetHeight + 2 * FRAME,
        bw: node.offsetWidth,
        bh: node.offsetHeight,
        badge: badge
          ? {
              x: r2(FRAME + badge.offsetLeft + badge.offsetWidth / 2),
              y: r2(FRAME + badge.offsetTop + badge.offsetHeight / 2),
            }
          : {
              x: FRAME + node.offsetWidth - 20,
              y: FRAME + node.offsetHeight / 2,
            },
      };
      setGeo((prev) =>
        prev &&
        prev.w === next.w &&
        prev.h === next.h &&
        prev.badge.x === next.badge.x &&
        prev.badge.y === next.badge.y
          ? prev
          : next,
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [node]);

  // "Uploaded" and "Retry" hold, then the button rests; hidden pages hold still.
  const holding = shown === "success" || shown === "error";
  const holdMs = shown === "success" ? successHold : errorHold;
  React.useEffect(() => {
    if (!holding) return;
    holdClock.jump(0);
    const controls = animate(holdClock, 1, {
      duration: Math.max(0, holdMs) / 1000,
      ease: "linear",
      onComplete: () => api.current?.rest(),
    });
    const onVisibility = () => {
      if (document.hidden) controls.pause();
      else controls.play();
    };
    if (document.hidden) controls.pause();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      controls.stop();
    };
  }, [holding, holdMs, holdClock]);

  React.useEffect(() => {
    const pending = timers.current;
    const flying = inflight.current;
    return () => {
      for (const t of pending) window.clearTimeout(t);
      pending.length = 0;
      for (const controller of flying.values()) controller.abort();
      flying.clear();
    };
  }, []);

  const track = React.useMemo(
    () =>
      geo
        ? makeTrack(
            FRAME - ORBIT_GAP,
            FRAME - ORBIT_GAP,
            FRAME + geo.bw + ORBIT_GAP,
            FRAME + geo.bh + ORBIT_GAP,
          )
        : null,
    [geo],
  );
  const trackPath = track ? stretch(track, 0, track.length) : "";

  const count = list.filter(
    (f) => f.status === "done" && landed.has(f.id),
  ).length;
  const failedCount = list.filter((f) => f.status === "error").length;
  const canRetry = list.some(
    (f) => f.status === "error" && !refusedIds.has(f.id),
  );
  const showRetry = shown === "error" && canRetry;
  const visible: "label" | "pending" | "success" | "error" =
    shown === "pending"
      ? "pending"
      : shown === "success"
        ? "success"
        : showRetry
          ? "error"
          : "label";
  const faces = {
    label,
    pending: pendingLabel,
    success: successLabel,
    error: errorLabel,
  };
  const queued = list.filter((f) => f.status === "queued");
  const slotOf = (id: string) => {
    const i = queued.findIndex((f) => f.id === id);
    return i < QUEUE_SHOWN ? i : QUEUE_SHOWN - 1;
  };
  const appearOrder = new Map(queued.map((f, i) => [f.id, i] as const));
  const going = list.filter(
    (f) => f.status === "queued" || f.status === "uploading",
  ).length;
  const description = [
    count || failedCount
      ? `${count} uploaded${failedCount ? `, ${failedCount} failed` : ""}.`
      : "",
    busy
      ? going > 0
        ? `${plural(going, "file")} still going. Escape cancels.`
        : "Landing."
      : showRetry
        ? "Press to try the failed files again."
        : "Choose files, or drop them here.",
  ]
    .filter(Boolean)
    .join(" ");
  const trackOpacity = dragging ? 1 : busy ? 0.55 : hovered ? 0.4 : 0;
  const flash = useTransform(badgeFlash, (f) =>
    f <= 0
      ? "color-mix(in oklab, var(--upload-orbit-accent) 14%, transparent)"
      : `color-mix(in oklab, var(--upload-orbit-accent) ${Math.round(14 + 40 * f)}%, transparent)`,
  );

  const hasFiles = (event: React.DragEvent) =>
    !disabled && Array.from(event.dataTransfer.types).includes("Files");

  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 align-middle select-none",
        className,
      )}
      style={
        {
          padding: FRAME,
          "--upload-orbit-accent": accent,
        } as React.CSSProperties
      }
      onDragEnter={(event) => {
        if (!hasFiles(event)) return;
        event.preventDefault();
        depth.current += 1;
        setDragging(true);
      }}
      onDragOver={(event) => {
        if (!hasFiles(event)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
      }}
      onDragLeave={() => {
        depth.current = Math.max(0, depth.current - 1);
        if (depth.current === 0) setDragging(false);
      }}
      onDrop={(event) => {
        if (!hasFiles(event)) return;
        event.preventDefault();
        depth.current = 0;
        setDragging(false);
        add(Array.from(event.dataTransfer.files));
      }}
    >
      <motion.button
        ref={setNode}
        type="button"
        disabled={disabled}
        aria-describedby={hintId}
        aria-busy={busy || undefined}
        onClick={() => {
          if (showRetry) retry();
          else inputRef.current?.click();
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape" && busy) {
            // Handled here, where focus is; the page must not also see it.
            event.preventDefault();
            cancel();
          }
        }}
        onPointerEnter={(event) => {
          if (event.pointerType === "mouse") setHovered(true);
        }}
        onPointerLeave={() => setHovered(false)}
        animate={{ scale: dragging && motionSafe ? 1.03 : 1 }}
        transition={motionSafe ? springs.snap : { duration: 0 }}
        className={cn(
          "relative inline-flex shrink-0 items-center rounded-full border bg-card font-medium whitespace-nowrap text-foreground transition-colors outline-none",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
          TEXT[size],
          dragging
            ? "border-(--upload-orbit-accent)"
            : showRetry
              ? "border-[color-mix(in_oklab,var(--danger)_45%,transparent)]"
              : "border-hairline-strong",
          disabled
            ? "cursor-not-allowed opacity-50"
            : "cursor-pointer hover:bg-surface-2",
        )}
        style={{
          height: g.h,
          paddingInline: g.pad,
          paddingRight: g.pad - 6,
          gap: g.gap,
        }}
      >
        <motion.span
          aria-hidden
          className="flex shrink-0 text-(--upload-orbit-accent)"
          animate={{ y: dragging && motionSafe ? -2 : 0 }}
          transition={motionSafe ? springs.snap : { duration: 0 }}
        >
          <Upload className="size-4" strokeWidth={2} />
        </motion.span>
        <span className="grid">
          {(Object.keys(faces) as (keyof typeof faces)[]).map((key) => (
            <motion.span
              key={key}
              aria-hidden={visible !== key}
              className={cn(
                "col-start-1 row-start-1 justify-self-center",
                key === "error" && "text-danger",
              )}
              initial={false}
              animate={{ opacity: visible === key ? 1 : 0 }}
              transition={{
                duration: visible === key ? durations.base : durations.fast,
                ease: visible === key ? easings.enter : easings.exit,
              }}
            >
              {faces[key]}
            </motion.span>
          ))}
        </span>
        <motion.span
          ref={badgeRef}
          aria-hidden
          className="relative inline-grid h-5 min-w-[calc(2ch+12px)] shrink-0 place-items-center overflow-visible rounded-full px-1.5 font-mono text-[11px] text-foreground tabular-nums"
          style={{ scale: badgeScale, backgroundColor: flash }}
        >
          <AnimatePresence initial={false}>
            <motion.span
              key={count}
              className="col-start-1 row-start-1"
              initial={motionSafe ? { opacity: 0, y: 7 } : { opacity: 0 }}
              animate={{ opacity: 1, y: 0 }}
              exit={
                motionSafe
                  ? {
                      opacity: 0,
                      y: -7,
                      transition: {
                        duration: durations.fast,
                        ease: easings.exit,
                      },
                    }
                  : { opacity: 0, transition: { duration: durations.fast } }
              }
              transition={
                motionSafe ? springs.snap : { duration: durations.fast }
              }
            >
              {count}
            </motion.span>
          </AnimatePresence>
          <AnimatePresence initial={false}>
            {failedCount > 0 ? (
              <motion.span
                key="failed"
                className="absolute -top-1.5 -right-1.5 grid h-3.5 min-w-3.5 place-items-center rounded-full bg-danger px-0.5 font-mono text-[9px] leading-none text-destructive-foreground"
                initial={motionSafe ? { scale: 0 } : { opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ opacity: 0, transition: { duration: durations.fast } }}
                transition={
                  motionSafe ? springs.snap : { duration: durations.fast }
                }
              >
                {failedCount > 9 ? "9+" : failedCount}
              </motion.span>
            ) : null}
          </AnimatePresence>
        </motion.span>
      </motion.button>

      <input
        ref={inputRef}
        type="file"
        hidden
        tabIndex={-1}
        multiple={multiple}
        accept={accept}
        disabled={disabled}
        onChange={(event) => {
          const chosen = Array.from(event.currentTarget.files ?? []);
          // Cleared, so choosing the same file again is a change too.
          event.currentTarget.value = "";
          add(chosen);
        }}
      />

      {geo && track ? (
        <svg
          aria-hidden
          width={geo.w}
          height={geo.h}
          viewBox={`0 0 ${geo.w} ${geo.h}`}
          className={cn(
            "pointer-events-none absolute inset-0 overflow-hidden",
            disabled && "opacity-50",
          )}
        >
          <motion.path
            d={trackPath}
            fill="none"
            strokeWidth={1}
            strokeDasharray={dragging ? undefined : "2 3"}
            initial={false}
            animate={{ opacity: trackOpacity }}
            transition={{ duration: durations.base, ease: easings.enter }}
            style={{
              stroke: dragging
                ? "var(--upload-orbit-accent)"
                : "var(--hairline-strong)",
            }}
          />
          {list.map((file) => (
            <Dot
              key={file.id}
              file={file}
              slot={file.status === "queued" ? slotOf(file.id) : -1}
              track={track}
              box={{ w: geo.w, h: geo.h }}
              badge={geo.badge}
              radius={3 * g.k}
              spacing={9 * g.k}
              tail={clamp01(tail)}
              speed={clamp01(speed)}
              delay={(appearOrder.get(file.id) ?? 0) * cascade(queued.length)}
              motionSafe={motionSafe}
              onLanded={onLanded}
            />
          ))}
        </svg>
      ) : null}

      <span id={hintId} className="sr-only">
        {description}
      </span>
      <span role="status" aria-live="polite" className="sr-only">
        {said}
      </span>
    </span>
  );
}
