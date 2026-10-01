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
import {
  panFrom,
  semitones,
  useTactileSound,
} from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type WristbandFabric = "woven" | "silicone" | "paper";
export type WristbandTier = "ga" | "vip" | "crew";

export type WristbandProps = {
  /** Who wears it: printed on the band, and in its accessible name. */
  name: string;
  /** The event, repeated along the band. @default "Admit one" */
  event?: string;
  /** The ticket's code, printed small on the band. */
  code?: string;
  /** Where the band lets them in. @default per tier */
  access?: string;
  /** Controlled: whether the band is snapped on. */
  snapped?: boolean;
  /** Whether it starts snapped on when uncontrolled. @default false */
  defaultSnapped?: boolean;
  /** Fires from the gesture, key or button that snapped it on or off. */
  onSnappedChange?: (snapped: boolean) => void;
  /** Fires when a worn band is held to the reader (a tap, Enter or Space). */
  onScan?: () => void;
  /** What the band is made of: its look, its height and how it curls. @default "woven" */
  fabric?: WristbandFabric;
  /** The ticket tier: the band's colour, its print and its chime. @default "vip" */
  tier?: WristbandTier;
  /** How much depth the worn loop shows, 0 (straight on) to 1 (looking down into it). @default 0.6 */
  wrap?: number;
  /** Play the clasp and the reader. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

type Fabric = {
  /** The band's height, px. */
  height: number;
  /** The curl's spring: soft cloth, lively rubber, stiff paper. */
  spring: (typeof springs)[keyof typeof springs];
  /** Specular strength and tightness. */
  gloss: number;
  sharp: number;
};

const FABRICS: Record<WristbandFabric, Fabric> = {
  woven: { height: 34, spring: springs.drift, gloss: 0.1, sharp: 6 },
  silicone: { height: 30, spring: springs.snap, gloss: 0.32, sharp: 10 },
  paper: { height: 36, spring: springs.glide, gloss: 0, sharp: 1 },
};

type Tier = {
  label: string;
  long: string;
  access: string;
  /** The band's colour: a token's hue at a fixed lightness. */
  band: string;
  /** Ink printed on cloth or rubber of that colour. */
  print: string;
  /** The chime's pitch. */
  pitch: number;
};

const TIERS: Record<WristbandTier, Tier> = {
  ga: {
    label: "GA",
    long: "General admission",
    access: "Gates A to C",
    band: "oklch(from var(--accent) 0.55 0.16 h)",
    print: "oklch(from var(--accent) 0.97 0.02 h)",
    pitch: 1,
  },
  vip: {
    label: "VIP",
    long: "VIP",
    access: "Lounge, Gate B",
    band: "oklch(from var(--warn) 0.76 0.13 h)",
    print: "oklch(from var(--warn) 0.3 0.06 h)",
    pitch: semitones(4),
  },
  crew: {
    label: "CREW",
    long: "Crew",
    access: "All areas",
    band: "oklch(from var(--danger) 0.55 0.18 h)",
    print: "oklch(from var(--danger) 0.97 0.02 h)",
    pitch: semitones(-3),
  },
};

const PAPER_INK = "oklch(from var(--ink) 0.24 0.02 h)";
const CLASP = "oklch(from var(--ink-3) 0.86 0.01 h)";
const CLASP_EDGE = "oklch(from var(--ink-3) 0.6 0.015 h)";

const SCENE_H = 164;
/** The band is drawn as this many flat slices on a cylinder. */
const SLICES = 36;
/** Where the clasp sits on the worn loop: front left, so it can be seen. */
const CLASP_AT = (-76 * Math.PI) / 180;
/** The print panel's centre sits a little right of front, clear of the clasp. */
const PANEL_AT = (8 * Math.PI) / 180;
/** Past this much curl a drag is caught by the clasp. */
const CATCH = 0.94;
const DEG = 180 / Math.PI;
/** How far each slice reaches past its own width, px, to hide the joins. */
const SEAM = 1.5;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;

type Geometry = {
  /** The band's length, px. */
  L: number;
  H: number;
  /** How far the clasp end overlaps the tail when it is on. */
  overlap: number;
  /** The arc length that faces front when the band is on. */
  anchor: number;
  /** The arc length of the print panel's centre. */
  panelU: number;
  /** The worn curvature, 1/radius. */
  kappa: number;
  radius: number;
  panel: number;
  slice: number;
};

