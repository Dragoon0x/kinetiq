"use client";

import * as React from "react";

import {
  animate,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { useDrag } from "@/registry/lib/tactile-gesture";
import { useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type WindSockProps = {
  /** Wind speed in knots. */
  speed: number;
  /** The bearing the wind blows from, in degrees (270 is a westerly). */
  direction: number;
  /** How gusty it is, 0 to 1: how hard the sock thrashes and swells. @default 0.35 */
  gust?: number;
  /** Controlled previewed bearing, or null for the live wind. */
  value?: number | null;
  /** Initial preview when uncontrolled. @default null */
  defaultValue?: number | null;
  /** Fires from the drag, tap, key or Live press that changed the preview. */
  onValueChange?: (bearing: number | null) => void;
  /** The widget's name. @default "Wind" */
  label?: string;
  /** A whoosh as the visitor swings the sock. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

/** The picture's drawing box. */
const W = 300;
const H = 140;
/** Where the mast stands, on screen. */
const CX = 150;
const CY = 104;
/** The camera looks down 22° from the south-southwest. */
const ELEV = (22 * Math.PI) / 180;
const SE = Math.sin(ELEV);
const CE = Math.cos(ELEV);
const AZ = (24 * Math.PI) / 180;
const SA = Math.sin(AZ);
const CA = Math.cos(AZ);
/** The rose's radius, the mast's height, the sock's length and hoops. */
const RR = 92;
const HM = 62;
const LEN = 74;
const R0 = 9;
const R1 = 4.6;
const HOOPS = 6;
const POINTS = 14;
/** Knots at which each stripe lights, mouth first. */
const LIGHT_AT = [4, 7, 11, 17, 22] as const;
const GALE = 28;

const r2 = (v: number) => Math.round(v * 100) / 100;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const norm = (deg: number) => ((deg % 360) + 360) % 360;
/** The shortest turn from a to b, -180 to 180. */
const turn = (a: number, b: number) => ((((b - a) % 360) + 540) % 360) - 180;

type V3 = readonly [number, number, number];
type P2 = readonly [number, number];

/** A world point (x east, y up, z south) on screen. */
const project = ([x, y, z]: V3): P2 => {
  const xr = x * CA - z * SA;
  const zr = x * SA + z * CA;
  return [CX + xr, CY - y * CE + zr * SE];
};
/** How near the viewer a world point is. */
const depth = ([x, y, z]: V3) => (x * SA + z * CA) * CE + y * SE;

const add = (a: V3, b: V3, k = 1): V3 => [
  a[0] + b[0] * k,
  a[1] + b[1] * k,
  a[2] + b[2] * k,
];
const cross = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const unit = (a: V3): V3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

/** Smooth, seeded wander: three incommensurate sines. */
const noise = (x: number) =>
  (Math.sin(x) +
    0.6 * Math.sin(x * 2.17 + 1.3) +
    0.4 * Math.sin(x * 4.31 + 2.9)) /
  2;

function hull(points: P2[]): string {
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (pts.length < 3) return "";
  const side = (o: P2, a: P2, b: P2) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: P2[] = [];
  for (const p of pts) {
    while (
      lower.length >= 2 &&
      side(lower[lower.length - 2] as P2, lower[lower.length - 1] as P2, p) <= 0
    ) {
      lower.pop();
    }
    lower.push(p);
  }
  const upper: P2[] = [];
  for (let i = pts.length - 1; i >= 0; i -= 1) {
    const p = pts[i] as P2;
    while (
      upper.length >= 2 &&
      side(upper[upper.length - 2] as P2, upper[upper.length - 1] as P2, p) <= 0
    ) {
      upper.pop();
    }
    upper.push(p);
  }
  const ring = [...lower.slice(0, -1), ...upper.slice(0, -1)];
  return `M ${ring.map(([x, y]) => `${r2(x)} ${r2(y)}`).join(" L ")} Z`;
}

const loop = (pts: P2[]) =>
  `M ${pts.map(([x, y]) => `${r2(x)} ${r2(y)}`).join(" L ")} Z`;

type Geometry = {
  stripes: string[];
  /** Tail nearer the viewer than the mouth: draw mouth first. */
  forward: boolean;
  hoop: string;
  mouth: string;
  tail: string;
  bracket: string;
  shadow: string;
};

/**
 * The sock at a moment: six hoops along an axis that leaves the mast level
 * and sags along its length as the wind drops, each hoop wandering on smooth
 * noise that grows toward the tail and riding a ripple that runs mouth to
 * tail. The stripes are the hulls of neighbouring hoops; the shadow is every
 * hoop dropped straight onto the ground.
 */
function geometryOf(
  from: number,
  fill: number,
  speed: number,
  gust: number,
  t: number,
): Geometry {
  const to = ((from + 180) * Math.PI) / 180;
  const hx = Math.sin(to);
  const hz = -Math.cos(to);
  const across: V3 = [Math.cos(to), 0, Math.sin(to)];
  const swell = gust * Math.max(0, noise(t * 0.35 + 1.7)) ** 2 * 0.3;
  const full = clamp(fill + swell, 0, 1.12);
  const amp = (0.5 + 3.2 * gust) * (0.25 + 0.75 * clamp(fill, 0, 1));
  const w = 5 + speed * 0.28;
  // The hoop is held level by its frame; the cloth sags more along its
  // length the less wind fills it (and lifts a little past level in a swell).
  const sag = (s: number) =>
    82 * (1 - full) * Math.min(1, 0.25 + 1.4 * s) * (Math.PI / 180);
  const along = (s: number): V3 => {
    const d = s <= 0 ? 0 : sag(s);
    return [hx * Math.cos(d), -Math.sin(d), hz * Math.cos(d)];
  };

  let spine: V3 = [hx * (R0 + 1.5), HM, hz * (R0 + 1.5)];
  const rings: { centre: V3; pts: V3[] }[] = [];
  for (let k = 0; k < HOOPS; k += 1) {
    const s = k / (HOOPS - 1);
    if (k > 0)
      spine = add(spine, along((k - 0.5) / (HOOPS - 1)), LEN / (HOOPS - 1));
    const wob = s ** 1.4 * amp;
    const a1 =
      Math.sin(w * t - 1.2 * k) * 0.6 + 0.4 * noise(t * 0.9 + k * 0.37);
    const a2 =
      Math.cos(w * 0.8 * t - k + 0.6) * 0.5 +
      0.5 * noise(t * 0.7 + k * 0.53 + 3.1);
    const centre = add(add(spine, across, wob * a1), [0, 1, 0], wob * a2 * 0.7);
    const axis = along(s);
    const flat = cross(axis, [0, 1, 0]);
    const u = Math.hypot(...flat) < 0.2 ? across : unit(flat);
    const v = unit(cross(u, axis));
    const radius =
      lerp(R0, R1, s) *
      lerp(1, lerp(0.32, 1, clamp(fill, 0, 1)), s * s) *
      (1 + 0.05 * gust * Math.sin(w * 1.3 * t - k));
    const pts: V3[] = [];
    for (let i = 0; i < POINTS; i += 1) {
      const phi = (i / POINTS) * Math.PI * 2;
      pts.push(
        add(add(centre, u, radius * Math.cos(phi)), v, radius * Math.sin(phi)),
      );
    }
    rings.push({ centre, pts });
  }
  const flat = rings.map((r) => r.pts.map(project));
  const stripes: string[] = [];
  for (let k = 0; k < HOOPS - 1; k += 1) {
    stripes.push(hull([...(flat[k] ?? []), ...(flat[k + 1] ?? [])]));
  }
  const mouthRing = rings[0] as { centre: V3; pts: V3[] };
  const tailRing = rings[HOOPS - 1] as { centre: V3; pts: V3[] };
  const top = project([0, HM, 0]);
  const hub = project(mouthRing.centre);
  return {
    stripes,
    forward: depth(tailRing.centre) >= depth(mouthRing.centre),
    hoop: loop(flat[0] ?? []),
    mouth: loop(flat[0] ?? []),
    tail: loop(flat[HOOPS - 1] ?? []),
    bracket: `M ${r2(top[0])} ${r2(top[1])} L ${r2(hub[0])} ${r2(hub[1])}`,
    shadow: hull(
      rings.flatMap((r) => r.pts.map(([x, , z]) => project([x, 0, z]))),
    ),
  };
}

/** Knots to a sock fill: hanging at calm, level by fifteen knots. */
const fillOf = (kt: number) => {
  const t = clamp(kt / 15, 0, 1);
  return t * t * (3 - 2 * t);
};

const BEAUFORT: { below: number; name: string }[] = [
  { below: 1, name: "Calm" },
  { below: 4, name: "Light air" },
  { below: 7, name: "Light breeze" },
  { below: 11, name: "Gentle breeze" },
  { below: 17, name: "Moderate breeze" },
  { below: 22, name: "Fresh breeze" },
  { below: 28, name: "Strong breeze" },
  { below: 34, name: "Near gale" },
  { below: 41, name: "Gale" },
  { below: Infinity, name: "Strong gale" },
];
const forceOf = (kt: number) =>
  BEAUFORT.find((b) => kt < b.below)?.name ?? "Strong gale";

const POINTS16 = [
  ["N", "north"],
  ["NNE", "north-northeast"],
  ["NE", "northeast"],
  ["ENE", "east-northeast"],
  ["E", "east"],
  ["ESE", "east-southeast"],
  ["SE", "southeast"],
  ["SSE", "south-southeast"],
  ["S", "south"],
  ["SSW", "south-southwest"],
  ["SW", "southwest"],
  ["WSW", "west-southwest"],
  ["W", "west"],
  ["WNW", "west-northwest"],
  ["NW", "northwest"],
  ["NNW", "north-northwest"],
] as const;
const pointOf = (deg: number) =>
  POINTS16[Math.round(norm(deg) / 22.5) % 16] ?? POINTS16[0];
const bearingText = (deg: number) => {
  const b = Math.round(norm(deg)) % 360;
  return `${pointOf(b)[0]} ${String(b).padStart(3, "0")}°`;
};
const gustWord = (g: number) =>
  g < 0.25 ? "steady" : g < 0.6 ? "gusty" : "very gusty";

/** A spot on the rose, `r` from the mast, at a compass bearing. */
const onRose = (deg: number, r: number): P2 => {
  const a = (deg * Math.PI) / 180;
  return project([Math.sin(a) * r, 0, -Math.cos(a) * r]);
};

/** A weathervane hunts: it overshoots and swings back once or twice. */
const VANE = {
  type: "spring" as const,
  stiffness: 90,
  damping: 2 * 0.5 * Math.sqrt(90),
  mass: 1,
};

/*
 * Colours. The sock, the grass and the sky are a picture: token hues at
 * fixed lightness, so the stripes mean the same in either theme. Only the
 * sky leans toward the card, in oklab.
 */
const sky = (pigment: string) =>
  `color-mix(in oklab, var(--card) 22%, ${pigment})`;
const ORANGE = "oklch(from var(--warn) 0.72 0.17 calc(h - 32))";
const ORANGE_DIM = "oklch(from var(--warn) 0.56 0.05 calc(h - 32))";
const WHITE = "oklch(from var(--ink) 0.97 0.006 h)";
const WHITE_DIM = "oklch(from var(--ink) 0.7 0.01 h)";
const RED = "oklch(from var(--danger) 0.6 0.21 h)";
const INSIDE = "oklch(from var(--warn) 0.5 0.11 calc(h - 32))";
const LINE = "oklch(from var(--ink) 0.98 0.005 h / 0.72)";
const MARK = "oklch(from var(--warn) 0.88 0.16 calc(h + 8))";
const MAST = "oklch(from var(--ink) 0.36 0.012 h)";

type Api = {
  draw: (t: number) => void;
  sync: () => void;
  aimed: (deg: number) => void;
};

/**
 * A wind widget: an airfield windsock on a mast in the middle of a compass
 * rose painted on the grass, seen from a little above. The sock is six hoops
 * projected from 3D, so it points the way the wind blows in depth as well as
 * across — a northerly points it at you — and its shadow falls on the rose
 * where the downwind bearing can be read. It hangs at calm and fills toward
 * level by fifteen knots (the fill glides on the glide spring), its five
 * stripes light one by one with the Beaufort bands, and from a near gale the
 * orange turns red. While it is on screen and the wind blows, it flaps:
 * a ripple runs mouth to tail and each hoop wanders, more with `gust`.
 *
 * Dragging on the rose previews another wind: the marker on the rim follows
 * the finger 1:1, and the sock swings to it on a vane spring that hunts
 * past it before it settles. Let go and the preview snaps to 5° and stays;
 * Live, or Escape, swings it back to the real wind. The picture is a real
 * slider: arrow keys turn 5°, Page keys 45°, Home faces north. Under reduced
 * motion nothing flaps or hunts — the sock is drawn still and moves on short
 * tweens — while the stripes, the reading and the preview still change.
 */
export function WindSock({
  speed,
  direction,
  gust = 0.35,
  value,
  defaultValue = null,
  onValueChange,
  label = "Wind",
  sound = false,
  disabled = false,
  className,
}: WindSockProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const skyId = `sock-sky-${uid}`;
  const hintId = `sock-hint-${uid}`;

  const kt = clamp(Math.round(speed), 0, 99);
  const live = norm(Math.round(direction));
  const gusty = clamp(gust, 0, 1);
  const force = forceOf(kt);

  const [own, setOwn] = React.useState<number | null>(defaultValue);
  const [check, setCheck] = React.useState(0);
  const controlled = value !== undefined;
  const picked = controlled ? value : own;
  const preview =
    picked === null || !Number.isFinite(picked)
      ? null
      : norm(Math.round(picked));
  const shown = preview ?? live;

  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const announce = (text: string) => setSaid((s) => ({ n: s.n + 1, text }));
  const [seenForce, setSeenForce] = React.useState(force);
  if (seenForce !== force) {
    setSeenForce(force);
    setSaid({
      n: said.n + 1,
      text: `${label} now ${force.toLowerCase()}, ${kt} ${kt === 1 ? "knot" : "knots"} from the ${pointOf(live)[1]}.`,
    });
  }

  const aim = useMotionValue(shown);
  const heading = useMotionValue(shown);
  const fill = useMotionValue(fillOf(kt));
  const readout = useMotionValue(bearingText(shown));

  // The sock's first frame comes from React, so the server and the client
  // agree; after that the frame loop owns every path.
  const [first] = React.useState(() =>
    geometryOf(shown, fillOf(kt), kt, gusty, 0),
  );

  const svgRef = React.useRef<SVGSVGElement | null>(null);
  const paths = React.useRef(new Map<string, SVGPathElement>());
  const groups = React.useRef(new Map<string, SVGGElement>());
  const anims = React.useRef(new Map<string, AnimationPlaybackControls>());
  const raf = React.useRef(0);
  const start = React.useRef(0);
  const clock = React.useRef(0);
  const visible = React.useRef(true);
  const dragging = React.useRef(false);
  const lastPointer = React.useRef<number | null>(null);
  const swing = React.useRef({ at: 0, from: shown });
  const aimedAt = React.useRef(shown);
  const api = React.useRef<Api | null>(null);

  const run = (key: string, controls: AnimationPlaybackControls) => {
    anims.current.get(key)?.stop();
    anims.current.set(key, controls);
  };

  const draw = (t: number) => {
    const g = geometryOf(heading.get(), fill.get(), kt, gusty, t);
    const set = (key: string, d: string) =>
      paths.current.get(key)?.setAttribute("d", d);
    const order = g.forward ? "fwd" : "rev";
    const other = g.forward ? "rev" : "fwd";
    groups.current.get(order)?.setAttribute("visibility", "visible");
    groups.current.get(other)?.setAttribute("visibility", "hidden");
    g.stripes.forEach((d, k) => set(`${order}-${k}`, d));
    set("hoop-back", g.forward ? g.hoop : "");
    set("hoop-front", g.forward ? "" : g.hoop);
    set("mouth", g.forward ? "" : g.mouth);
    set("tail", g.forward ? g.tail : "");
    set("bracket", g.bracket);
    set("shadow", g.shadow);
  };

  const flapping = () =>
    motionSafe && kt >= 1 && visible.current && !document.hidden;

  /** Starts or stops the flap loop to match what is on screen. */
  const sync = () => {
    if (flapping()) {
      if (raf.current) return;
      start.current = -1;
      const frame = (now: number) => {
        // The clock resumes where it stopped, so the sock never jumps.
        if (start.current < 0) start.current = now - clock.current * 1000;
        clock.current = (now - start.current) / 1000;
        api.current?.draw(clock.current);
        raf.current = window.requestAnimationFrame(frame);
      };
      raf.current = window.requestAnimationFrame(frame);
    } else if (raf.current) {
      window.cancelAnimationFrame(raf.current);
      raf.current = 0;
    }
  };

  /** The marker moved: the sock swings after it, and is heard when it swings far. */
  const aimed = (deg: number) => {
    if (motionSafe) {
      run(
        "heading",
        animate(heading, deg, { ...VANE, velocity: heading.getVelocity() }),
      );
    } else {
      run(
        "heading",
        animate(heading, deg, {
          duration: durations.base,
          ease: easings.enter,
        }),
      );
    }
  };

  React.useEffect(() => {
    api.current = { draw, sync, aimed };
  });

  React.useEffect(
    () => aim.on("change", (deg) => api.current?.aimed(deg)),
    [aim],
  );

  // The sock's parts, found once: the frame loop writes them directly.
  React.useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const found = paths.current;
    const sets = groups.current;
    for (const node of svg.querySelectorAll<SVGElement>("[data-part]")) {
      const key = node.dataset.part ?? "";
      if (node instanceof SVGPathElement) found.set(key, node);
      else if (node instanceof SVGGElement) sets.set(key, node);
    }
    return () => {
      found.clear();
      sets.clear();
    };
  }, []);

  // Without the loop, a moving heading or fill still redraws.
  React.useEffect(() => {
    const redraw = () => {
      if (!raf.current) api.current?.draw(clock.current);
    };
    const offHeading = heading.on("change", redraw);
    const offFill = fill.on("change", redraw);
    return () => {
      offHeading();
      offFill();
    };
  }, [heading, fill]);

  React.useEffect(() => {
    api.current?.sync();
    if (!raf.current) api.current?.draw(clock.current);
  }, [motionSafe, kt, gusty]);

  React.useEffect(() => {
    run(
      "fill",
      animate(
        fill,
        fillOf(kt),
        motionSafe ? springs.glide : { duration: durations.base },
      ),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kt, motionSafe]);

  // Where the host says the wind is shown. The marker glides there, and the
  // sock hunts after it.
  React.useEffect(() => {
    if (dragging.current) return;
    const from = aim.get();
    const target = from + turn(from, shown);
    if (Math.abs(target - from) < 0.01 && aimedAt.current === shown) return;
    aimedAt.current = shown;
    readout.set(bearingText(shown));
    run(
      "aim",
      animate(
        aim,
        target,
        motionSafe ? springs.glide : { duration: durations.fast },
      ),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown, check]);

  React.useEffect(() => {
    const onVisibility = () => api.current?.sync();
    document.addEventListener("visibilitychange", onVisibility);
    const running = anims.current;
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      if (raf.current) window.cancelAnimationFrame(raf.current);
      raf.current = 0;
      for (const c of running.values()) c.stop();
      running.clear();
    };
  }, []);

  const bindRoot = React.useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      visible.current = Boolean(entry?.isIntersecting);
      api.current?.sync();
    });
    watcher.observe(node);
    return () => watcher.disconnect();
  }, []);

  /** A whoosh when the sock is swung far: a stronger wind is a higher one. */
  const whoosh = (deg: number, always = false) => {
    const now = performance.now();
    const far = Math.abs(deg - swing.current.from) >= 45;
    if (!always && !far) return;
    if (now - swing.current.at < 220) return;
    swing.current = { at: now, from: deg };
    audio.play("whoosh", {
      pitch: r2(0.8 + Math.min(0.9, kt / 40)),
      gain: r2(0.35 + 0.25 * gusty),
    });
  };

  const commit = (next: number | null, via: "pointer" | "key") => {
    const target = next ?? live;
    const from = aim.get();
    aimedAt.current = target;
    readout.set(bearingText(target));
    run(
      "aim",
      animate(
        aim,
        from + turn(from, target),
        motionSafe ? springs.snap : { duration: durations.fast },
      ),
    );
    whoosh(target, true);
    if (next !== picked) {
      if (!controlled) setOwn(next);
      onValueChange?.(next);
      // A controlled host answers on its own schedule; once it has had its
      // turn, a host that refused gets its own value back.
      if (controlled) React.startTransition(() => setCheck((c) => c + 1));
    }
    if (via === "pointer") {
      announce(
        next === null
          ? `Live wind: ${kt} ${kt === 1 ? "knot" : "knots"} from the ${pointOf(live)[1]}, ${live} degrees.`
          : `Preview: wind from the ${pointOf(next)[1]}, ${next} degrees.`,
      );
    }
  };

  /** The compass bearing under a pointer, and how far out on the rose it is. */
  const bearingAt = (clientX: number, clientY: number) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return null;
    const xr = ((clientX - rect.left) / rect.width) * W - CX;
    const zr = (((clientY - rect.top) / rect.height) * H - CY) / SE;
    const x = xr * CA + zr * SA;
    const z = -xr * SA + zr * CA;
    return {
      deg: norm((Math.atan2(x, -z) * 180) / Math.PI),
      r: Math.hypot(x, z),
    };
  };

  const drag = useDrag({
    threshold: 3,
    disabled,
    onStart: ({ point }) => {
      dragging.current = true;
      anims.current.get("aim")?.stop();
      const at = bearingAt(point.x, point.y);
      lastPointer.current = at?.deg ?? null;
      swing.current = { at: 0, from: aim.get() };
      if (at && at.r > 10) {
        const from = aim.get();
        aim.set(from + turn(from, at.deg));
      }
    },
    onMove: ({ point }) => {
      const at = bearingAt(point.x, point.y);
      if (!at || at.r < 10) return;
      const prev = lastPointer.current;
      lastPointer.current = at.deg;
      const next =
        prev === null
          ? aim.get() + turn(aim.get(), at.deg)
          : aim.get() + turn(prev, at.deg);
      aim.set(r2(next));
      readout.set(bearingText(next));
      whoosh(next);
    },
    onEnd: () => {
      dragging.current = false;
      lastPointer.current = null;
      commit((Math.round(norm(aim.get()) / 5) * 5) % 360, "pointer");
    },
    onCancel: () => {
      // A lost pointer is not a choice: the marker goes back, quietly.
      dragging.current = false;
      lastPointer.current = null;
      const from = aim.get();
      readout.set(bearingText(shown));
      run(
        "aim",
        animate(
          aim,
          from + turn(from, shown),
          motionSafe ? springs.snap : { duration: durations.fast },
        ),
      );
    },
    onTap: (event) => {
      const at = bearingAt(event.clientX, event.clientY);
      if (!at) return;
      if (at.r < 14) commit(null, "pointer");
      else commit((Math.round(at.deg / 5) * 5) % 360, "pointer");
    },
  });

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    let next: number | null;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowUp":
        next = norm(shown + 5);
        break;
      case "ArrowLeft":
      case "ArrowDown":
        next = norm(shown - 5);
        break;
      case "PageUp":
        next = norm(shown + 45);
        break;
      case "PageDown":
        next = norm(shown - 45);
        break;
      case "Home":
        next = 0;
        break;
      case "Escape":
        // Handled only when there is a preview to leave; otherwise the
        // Escape belongs to whatever holds the widget.
        if (preview === null) return;
        next = null;
        break;
      default:
        return;
    }
    event.preventDefault();
    if (next === preview) return;
    commit(next, "key");
  };

  const marker = useTransform(aim, (deg) => {
    const tip = onRose(deg, RR * 0.8);
    const a = onRose(deg - 5, RR * 0.98);
    const b = onRose(deg + 5, RR * 0.98);
    return `M ${r2(tip[0])} ${r2(tip[1])} L ${r2(a[0])} ${r2(a[1])} L ${r2(b[0])} ${r2(b[1])} Z`;
  });
  const ghost = (() => {
    const tip = onRose(live, RR * 0.8);
    const a = onRose(live - 5, RR * 0.98);
    const b = onRose(live + 5, RR * 0.98);
    return `M ${r2(tip[0])} ${r2(tip[1])} L ${r2(a[0])} ${r2(a[1])} L ${r2(b[0])} ${r2(b[1])} Z`;
  })();

  const rose = React.useMemo(() => {
    const ring = (r: number) => {
      const pts: P2[] = [];
      for (let i = 0; i < 48; i += 1) pts.push(onRose(i * 7.5, r));
      return loop(pts);
    };
    const ticks: string[] = [];
    for (let i = 0; i < 16; i += 1) {
      const deg = i * 22.5;
      const inner = i % 4 === 0 ? 0.62 : i % 2 === 0 ? 0.7 : 0.76;
      const a = onRose(deg, RR * inner);
      const b = onRose(deg, RR * 0.62);
      const c = onRose(deg, RR);
      const d = onRose(deg, RR * (i % 4 === 0 ? 0.9 : 0.94));
      ticks.push(
        `M ${r2(c[0])} ${r2(c[1])} L ${r2(d[0])} ${r2(d[1])}`,
        i % 4 === 0
          ? ""
          : `M ${r2(a[0])} ${r2(a[1])} L ${r2(b[0])} ${r2(b[1])}`,
      );
    }
    const letters = (["N", "E", "S", "W"] as const).map((n, i) => {
      const [x, y] = onRose(i * 90, RR * 0.76);
      return { n, x: r2(x), y: r2(y) };
    });
    return {
      outer: ring(RR),
      inner: ring(RR * 0.62),
      ticks: ticks.filter(Boolean).join(" "),
      letters,
    };
  }, []);

  const lit = LIGHT_AT.map((at) => kt >= at);
  const stripeFill = (k: number) => {
    const orange = k % 2 === 0;
    if (!lit[k]) return orange ? ORANGE_DIM : WHITE_DIM;
    if (orange && kt >= GALE) return RED;
    return orange ? ORANGE : WHITE;
  };
  const stripe = (order: "fwd" | "rev", k: number) => (
    <path
      key={`${order}-${k}`}
      data-part={`${order}-${k}`}
      d={first.stripes[k]}
      className="transition-[fill] duration-300"
      style={{
        fill: stripeFill(k),
        transitionDelay: `${k * 60}ms`,
      }}
    />
  );
  const top = project([0, HM, 0]);
  const foot = project([0, 0, 0]);
  const valueText = `${shown} degrees, ${pointOf(shown)[1]}, ${
    preview === null
      ? `live wind, ${kt} ${kt === 1 ? "knot" : "knots"}`
      : "preview"
  }`;

  return (
    <div
      ref={bindRoot}
      role="group"
      aria-label={label}
      className={cn(
        "w-full max-w-[300px] overflow-clip rounded-4 border border-hairline bg-card text-foreground",
        disabled && "opacity-60",
        className,
      )}
    >
      <div
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label={`${label} direction preview`}
        aria-describedby={hintId}
        aria-valuemin={0}
        aria-valuemax={359}
        aria-valuenow={shown}
        aria-valuetext={valueText}
        aria-disabled={disabled || undefined}
        onKeyDown={onKeyDown}
        {...drag}
        className={cn(
          "relative block touch-none rounded-t-[15px] outline-none select-none [-webkit-touch-callout:none]",
          "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
          disabled
            ? "cursor-not-allowed"
            : "cursor-grab active:cursor-grabbing",
        )}
      >
        <svg
          ref={svgRef}
          aria-hidden
          width={W}
          height={H}
          viewBox={`0 0 ${W} ${H}`}
          className="block h-auto w-full"
        >
          <defs>
            <linearGradient id={skyId} x1={0} y1={0} x2={0} y2={1}>
              <stop
                offset={0}
                style={{
                  stopColor: sky(
                    "oklch(from var(--accent-bright) 0.72 0.09 calc(h - 30))",
                  ),
                }}
              />
              <stop
                offset={1}
                style={{
                  stopColor: sky(
                    "oklch(from var(--accent-bright) 0.92 0.03 calc(h - 40))",
                  ),
                }}
              />
            </linearGradient>
          </defs>
          <rect x={0} y={0} width={W} height={58} fill={`url(#${skyId})`} />
          <path
            d="M0 58 L0 52 Q14 46 26 51 Q40 44 54 50 L66 50 L66 45 L92 45 L92 51 Q130 47 170 52 Q214 45 246 51 L254 51 L254 47 L276 47 L276 52 Q290 49 300 52 L300 58 Z"
            style={{
              fill: "oklch(from var(--success) 0.44 0.06 calc(h - 15))",
            }}
          />
          <rect
            x={0}
            y={58}
            width={W}
            height={H - 58}
            style={{
              fill: "oklch(from var(--success) 0.58 0.09 calc(h - 25))",
            }}
          />
          <rect
            x={0}
            y={58}
            width={W}
            height={10}
            style={{
              fill: "oklch(from var(--success) 0.64 0.07 calc(h - 25))",
            }}
          />

          <g fill="none" strokeLinecap="round" style={{ stroke: LINE }}>
            <path d={rose.outer} strokeWidth={1.4} />
            <path d={rose.inner} strokeWidth={1} />
            <path d={rose.ticks} strokeWidth={1.2} />
          </g>
          <g
            className="font-mono"
            fontSize={9}
            fontWeight={600}
            textAnchor="middle"
            dominantBaseline="central"
            style={{ fill: LINE }}
          >
            {rose.letters.map((l) => (
              <text key={l.n} x={l.x} y={l.y}>
                {l.n}
              </text>
            ))}
          </g>
          {preview !== null ? (
            <path
              d={ghost}
              fill="none"
              strokeWidth={1}
              strokeLinejoin="round"
              style={{ stroke: MARK }}
            />
          ) : null}
          <motion.path
            d={marker}
            strokeWidth={0.8}
            strokeLinejoin="round"
            style={{ fill: MARK, stroke: MAST }}
          />

          <path
            data-part="shadow"
            d={first.shadow}
            style={{ fill: "oklch(from var(--ink) 0.2 0.02 h / 0.2)" }}
          />
          <ellipse
            cx={foot[0]}
            cy={foot[1]}
            rx={4}
            ry={1.6}
            style={{ fill: "oklch(from var(--ink) 0.2 0.02 h / 0.3)" }}
          />
          <line
            x1={foot[0]}
            y1={foot[1]}
            x2={r2(top[0])}
            y2={r2(top[1])}
            strokeWidth={1.8}
            strokeLinecap="round"
            style={{ stroke: MAST }}
          />
          <path
            data-part="bracket"
            d={first.bracket}
            strokeWidth={1.4}
            strokeLinecap="round"
            style={{ stroke: MAST }}
          />
          <path
            data-part="hoop-back"
            d={first.forward ? first.hoop : ""}
            fill="none"
            strokeWidth={1.2}
            style={{ stroke: MAST }}
          />
          <g
            fill="none"
            strokeWidth={0.5}
            strokeLinejoin="round"
            style={{ stroke: "oklch(from var(--ink) 0.3 0.02 h / 0.4)" }}
          >
            <g
              data-part="fwd"
              visibility={first.forward ? "visible" : "hidden"}
            >
              {[0, 1, 2, 3, 4].map((k) => stripe("fwd", k))}
            </g>
            <g
              data-part="rev"
              visibility={first.forward ? "hidden" : "visible"}
            >
              {[4, 3, 2, 1, 0].map((k) => stripe("rev", k))}
            </g>
          </g>
          <path
            data-part="tail"
            d={first.forward ? first.tail : ""}
            style={{ fill: INSIDE }}
          />
          <path
            data-part="mouth"
            d={first.forward ? "" : first.mouth}
            style={{ fill: INSIDE }}
          />
          <path
            data-part="hoop-front"
            d={first.forward ? "" : first.hoop}
            fill="none"
            strokeWidth={1.2}
            style={{ stroke: MAST }}
          />
          <circle
            cx={r2(top[0])}
            cy={r2(top[1])}
            r={1.8}
            style={{ fill: MAST }}
          />
        </svg>
      </div>

      <div className="flex items-center justify-between gap-3 px-3 py-2.5">
        <div className="min-w-0">
          <p className="font-mono text-2xl leading-none text-foreground tabular-nums">
            {kt}
            <span className="ml-1 text-xs text-ink-3">kt</span>
          </p>
          <p
            className="mt-1 truncate text-xs text-ink-3"
            title={`${force}, ${gustWord(gusty)}`}
          >
            {force} · {gustWord(gusty)}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <span
            aria-hidden
            className="inline-flex h-6 items-center gap-1.5 rounded-full border border-hairline bg-surface-2 px-2 font-mono text-[11px] text-foreground tabular-nums"
          >
            <span
              className={cn(
                "size-1.5 shrink-0 rounded-full",
                preview === null ? "bg-signal" : "border border-ink-3",
              )}
            />
            <motion.span>{readout}</motion.span>
          </span>
          {preview === null ? null : (
            <motion.button
              type="button"
              disabled={disabled}
              aria-label={`Back to the live wind, ${bearingText(live)}`}
              onClick={() => commit(null, "pointer")}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: durations.base, ease: easings.enter }}
              className={cn(
                "inline-flex h-6 shrink-0 cursor-pointer items-center rounded-full border border-hairline px-2.5 text-[11px] font-medium text-foreground transition-colors outline-none",
                "hover:bg-surface-2",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
                "disabled:cursor-not-allowed",
              )}
            >
              Live
            </motion.button>
          )}
        </div>
      </div>

      <p id={hintId} className="sr-only">
        Drag round the compass, or use the arrow keys, to preview the sock in
        another wind. Escape returns to the live wind.
      </p>
      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