function geometryOf(width: number, height: number): Geometry {
  const L = Math.round(clamp(width - 24, 260, 600));
  const overlap = Math.round(L * 0.09);
  const loop = L - overlap;
  const kappa = (2 * Math.PI) / loop;
  // The anchor faces front; the clasp's centre lands CLASP_AT from it.
  const anchor = L - overlap / 2 - (1 + CLASP_AT / (2 * Math.PI)) * loop;
  return {
    L,
    H: height,
    overlap,
    anchor: r2(anchor),
    panelU: r2(anchor + (PANEL_AT / (2 * Math.PI)) * loop),
    kappa,
    radius: loop / (2 * Math.PI),
    panel: Math.round(Math.min(170, L * 0.28)),
    slice: L / SLICES,
  };
}

type Pose = {
  transform: string;
  outer: number;
  inner: number;
  gloss: number;
};

/** Where one slice sits on the cylinder for a curl, a turn and a squeeze. */
function poseOf(
  g: Geometry,
  fabric: Fabric,
  u: number,
  curl: number,
  turn: number,
  squeeze: number,
  dz = 0,
): Pose {
  const k = g.kappa * Math.max(0, curl) * (1 + 0.035 * squeeze);
  const head = u > g.L - g.overlap ? 1.6 * clamp(curl, 0, 1) : 0;
  const shift = (1 - clamp(curl, 0, 1)) * (g.anchor - g.L / 2);
  let x: number;
  let z: number;
  let phi: number;
  if (k < 1e-6) {
    x = u - g.anchor;
    z = 0;
    phi = 0;
  } else {
    phi = (u - g.anchor) * k + (turn / DEG) * clamp(curl, 0, 1);
    const r = 1 / k + head;
    x = Math.sin(phi) * r;
    z = Math.cos(phi) * r - 1 / k;
  }
  // A light from the front left: the outer face is lit by its normal, the
  // inside of the far half is in the band's own shade.
  const nx = Math.sin(phi);
  const nz = Math.cos(phi);
  const lit = Math.max(0, nx * -0.41 + nz * 0.91);
  const facing = Math.max(0, nx * -0.21 + nz * 0.98);
  return {
    transform: `translate3d(${r2(x + shift)}px, 0px, ${r2(z + dz)}px) rotateY(${r2(phi * DEG)}deg)`,
    outer: r3((1 - (0.5 + 0.5 * lit)) * 0.85),
    inner: r3(0.38 + 0.22 * Math.max(0, nz)),
    gloss: r3(fabric.gloss * Math.pow(facing, fabric.sharp)),
  };
}

/** One slice of the band: an outer face with its strip of the print, an inner face. */
function Slice({
  index,
  g,
  fabric,
  curl,
  turn,
  squeeze,
  outerFace,
  innerFace,
}: {
  index: number;
  g: Geometry;
  fabric: Fabric;
  curl: MotionValue<number>;
  turn: MotionValue<number>;
  squeeze: MotionValue<number>;
  outerFace: React.ReactNode;
  innerFace: React.ReactNode;
}) {
  const u0 = index * g.slice;
  const pose = useTransform(
    [curl, turn, squeeze] as MotionValue<number>[],
    ([c = 0, t = 0, s = 0]: number[]) =>
      poseOf(g, fabric, u0 + g.slice / 2, c, t, s),
  );
  const transform = useTransform(pose, (p) => p.transform);
  const outer = useTransform(pose, (p) => p.outer);
  const inner = useTransform(pose, (p) => p.inner);
  const gloss = useTransform(pose, (p) => p.gloss);
  // Each slice reaches SEAM past its neighbours, so the browser's
  // antialiased edges never open a gap; its strip of the band is placed at
  // the same band coordinate as theirs, and each face (strip and shade) is
  // opaque, so whichever is on top in the overlap shows the same band.
  const w = r2(g.slice + 2 * SEAM);
  return (
    <motion.div
      className="absolute [transform-style:preserve-3d]"
      style={{
        left: r2(-w / 2),
        top: -g.H / 2,
        width: w,
        height: g.H,
        transform,
      }}
    >
      <div className="absolute inset-0 overflow-clip [backface-visibility:hidden]">
        <div
          className="absolute top-0"
          style={{ left: r2(SEAM - u0), width: g.L, height: g.H }}
        >
          {outerFace}
        </div>
        <motion.div
          className="absolute inset-0 bg-black"
          style={{ opacity: outer }}
        />
        {fabric.gloss > 0 ? (
          <motion.div
            className="absolute inset-0 bg-white"
            style={{ opacity: gloss }}
          />
        ) : null}
      </div>
      <div className="absolute inset-0 [transform:rotateY(180deg)] overflow-clip [backface-visibility:hidden]">
        <div
          className="absolute top-0"
          style={{
            left: r2(SEAM + u0 + g.slice - g.L),
            width: g.L,
            height: g.H,
          }}
        >
          {innerFace}
        </div>
        <motion.div
          className="absolute inset-0 bg-black"
          style={{ opacity: inner }}
        />
      </div>
    </motion.div>
  );
}

/** A ring of the reader's ripple, in the plane of the band's print. */
function Ring({
  progress,
  motionSafe,
}: {
  progress: MotionValue<number>;
  motionSafe: boolean;
}) {
  const scale = useTransform(progress, (k) =>
    // Progress runs linearly; the ring decelerates as it spreads, like a
    // ripple, by easing its radius here rather than its clock.
    // Drawn at its widest and scaled down from there, so it stays crisp.
    motionSafe ? r3((0.5 + 1.9 * (1 - (1 - k) * (1 - k))) / 2.4) : 0.55,
  );
  const opacity = useTransform(progress, (k) =>
    k <= 0 || k >= 1
      ? 0
      : motionSafe
        ? r3(Math.min(1, 2.2 * (1 - k)))
        : r3(0.85 * Math.sin(Math.PI * k)),
  );
  return (
    <motion.span
      className="absolute -top-12 -left-12 block size-24 rounded-full border-[3px] border-signal"
      style={{ scale, opacity }}
    />
  );
}

type Said = { n: number; snapped: boolean; text: string };

type Api = {
  wrapOn: (velocity?: number, loud?: boolean) => void;
  unsnap: (loud?: boolean) => void;
  clasp: () => void;
  rest: () => void;
};

/**
 * An event wristband. Unworn it lies flat — a tail with adjustment holes, a
 * blank print panel, the event's name along the band and a snap clasp at the
 * far end. Drag it sideways and it curls round 1:1 into a 3D loop (36 flat
 * slices on a cylinder, each with an outer and an inner face, so the inside
 * of the far side shows through); past 94% the clasp catches, the ends close
 * on the fabric's spring and it snaps shut with a click, the loop tightening
 * on the recoil spring. Then the tier and the wearer's name print on behind a
 * moving print head.
 *
 * Worn, a tap holds it to a reader: it lifts on the snap spring and three
 * rings ripple out from its print panel, with a chime pitched by tier; a
 * drag turns it on the wrist and it swings back, print to the front, on
 * glide. Unsnap pops the clasp and the band falls open. The band is one real
 * button whose name says what a press does, so Enter or Space wraps it on or
 * scans it. Under reduced motion the flat and worn bands cross-fade and the
 * scan shows one ring fading in place.
 */
export function Wristband({
  name,
  event = "Admit one",
  code,
  access,
  snapped,
  defaultSnapped = false,
  onSnappedChange,
  onScan,
  fabric = "woven",
  tier = "vip",
  wrap = 0.6,
  sound = false,
  disabled = false,
  className,
}: WristbandProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const hintId = `${uid}-hint`;
  const fab = FABRICS[fabric] ?? FABRICS.woven;
  const t = TIERS[tier] ?? TIERS.vip;
  const where = access ?? t.access;
  const depth = clamp(wrap, 0, 1);
  // A band that has been worn keeps a little of the wrist's curve: off, it
  // rests bowed by as much as the loop's depth.
  const restCurl = r3(0.16 * depth);

  const [own, setOwn] = React.useState(defaultSnapped);
  const isSnapped = snapped ?? own;
  const [check, setCheck] = React.useState(0);
  const [width, setWidth] = React.useState(640);
  const [scanned, setScanned] = React.useState(0);
  const g = React.useMemo(
    () => geometryOf(width, fab.height),
    [width, fab.height],
  );

  const [said, setSaid] = React.useState<Said>({
    n: 0,
    snapped: isSnapped,
    text: "",
  });
  if (said.snapped !== isSnapped) {
    setSaid({
      n: said.n + 1,
      snapped: isSnapped,
      text: isSnapped ? `Wristband on: ${t.long}, ${name}.` : "Wristband off.",
    });
  }

  const sceneRef = React.useRef<HTMLDivElement | null>(null);
  const bandRef = React.useRef<HTMLButtonElement | null>(null);
  const anims = React.useRef(new Map<string, AnimationPlaybackControls>());
  const timers = React.useRef(new Set<number>());
  /** What the band shows: on once the clasp has caught, off once it is open. */
  const worn = React.useRef(isSnapped);
  const clasped = React.useRef(isSnapped);
  const loudClasp = React.useRef(false);
  const latched = React.useRef(false);
  const dragging = React.useRef(false);
  const dragFrom = React.useRef(0);
  const api = React.useRef<Api | null>(null);

  const curl = useMotionValue(isSnapped ? 1 : restCurl);
  const turn = useMotionValue(0);
  const squeeze = useMotionValue(0);
  const print = useMotionValue(isSnapped ? 1 : 0);
  const head = useMotionValue(0);
  const flash = useMotionValue(0);
  const glow = useMotionValue(0);
  const lift = useMotionValue(0);
  const fade = useMotionValue(1);
  const rings = [useMotionValue(0), useMotionValue(0), useMotionValue(0)];

  const elevation = lerp(4, 34, depth);
  const perspective = Math.round(lerp(2600, 520, depth));
  // The view tips down into the loop only as it closes: half wrapped, the
  // long free end swings far behind, and seen from above it would rise out
  // of the card. Flat on, it stays level.
  const group = useTransform(
    [curl, lift] as MotionValue<number>[],
    ([c = 0, l = 0]: number[]) => {
      const p = clamp(c, 0, 1);
      const tip = elevation * p * p;
      return `translateY(${r2(p * g.radius * Math.sin(tip / DEG))}px) rotateX(${r2(-tip)}deg) scale(${r3(1 + 0.05 * l)})`;
    },
  );
  // The reader's ripple sits on the print, just in front of the band.
  const chipU = g.panelU;
  const chip = useTransform(
    [curl, turn] as MotionValue<number>[],
    ([c = 0, tn = 0]: number[]) => poseOf(g, fab, chipU, c, tn, 0, 2).transform,
  );

  const run = (key: string, controls: AnimationPlaybackControls) => {
    anims.current.get(key)?.stop();
    anims.current.set(key, controls);
    return controls;
  };
  const halt = (key: string) => {
    anims.current.get(key)?.stop();
    anims.current.delete(key);
  };
  const later = (ms: number, fn: () => void) => {
    const id = window.setTimeout(() => {
      timers.current.delete(id);
      fn();
    }, ms);
    timers.current.add(id);
  };
  const pan = () => {
    const r = sceneRef.current?.getBoundingClientRect();
    return r ? panFrom(r.left + r.width / 2, null) : 0;
  };

  const report = (next: boolean) => {
    if (snapped === undefined) setOwn(next);
    else React.startTransition(() => setCheck((c) => c + 1));
    onSnappedChange?.(next);
  };

  /** Under reduced motion the two states cross-fade instead of moving. */
  const crossfade = (swap: () => void) => {
    run(
      "fade",
      animate(fade, 0, {
        duration: durations.fast,
        ease: easings.exit,
        onComplete: () => {
          swap();
          run(
            "fade",
            animate(fade, 1, { duration: durations.base, ease: easings.enter }),
          );
        },
      }),
    );
  };

  const printOn = () => {
    head.set(1);
    run(
      "print",
      animate(print, 1, {
        duration: motionSafe ? 0.6 : durations.base,
        ease: easings.move,
        onComplete: () => head.set(0),
      }),
    );
  };

  /** The clasp catches: a click, a flash on the stud, the loop tightens. */
  const clasp = () => {
    if (clasped.current) return;
    clasped.current = true;
    worn.current = true;
    if (loudClasp.current) {
      audio.play("snap", {
        pitch: fabric === "paper" ? 1.15 : fabric === "silicone" ? 0.9 : 1,
        gain: 0.6,
        pan: pan(),
      });
    }
    flash.set(1);
    run(
      "flash",
      animate(flash, 0, { duration: durations.slow, ease: easings.enter }),
    );
    if (motionSafe) {
      squeeze.set(1);
      run("squeeze", animate(squeeze, 0, springs.recoil));
    }
    if (!isSnapped) report(true);
    later(motionSafe ? 140 : 0, printOn);
  };

  const wrapOn = (velocity = 0, loud = true) => {
    if (clasped.current) return;
    loudClasp.current = loud;
    halt("turn");
    turn.set(0);
    if (!motionSafe) {
      crossfade(() => {
        halt("curl");
        curl.set(1);
        api.current?.clasp();
      });
      return;
    }
    run(
      "curl",
      animate(curl, 1, {
        ...fab.spring,
        velocity,
        onUpdate: (v) => {
          if (v >= 0.985) api.current?.clasp();
        },
        onComplete: () => api.current?.clasp(),
      }),
    );
  };

  const fallOpen = (velocity = 0) => {
    if (!motionSafe) {
      halt("curl");
      curl.set(restCurl);
      return;
    }
    run("curl", animate(curl, restCurl, { ...springs.glide, velocity }));
  };

  const unsnap = (loud = true) => {
    if (!clasped.current) return;
    clasped.current = false;
    worn.current = false;
    if (loud) audio.play("snap", { pitch: 0.78, gain: 0.5, pan: pan() });
    flash.set(1);
    run(
      "flash",
      animate(flash, 0, { duration: durations.slow, ease: easings.enter }),
    );
    head.set(0);
    run(
      "print",
      animate(print, 0, { duration: durations.base, ease: easings.exit }),
    );
    run("turn", animate(turn, 0, motionSafe ? springs.glide : { duration: 0 }));
    for (const ring of rings) ring.set(0);
    if (motionSafe) fallOpen();
    else crossfade(() => curl.set(restCurl));
    if (isSnapped) report(false);
  };

  const scan = () => {
    if (!clasped.current) return;
    audio.play("chime", { pitch: r3(t.pitch), gain: 0.5, pan: pan() });
    onScan?.();
    setScanned((n) => n + 1);
    // The print panel lights up as the reader answers.
    glow.set(1);
    run(
      "glow",
      animate(glow, 0, { duration: durations.page, ease: easings.linear }),
    );
    setSaid((s) => ({
      ...s,
      n: s.n + 1,
      text: `Scanned: ${t.long}, ${where}.`,
    }));
    if (!motionSafe) {
      const ring = rings[0];
      if (!ring) return;
      ring.set(0);
      run(
        "ring0",
        animate(ring, 1, { duration: durations.page, ease: easings.linear }),
      );
      return;
    }
    run("lift", animate(lift, 1, springs.snap));
    later(220, () => run("lift", animate(lift, 0, springs.glide)));
    rings.forEach((ring, k) => {
      ring.set(0);
      run(
        `ring${k}`,
        animate(ring, 1, {
          duration: durations.page,
          ease: easings.linear,
          delay: k * durations.fast,
        }),
      );
    });
  };

  React.useEffect(() => {
    api.current = { wrapOn, unsnap, clasp, rest: () => fallOpen() };
  });

  // The host's word wins: a refusal undoes the gesture, a change from
  // outside moves the band, silently.
  React.useEffect(() => {
    if (dragging.current || worn.current === isSnapped) return;
    if (isSnapped) api.current?.wrapOn(0, false);
    else api.current?.unsnap(false);
  }, [isSnapped, check]);

  // Disabled mid-drag, or given a new depth: an unworn band settles back to
  // its resting bow.
  React.useEffect(() => {
    if (clasped.current) return;
    if (dragging.current && !disabled) return;
    dragging.current = false;
    api.current?.rest();
  }, [disabled, restCurl]);

  React.useEffect(() => {
    const running = anims.current;
    const waiting = timers.current;
    return () => {
      for (const c of running.values()) c.stop();
      running.clear();
      for (const id of waiting) window.clearTimeout(id);
      waiting.clear();
    };
  }, []);

  // The band's length follows the scene's width, measured on arrival.
  const bindScene = React.useCallback(
    (node: HTMLDivElement | null) => {
      sceneRef.current = node;
      if (!node) return;
      const sizer = new ResizeObserver(() => {
        const w = Math.round(node.clientWidth);
        if (w > 0) setWidth(w);
      });
      sizer.observe(node);
      return () => sizer.disconnect();
    },
    [setWidth],
  );

  const perCurl = 1 / (g.L * 0.55);
  const drag = useDrag({
    axis: "x",
    threshold: 4,
    disabled,
    onStart: () => {
      dragging.current = true;
      latched.current = false;
      if (clasped.current) {
        halt("turn");
        dragFrom.current = turn.get();
      } else {
        halt("curl");
        dragFrom.current = curl.get();
      }
    },
    onMove: ({ offset }) => {
      if (latched.current) return;
      if (clasped.current) {
        const deg = dragFrom.current + (offset.x / g.radius) * DEG;
        turn.set(r2(rubberClamp(deg, -110, 110, 90)));
        return;
      }
      // Pulling the clasp end to the left wraps the band round.
      const p = dragFrom.current - offset.x * perCurl;
      if (p >= CATCH) {
        // The clasp has it: the rest of this drag is ignored, and the band
        // is no longer the finger's, so the host's answer can move it.
        latched.current = true;
        dragging.current = false;
        wrapOn(0, true);
        return;
      }
      curl.set(r3(rubberClamp(p, 0, 1, 1)));
    },
    onEnd: ({ velocity }) => {
      dragging.current = false;
      if (latched.current) return;
      if (clasped.current) {
        run(
          "turn",
          animate(
            turn,
            0,
            motionSafe
              ? { ...springs.glide, velocity: (velocity.x / g.radius) * DEG }
              : { duration: 0 },
          ),
        );
        return;
      }
      const v = -velocity.x * perCurl;
      const landing = project(curl.get(), v, 0.99);
      if (landing >= 0.5) wrapOn(v, true);
      else fallOpen(v);
    },
    onCancel: () => {
      dragging.current = false;
      if (clasped.current) run("turn", animate(turn, 0, springs.glide));
      else if (!latched.current) fallOpen();
    },
    onTap: () => {
      if (clasped.current) scan();
      else wrapOn(0, true);
    },
  });

  /* ------------------------------ the band ------------------------------ */

  const isPaper = fabric === "paper";
  const band = isPaper ? `color-mix(in oklab, ${t.band} 62%, white)` : t.band;
  const ink = isPaper ? PAPER_INK : t.print;
  const weave =
    fabric === "woven"
      ? "repeating-linear-gradient(45deg, color-mix(in oklab, black 11%, transparent) 0 1px, transparent 1px 3px), repeating-linear-gradient(-45deg, color-mix(in oklab, white 9%, transparent) 0 1px, transparent 1px 3px)"
      : fabric === "silicone"
        ? "linear-gradient(to bottom, color-mix(in oklab, white 26%, transparent), transparent 32%, transparent 64%, color-mix(in oklab, black 24%, transparent))"
        : "repeating-linear-gradient(100deg, color-mix(in oklab, white 22%, transparent) 0 0.5px, transparent 0.5px 5px), repeating-linear-gradient(12deg, color-mix(in oklab, black 6%, transparent) 0 0.5px, transparent 0.5px 7px)";
  // Holes from clear of the rounded tip to the end of the tail, 10px apart
  // at most three.
  const holeFrom = Math.round(g.H * 0.45);
  const holeTo = g.overlap - 6;
  const holeCount = clamp(Math.floor((holeTo - holeFrom) / 9) + 1, 1, 3);
  const holes = Array.from({ length: holeCount }, (_, i) =>
    Math.round(
      holeCount === 1
        ? holeFrom
        : holeFrom + ((holeTo - holeFrom) * i) / (holeCount - 1),
    ),
  );
  const patternFrom = Math.round(g.panelU + g.panel / 2 + 10);
  const patternTo = Math.round(g.L - g.overlap - 8);
  // Only as many repeats as the stretch of band can show (7px mono is about
  // 4.6px a character).
  const unit = `${event} · `;
  const repeats = Math.max(
    1,
    Math.ceil((patternTo - patternFrom) / (unit.length * 4.6)) + 1,
  );
  const motto =
    `${code ? `${code} · ` : ""}${unit.repeat(repeats)}`.toUpperCase();
  const printStyle = {
    color: ink,
    textShadow:
      fabric === "silicone"
        ? "0 0.5px 0 color-mix(in oklab, white 35%, transparent)"
        : undefined,
  };

  /**
   * The outside of the band, with only the parts a slice from `from` to `to`
   * can show: every slice carries its own copy, so a copy holds no more than
   * it needs.
   */
  const faceFor = (from: number, to: number) => {
    const meets = (a: number, b: number) => b > from && a < to;
    return (
      <div
        className="absolute inset-0 overflow-clip"
        style={{
          backgroundColor: "var(--wb-band)",
          backgroundImage: "var(--wb-weave)",
          borderRadius: `${g.H / 2}px 3px 3px ${g.H / 2}px`,
        }}
      >
        {fabric === "woven" ? (
          <>
            <span
              className="absolute inset-x-0 top-[3px] block border-t border-dashed border-white/40"
              style={{
                borderColor: "color-mix(in oklab, white 40%, transparent)",
              }}
            />
            <span
              className="absolute inset-x-0 bottom-[3px] block border-t border-dashed border-white/40"
              style={{
                borderColor: "color-mix(in oklab, white 40%, transparent)",
              }}
            />
          </>
        ) : null}
        {/* The tail: holes, or a paper band's die-cut slits. */}
        {holes
          .filter((left) => meets(left, left + 6))
          .map((left) => (
            <span
              key={left}
              className={cn(
                "absolute top-1/2 block -translate-y-1/2",
                isPaper
                  ? "h-3 w-px bg-black/45"
                  : "size-1.5 rounded-full bg-black/45",
              )}
              style={{ left }}
            />
          ))}
        {/* The print panel. */}
        {meets(g.panelU - g.panel / 2, g.panelU + g.panel / 2) ? (
          <div
            className="absolute inset-y-[5px] rounded-1 border border-dashed"
            style={{
              left: Math.round(g.panelU - g.panel / 2),
              width: g.panel,
              borderColor: `color-mix(in oklab, ${ink} 30%, transparent)`,
              background: isPaper
                ? "color-mix(in oklab, white 55%, transparent)"
                : "color-mix(in oklab, white 10%, transparent)",
            }}
          >
            <div
              className="absolute inset-0 flex items-center gap-1.5 px-1.5"
              style={{
                ...printStyle,
                clipPath: "inset(0 calc((1 - var(--wb-print)) * 100%) 0 0)",
              }}
            >
              <div className="min-w-0 flex-1 leading-none">
                <span className="block text-[11px] font-bold tracking-[0.14em]">
                  {t.label}
                </span>
                <span className="mt-0.5 block truncate font-mono text-[8px] tracking-[0.04em] uppercase">
                  {name}
                </span>
              </div>
              {g.panel >= 110 ? (
                <svg
                  width={12}
                  height={12}
                  viewBox="0 0 12 12"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.2}
                  strokeLinecap="round"
                  className="shrink-0"
                >
                  <path d="M 3 3.6 A 3.4 3.4 0 0 1 3 8.4" />
                  <path d="M 5.5 2 A 5.6 5.6 0 0 1 5.5 10" />
                  <path d="M 8 0.8 A 7.6 7.6 0 0 1 8 11.2" />
                </svg>
              ) : null}
            </div>
            <span
              className="absolute inset-0 block rounded-[inherit] bg-signal"
              style={{ opacity: "calc(var(--wb-glow) * 0.45)" }}
            />
            <span
              className="absolute inset-y-0 block w-[1.5px] bg-white"
              style={{
                left: "calc(var(--wb-print) * 100%)",
                opacity: "var(--wb-head)",
                boxShadow:
                  "0 0 4px color-mix(in oklab, white 80%, transparent)",
              }}
            />
          </div>
        ) : null}
        {/* The event, along the rest of the band. */}
        {meets(patternFrom, patternTo) ? (
          <span
            className="absolute top-1/2 block -translate-y-1/2 overflow-clip font-mono text-[7px] leading-none tracking-[0.12em] whitespace-nowrap opacity-60"
            style={{
              left: patternFrom,
              width: Math.max(0, patternTo - patternFrom),
              color: ink,
            }}
          >
            {motto}
          </span>
        ) : null}
        {/* The clasp at the far end. */}
        {meets(g.L - g.overlap, g.L) ? (
          <span
            className="absolute inset-y-px right-0 block rounded-[3px] border"
            style={{
              width: g.overlap,
              background: `linear-gradient(to bottom, color-mix(in oklab, ${CLASP} 70%, white), ${CLASP} 45%, color-mix(in oklab, ${CLASP} 82%, black))`,
              borderColor: CLASP_EDGE,
            }}
          >
            <span
              className="absolute top-1/2 left-1/2 block size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border"
              style={{
                borderColor: CLASP_EDGE,
                background: `radial-gradient(circle at 35% 35%, color-mix(in oklab, ${CLASP} 40%, white), ${CLASP} 60%, color-mix(in oklab, ${CLASP} 75%, black))`,
              }}
            />
            <span
              className="absolute top-1/2 left-1/2 block size-5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white"
              style={{ opacity: "var(--wb-flash)" }}
            />
          </span>
        ) : null}
      </div>
    );
  };

  const innerFace = (
    <div
      className="absolute inset-0"
      style={{
        backgroundColor: "var(--wb-inside)",
        backgroundImage: "var(--wb-weave)",
      }}
    />
  );

  const slices = Array.from({ length: SLICES }, (_, i) => (
    <Slice
      key={i}
      index={i}
      g={g}
      fabric={fab}
      curl={curl}
      turn={turn}
      squeeze={squeeze}
      outerFace={faceFor(i * g.slice - SEAM, (i + 1) * g.slice + SEAM)}
      innerFace={innerFace}
    />
  ));

  const bandName = `${isSnapped ? "Scan" : "Put on"} the wristband: ${t.long}, ${name}`;

  return (
    <div
      role="group"
      aria-label={`Wristband: ${event}`}
      className={cn(
        "flex w-full max-w-[45rem] flex-col gap-2 select-none",
        disabled && "opacity-50",
        className,
      )}
    >
      <button
        ref={bandRef}
        type="button"
        aria-label={bandName}
        aria-describedby={hintId}
        disabled={disabled}
        onClick={(e) => {
          // Pointer presses arrive through the drag's tap; a click with no
          // pointer behind it is Space, Enter or assistive technology.
          if (e.detail !== 0) return;
          if (clasped.current) scan();
          else wrapOn(0, true);
        }}
        {...drag}
        className={cn(
          "block w-full touch-pan-y rounded-3 outline-none",
          "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
          disabled
            ? "cursor-not-allowed"
            : "cursor-grab active:cursor-grabbing",
        )}
      >
        <motion.div
          ref={bindScene}
          aria-hidden
          className="relative w-full overflow-clip"
          style={
            {
              height: SCENE_H,
              perspective,
              opacity: fade,
              "--wb-print": print,
              "--wb-head": head,
              "--wb-flash": flash,
              "--wb-glow": glow,
              "--wb-band": band,
              "--wb-inside": `color-mix(in oklab, ${band} 78%, black)`,
              "--wb-weave": weave,
            } as unknown as React.ComponentProps<typeof motion.div>["style"]
          }
        >
          <motion.div
            className="absolute top-1/2 left-1/2 size-0 [transform-style:preserve-3d]"
            style={{ transform: group }}
          >
            {slices}
            <motion.div
              className="absolute top-0 left-0 size-0 [transform-style:preserve-3d]"
              style={{ transform: chip }}
            >
              {rings.map((ring, k) => (
                <Ring key={k} progress={ring} motionSafe={motionSafe} />
              ))}
            </motion.div>
          </motion.div>
        </motion.div>
      </button>

      <div className="flex h-8 items-center justify-between gap-3 px-1">
        {isSnapped ? (
          <p className="flex min-w-0 items-center gap-2 text-xs text-ink-2">
            <span
              aria-hidden
              className="size-2 shrink-0 rounded-full"
              style={{ background: t.band }}
            />
            <span className="min-w-0 truncate" title={`${t.long} · ${where}`}>
              <span className="font-medium text-foreground">{t.long}</span>
              {" · "}
              {where}
              {scanned > 0
                ? ` · scanned ${scanned === 1 ? "once" : `${scanned} times`}`
                : ""}
            </span>
          </p>
        ) : (
          <p className="min-w-0 truncate text-xs text-ink-3">
            Drag or tap the band to put it on
          </p>
        )}
        {isSnapped ? (
          <button
            type="button"
            disabled={disabled}
            onClick={() => {
              unsnap(true);
              bandRef.current?.focus({ preventScroll: true });
            }}
            className={cn(
              "inline-flex h-8 shrink-0 items-center rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none",
              "hover:bg-surface-2 hover:text-foreground",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
              "disabled:cursor-not-allowed disabled:opacity-50",
            )}
          >
            Unsnap
          </button>
        ) : null}
      </div>

      <span id={hintId} className="sr-only">
        {isSnapped
          ? "Press to hold it to the reader. Drag to turn it on the wrist."
          : "Drag it round to wrap it on, or press Enter."}
      </span>
      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
