"use client";

import * as React from "react";

import {
  animate,
  motion,
  useMotionValue,
  type AnimationPlaybackControls,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type SlateCoursesCut = "square" | "round" | "point";

export type SlateCoursesProps = {
  /** The words painted across the roof. Also the heading assistive technology reads. @default "Fieldline Farm Stays" */
  headline?: string;
  /** The element that carries the headline for assistive technology. @default "h2" */
  as?: "h1" | "h2" | "h3";
  /** The picture the slates are cut from. @default a drawn farm valley at evening */
  src?: string;
  /** What the picture shows, for assistive technology. @default a description of the drawn valley */
  alt?: string;
  /** How many courses the roof has, 4 (a few big slates) to 10 (many small ones). @default 7 */
  courses?: number;
  /** How much of each slate the course above covers, 0.2 (a long exposed tail) to 0.6 (a deep lap). @default 0.4 */
  overlap?: number;
  /** How far apart the slates of a course land, 0 (together) to 1 (one by one across). @default 0.5 */
  stagger?: number;
  /** The shape of each slate's tail. @default "square" */
  cut?: SlateCoursesCut;
  /** How many courses are on before any scroll, 0 to 3. @default 2 */
  startCourses?: number;
  /** The colour of the sign paint, a concrete CSS colour (the paint is an image, so not a var). @default "oklch(0.97 0.01 90)" */
  paint?: string;
  /** Scroll distance for the whole roof, px. @default 900 */
  range?: number;
  /** Height of the pinned stage, px. Give it the height of the scroll container it sits in. @default 520 */
  height?: number;
  /** Play a clack as each slate lands. Off unless asked for. @default false */
  sound?: boolean;
  /** Fires with the number of whole courses laid, from the scroll or key that changed it. */
  onCoursesChange?: (laid: number) => void;
  /** Fires as the roof is laid, 0 to 1. */
  onProgressChange?: (progress: number) => void;
  className?: string;
};

/* ---------------------------------- art ---------------------------------- */

const ART_W = 1200;
const ART_H = 800;

const VALLEY = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${ART_W}" height="${ART_H}" viewBox="0 0 ${ART_W} ${ART_H}">
<defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="rgb(46,62,104)"/><stop offset="0.45" stop-color="rgb(150,120,150)"/><stop offset="0.7" stop-color="rgb(236,170,120)"/><stop offset="0.82" stop-color="rgb(246,206,150)"/></linearGradient>
<radialGradient id="g" cx="0.62" cy="0.7" r="0.5"><stop offset="0" stop-color="rgb(255,226,170)" stop-opacity="0.85"/><stop offset="1" stop-color="rgb(255,226,170)" stop-opacity="0"/></radialGradient></defs>
<rect width="${ART_W}" height="${ART_H}" fill="url(#s)"/><rect width="${ART_W}" height="${ART_H}" fill="url(#g)"/>
<circle cx="760" cy="540" r="52" fill="rgb(255,232,186)"/>
<path d="M0 520 C 160 470 300 480 440 510 C 560 536 640 500 760 520 C 900 544 1040 500 1200 492 L1200 800 L0 800Z" fill="rgb(116,92,120)"/>
<path d="M0 590 C 200 556 380 570 560 596 C 720 618 900 580 1200 586 L1200 800 L0 800Z" fill="rgb(84,96,82)"/>
${Array.from({ length: 9 }, (_, i) => `<path d="M${i * 150 - 40} 800 L${560 + i * 10} 600" stroke="rgb(108,124,86)" stroke-width="3" opacity="0.6"/>`).join("")}
<path d="M0 680 C 240 650 520 664 760 690 C 920 706 1080 690 1200 684 L1200 800 L0 800Z" fill="rgb(64,80,60)"/>
<path d="M520 800 C 560 720 620 670 700 640" stroke="rgb(206,186,150)" stroke-width="14" fill="none"/>
<rect x="760" y="610" width="120" height="70" fill="rgb(222,204,178)"/><path d="M748 612 L820 566 L892 612Z" fill="rgb(92,52,48)"/>
<rect x="780" y="632" width="18" height="16" fill="rgb(255,214,140)"/><rect x="842" y="632" width="18" height="16" fill="rgb(255,214,140)"/><rect x="812" y="650" width="16" height="30" fill="rgb(90,64,50)"/>
${[100, 170, 240, 960, 1030, 1110, 1160]
  .map(
    (x, i) =>
      `<rect x="${x - 4}" y="${640 + (i % 3) * 10}" width="8" height="40" fill="rgb(44,36,36)"/><circle cx="${x}" cy="${620 + (i % 3) * 10}" r="${34 + (i % 2) * 10}" fill="rgb(${46 + i * 3},${58 + i * 2},${46 + i * 2})"/>`,
  )
  .join("")}
${Array.from({ length: 18 }, (_, i) => `<circle cx="${(i * 131) % 1200}" cy="${40 + ((i * 47) % 200)}" r="${i % 3 ? 1.4 : 2}" fill="rgb(250,246,236)" opacity="0.7"/>`).join("")}
</svg>`,
)}`;

const DEFAULT_ALT =
  "A farm valley at evening: a low sun over purple hills, green fields, a farmhouse with lit windows and a lane between trees.";

/* -------------------------------- geometry -------------------------------- */

const RIDGE = 14;
const GUTTER = 10;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const r2 = (v: number) => Math.round(v * 100) / 100;

/** A small seeded hash for each slate's flight. */
const hash = (a: number, b: number) => {
  let h = Math.imul(a + 1, 0x9e3779b1) ^ Math.imul(b + 7, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

type Layout = {
  W: number;
  roofH: number;
  C: number;
  S: number;
  h: number;
  sh: number;
  sw: number;
  start: number;
  windowW: number;
  stagger: number;
};

function layoutOf(
  W: number,
  H: number,
  courses: number,
  overlap: number,
  stagger: number,
  startCourses: number,
): Layout {
  const roofH = Math.max(80, H - RIDGE - GUTTER);
  const C = clamp(Math.round(courses), 4, 10);
  const h = roofH / C;
  const sh = h / (1 - clamp(overlap, 0.2, 0.6));
  const sw = Math.max(24, sh * 0.56);
  const S = Math.ceil(W / sw) + 1;
  const start = clamp(Math.round(startCourses), 0, 3);
  return {
    W,
    roofH,
    C,
    S,
    h,
    sh,
    sw,
    start,
    windowW: 0.9 / Math.max(1, C - start),
    stagger: clamp(stagger, 0, 1),
  };
}

/** The scroll progress at which slate o of course k lands. */
const thresholdOf = (L: Layout, k: number, o: number) =>
  k < L.start
    ? -1
    : 0.02 +
      (k - L.start) * L.windowW +
      (o / L.S) * L.stagger * L.windowW * 0.9;

/** How many slates are on at progress p (thresholds rise with the order). */
const laidAt = (L: Layout, p: number) => {
  let n = 0;
  for (let k = 0; k < L.C; k += 1) {
    for (let o = 0; o < L.S; o += 1) {
      if (thresholdOf(L, k, o) <= p) n += 1;
      else return n;
    }
  }
  return n;
};

/** The headline painted across the roof, as an SVG the slates share. */
function paintOf(text: string, W: number, H: number, colour: string) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const chars = text.trim().length;
  const single = Math.min((0.86 * W) / Math.max(1, chars * 0.6), H * 0.2);
  let lines: string[] = [text.trim()];
  let fs = single;
  if (single < H * 0.09 && words.length > 1) {
    let best = 1;
    let bestDiff = Infinity;
    for (let i = 1; i < words.length; i += 1) {
      const a = words.slice(0, i).join(" ").length;
      const b = words.slice(i).join(" ").length;
      if (Math.abs(a - b) < bestDiff) {
        bestDiff = Math.abs(a - b);
        best = i;
      }
    }
    lines = [words.slice(0, best).join(" "), words.slice(best).join(" ")];
    const longest = Math.max(...lines.map((l) => l.length));
    fs = Math.min((0.86 * W) / Math.max(1, longest * 0.6), H * 0.15);
  }
  const lh = fs * 1.08;
  const top = H * 0.44 - (lh * lines.length) / 2;
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const textEls = lines
    .map((line, i) => {
      const y = r2(top + lh * (i + 0.82));
      const len = r2(Math.min(0.86 * W, line.length * fs * 0.6));
      const attrs = `x="${r2(W / 2)}" text-anchor="middle" textLength="${len}" lengthAdjust="spacingAndGlyphs" font-family="ui-sans-serif, system-ui, sans-serif" font-weight="800" font-size="${r2(fs)}" letter-spacing="${r2(fs * 0.04)}"`;
      return `<text ${attrs} y="${r2(y + fs * 0.05)}" fill="rgb(0,0,0)" fill-opacity="0.35">${esc(line.toUpperCase())}</text><text ${attrs} y="${y}" fill="${colour}" fill-opacity="0.94">${esc(line.toUpperCase())}</text>`;
    })
    .join("");
  return {
    lines,
    fs: r2(fs),
    top: r2(top),
    lh: r2(lh),
    uri: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(W)}" height="${Math.round(H)}" viewBox="0 0 ${Math.round(W)} ${Math.round(H)}" preserveAspectRatio="none">${textEls}</svg>`,
    )}`,
  };
}

/** The nearest ancestor that scrolls vertically, or null for the page. */
function scrollParent(node: HTMLElement): HTMLElement | null {
  for (let el = node.parentElement; el; el = el.parentElement) {
    if (/(auto|scroll|overlay)/.test(getComputedStyle(el).overflowY)) {
      return el;
    }
  }
  return null;
}

/* ---------------------------------- slate ---------------------------------- */

type SlateProps = {
  k: number;
  o: number;
  x: number;
  y: number;
  w: number;
  h: number;
  laid: boolean;
  delay: number;
  cut: SlateCoursesCut;
  background: string;
  motionSafe: boolean;
  onLand: (x: number, first: boolean) => void;
};

/** The pose a slate waits in, above the roof and toward you. */
const liftedOf = (k: number, o: number) => {
  const a = hash(k, o);
  const b = hash(o, k + 31);
  return {
    x: r2((a - 0.5) * 36),
    y: r2(-46 - b * 46),
    rotate: r2((a - 0.5) * 16),
    scale: 1.3,
  };
};

function Slate({
  k,
  o,
  x,
  y,
  w,
  h,
  laid,
  delay,
  cut,
  background,
  motionSafe,
  onLand,
}: SlateProps) {
  const lift = liftedOf(k, o);
  const mx = useMotionValue(laid ? 0 : lift.x);
  const my = useMotionValue(laid ? 0 : lift.y);
  const ms = useMotionValue(laid ? 1 : lift.scale);
  const mr = useMotionValue(laid ? 0 : lift.rotate);
  const mo = useMotionValue(laid ? 1 : 0);
  const land = React.useRef(onLand);
  React.useEffect(() => {
    land.current = onLand;
  });

  React.useEffect(() => {
    const running: AnimationPlaybackControls[] = [];
    let timer: number | null = null;
    if (laid) {
      if (mo.get() >= 0.999 && Math.abs(my.get()) < 0.01) return;
      if (!motionSafe) {
        mx.jump(0);
        my.jump(0);
        ms.jump(1);
        mr.jump(0);
        running.push(
          animate(mo, 1, {
            duration: durations.fast,
            ease: easings.enter,
            delay,
          }),
        );
        timer = window.setTimeout(
          () => land.current(x + w / 2, o === 0),
          Math.round(delay * 1000),
        );
      } else {
        // The travel glides in; the scale lands on recoil — the settle.
        running.push(
          animate(mo, 1, {
            duration: durations.fast,
            ease: easings.enter,
            delay,
          }),
          animate(mx, 0, { ...springs.glide, delay }),
          animate(my, 0, { ...springs.glide, delay }),
          animate(mr, 0, { ...springs.glide, delay }),
          animate(ms, 1, { ...springs.recoil, delay: delay + 0.04 }),
        );
        timer = window.setTimeout(
          () => land.current(x + w / 2, true),
          Math.round((delay + 0.16) * 1000),
        );
      }
    } else {
      if (mo.get() <= 0.001) return;
      const exit = { ...exitFor(durations.base), delay };
      if (!motionSafe) {
        running.push(animate(mo, 0, exit));
      } else {
        running.push(
          animate(mo, 0, exit),
          animate(mx, lift.x, exit),
          animate(my, lift.y, exit),
          animate(mr, lift.rotate, exit),
          animate(ms, lift.scale, exit),
        );
      }
    }
    return () => {
      for (const r of running) r.stop();
      if (timer !== null) window.clearTimeout(timer);
    };
    // The pose is fixed for a slate; only laying and lifting animate.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [laid, motionSafe]);

  const shade = hash(k * 7 + o, 3) - 0.5;
  const tone =
    shade > 0
      ? `color-mix(in oklab, white ${Math.round(shade * 16)}%, transparent)`
      : `color-mix(in oklab, black ${Math.round(-shade * 22)}%, transparent)`;
  const clip =
    cut === "point"
      ? "polygon(0 0, 100% 0, 100% 82%, 50% 100%, 0 82%)"
      : undefined;
  const radius = cut === "round" ? "3px 3px 50% 50% / 3px 3px 22% 22%" : "2px";

  return (
    <motion.div
      aria-hidden
      className="absolute overflow-hidden shadow-[0_4px_6px_color-mix(in_oklab,black_52%,transparent)]"
      style={{
        left: r2(x + 1),
        top: r2(y),
        width: r2(w - 2),
        height: r2(h),
        zIndex: k + 2,
        borderRadius: radius,
        clipPath: clip,
        backgroundImage: "var(--slate-paint), var(--slate-picture)",
        backgroundSize: background.split("|")[0],
        backgroundPosition: background.split("|")[1],
        backgroundRepeat: "no-repeat",
        x: mx,
        y: my,
        scale: ms,
        rotate: mr,
        opacity: mo,
      }}
    >
      {/* Each stone is its own: a shade lighter or darker, a bevelled tail. */}
      <span
        className="absolute inset-0 shadow-[inset_0_-1.5px_0_color-mix(in_oklab,white_22%,transparent),inset_0_1px_0_color-mix(in_oklab,black_30%,transparent)]"
        style={{
          backgroundColor: tone,
          backgroundImage:
            "linear-gradient(160deg, color-mix(in oklab, white 12%, transparent), transparent 40%, color-mix(in oklab, black 24%, transparent))",
          borderRadius: radius,
        }}
      />
    </motion.div>
  );
}

/* -------------------------------- component -------------------------------- */

/**
 * A roof, face on — dark felt crossed by battens, a ridge board and a gutter,
 * with the headline chalked on the felt in setting-out lines — that a roofer
 * slates as the page scrolls. Slates fly in from above and toward you and lay
 * themselves in courses from the eaves up, each course lapping the head of
 * the one below and breaking joint with it by half a slate, working left to
 * right on one course and right to left on the next. Every slate is a tile of
 * one picture with the headline painted across the whole roof, so the
 * picture and the lettering read only across the exposed bands, and only
 * once the courses are on. A slate's travel glides in and its scale lands on
 * the recoil spring — a small settle — with a clack if `sound` is on; when the
 * last course is laid a slow sheen crosses the roof. Scrolling back lifts
 * them off, top course first, on exit tweens.
 *
 * The stage is focusable: Down, Page Down and Space lay the next course, Up
 * and Page Up lift the top one, Home and End lift all or lay all. Under
 * reduced motion slates appear in place, course by course, on a fade.
 */
export function SlateCourses({
  headline = "Fieldline Farm Stays",
  as = "h2",
  src,
  alt = DEFAULT_ALT,
  courses = 7,
  overlap = 0.4,
  stagger = 0.5,
  cut = "square",
  startCourses = 2,
  paint = "oklch(0.97 0.01 90)",
  range = 900,
  height = 520,
  sound = false,
  onCoursesChange,
  onProgressChange,
  className,
}: SlateCoursesProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const Heading = as;
  const span = clamp(range, 200, 4000);
  const picture = src ?? VALLEY;

  const [W, setW] = React.useState(760);
  const L = layoutOf(W, height, courses, overlap, stagger, startCourses);
  const total = L.C * L.S;
  // Progress, not a count: the count is derived from the layout in render,
  // so a new width never marks the wrong slates laid for a frame.
  const [state, setState] = React.useState({ p: 0, from: 0 });
  const laidNow = laidAt(L, state.p);
  const laidFrom = laidAt(L, state.from);
  const [said, setSaid] = React.useState({ n: 0, text: "" });

  const sectionRef = React.useRef<HTMLElement | null>(null);
  const stageRef = React.useRef<HTMLDivElement | null>(null);
  const reported = React.useRef({ courses: -1, progress: -1 });

  const painted = React.useMemo(
    () => paintOf(headline, W, L.roofH, paint),
    [headline, W, L.roofH, paint],
  );

  const config = { L, span, headline, onCoursesChange, onProgressChange };
  const latest = React.useRef(config);
  React.useEffect(() => {
    latest.current = config;
  });

  const wholeCourses = (laid: number, layout: Layout) =>
    Math.min(layout.C, Math.floor(laid / layout.S));

  React.useEffect(() => {
    const section = sectionRef.current;
    const stage = stageRef.current;
    if (!section || !stage) return;
    const scroller = scrollParent(section);
    const target: HTMLElement | Window = scroller ?? window;
    const read = () => {
      const c = latest.current;
      const top0 = scroller ? scroller.getBoundingClientRect().top : 0;
      const rel = section.getBoundingClientRect().top - top0;
      const p = clamp(-rel / c.span, 0, 1);
      const laid = laidAt(c.L, p);
      // Only a change in the slates laid re-renders the roof.
      setState((s) => (laidAt(c.L, s.p) === laid ? s : { p, from: s.p }));
      const rounded = Math.round(p * 1000) / 1000;
      if (rounded !== reported.current.progress) {
        reported.current.progress = rounded;
        c.onProgressChange?.(rounded);
      }
      const whole = wholeCourses(laid, c.L);
      if (whole !== reported.current.courses) {
        const first = reported.current.courses === -1;
        reported.current.courses = whole;
        if (first) return;
        c.onCoursesChange?.(whole);
        setSaid((s) => ({
          n: s.n + 1,
          text:
            whole >= c.L.C
              ? `Roof complete: ${c.headline}.`
              : `${whole} of ${c.L.C} courses laid.`,
        }));
      }
    };
    read();
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        read();
      });
    };
    target.addEventListener("scroll", onScroll, { passive: true });
    const sizer = new ResizeObserver(() => {
      const next = Math.round(stage.clientWidth);
      if (next > 0) setW((p) => (p === next ? p : next));
    });
    sizer.observe(stage);
    return () => {
      target.removeEventListener("scroll", onScroll);
      sizer.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  // A new layout recounts the slates at the current scroll.
  React.useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;
    const scroller = scrollParent(section);
    const top0 = scroller ? scroller.getBoundingClientRect().top : 0;
    const p = clamp(-(section.getBoundingClientRect().top - top0) / span, 0, 1);
    setState((s) =>
      laidAt(L, s.p) === laidAt(L, p) && s.from === s.p ? s : { p, from: p },
    );
    // L is rebuilt each render; its inputs are the dependencies.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [W, height, courses, overlap, stagger, startCourses, span]);

  // The sheen crosses the roof once when the last slate is on.
  const sheen = useMotionValue("-120%");
  const complete = laidNow >= total;
  React.useEffect(() => {
    if (!complete || !motionSafe) {
      sheen.jump("-120%");
      return;
    }
    const run = animate(sheen, ["-120%", "120%"], {
      duration: durations.page * 1.6,
      ease: easings.move,
      delay: 0.35,
    });
    return () => run.stop();
  }, [complete, motionSafe, sheen]);

  /** A slate touched down: the clack, only once the visitor has acted. */
  const onLand = React.useCallback(
    (x: number, first: boolean) => {
      if (!first) return;
      const active =
        typeof navigator !== "undefined" &&
        (navigator.userActivation?.hasBeenActive ?? true);
      if (!active) return;
      const stage = stageRef.current;
      const r = stage?.getBoundingClientRect();
      audio.play("clack", {
        pitch: 0.86 + ((x * 13) % 37) / 100,
        gain: 0.34,
        pan: r ? panFrom(r.left + x, stage) : 0,
      });
    },
    [audio],
  );

  /** Scrolls the container to progress p. */
  const scrollTo = (p: number) => {
    const section = sectionRef.current;
    if (!section) return;
    const scroller = scrollParent(section);
    const top0 = scroller ? scroller.getBoundingClientRect().top : 0;
    const now = scroller ? scroller.scrollTop : window.scrollY;
    const start = section.getBoundingClientRect().top - top0 + now;
    const top = Math.max(0, Math.round(start + clamp(p, 0, 1) * span));
    const behavior: ScrollBehavior = motionSafe ? "smooth" : "auto";
    if (scroller) scroller.scrollTo({ top, behavior });
    else window.scrollTo({ top, behavior });
  };

  /** The progress at which `c` whole courses are on. */
  const progressFor = (c: number) =>
    c <= L.start ? 0 : clamp(0.02 + (c - L.start) * L.windowW - 0.004, 0, 1);

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const whole = wholeCourses(laidNow, L);
    const moves: Record<string, number> = {
      ArrowDown: whole + 1,
      PageDown: whole + 1,
      " ": whole + 1,
      ArrowUp: whole - 1,
      PageUp: whole - 1,
      Home: 0,
      End: L.C,
    };
    const to = moves[event.key];
    if (to === undefined) return;
    event.preventDefault();
    scrollTo(event.key === "End" ? 1 : progressFor(clamp(to, 0, L.C)));
  };

  /* -------------------------------- render ------------------------------- */

  const cover = Math.max(W / ART_W, L.roofH / ART_H);
  const pw = ART_W * cover;
  const ph = ART_H * cover;
  const ox = (W - pw) / 2;
  const oy = (L.roofH - ph) / 2;
  const step =
    cascade(Math.max(2, Math.abs(laidNow - laidFrom))) *
    (0.3 + 0.7 * L.stagger);
  const bottom = L.roofH;
  const slates: React.ReactNode[] = [];
  for (let k = 0; k < L.C; k += 1) {
    const yBottom = bottom - k * L.h;
    const y = yBottom - L.sh;
    for (let o = 0; o < L.S; o += 1) {
      // A roofer works along a course: left to right, then back.
      const col = k % 2 === 0 ? o : L.S - 1 - o;
      const x = col * L.sw - (k % 2 === 1 ? L.sw / 2 : 0);
      const g = k * L.S + o;
      const laid = g < laidNow;
      let delay = 0;
      if (laidNow > laidFrom && g >= laidFrom && laid) {
        delay = Math.min(0.6, (g - laidFrom) * step);
      } else if (laidNow < laidFrom && g >= laidNow && g < laidFrom) {
        delay = Math.min(0.4, (laidFrom - 1 - g) * step * 0.5);
      }
      slates.push(
        <Slate
          key={`${k}-${col}`}
          k={k}
          o={o}
          x={x}
          y={y}
          w={L.sw}
          h={L.sh}
          laid={laid}
          delay={r2(delay)}
          cut={cut}
          background={`${r2(W)}px ${r2(L.roofH)}px, ${r2(pw)}px ${r2(ph)}px|${r2(-x)}px ${r2(-y)}px, ${r2(ox - x)}px ${r2(oy - y)}px`}
          motionSafe={motionSafe}
          onLand={onLand}
        />,
      );
    }
  }

  return (
    <section
      ref={sectionRef}
      className={cn("relative w-full", className)}
      style={{ height: height + span }}
      aria-labelledby={`${uid}-head`}
    >
      <div
        ref={stageRef}
        role="group"
        aria-roledescription="roof"
        aria-labelledby={`${uid}-head`}
        aria-describedby={`${uid}-keys`}
        tabIndex={0}
        onKeyDown={onKeyDown}
        className={cn(
          "group/slate-courses sticky top-0 isolate w-full overflow-clip bg-[oklch(0.26_0.014_250)] outline-none",
          "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
        )}
        style={
          {
            height,
            "--slate-paint": `url("${painted.uri}")`,
            "--slate-picture": `url("${picture}")`,
          } as React.CSSProperties
        }
      >
        <Heading id={`${uid}-head`} className="sr-only">
          {headline}
        </Heading>
        <span role="img" aria-label={alt} className="sr-only" />
        <div
          className="absolute inset-x-0"
          style={{ top: RIDGE, height: L.roofH }}
        >
          {/* Battens across the felt, one per course. */}
          {Array.from({ length: L.C + 1 }, (_, k) => (
            <span
              key={k}
              aria-hidden
              className="absolute inset-x-0 h-1.5 bg-[oklch(0.58_0.06_70)] shadow-[0_2px_3px_color-mix(in_oklab,black_45%,transparent)]"
              style={{ top: r2(bottom - k * L.h - L.sh + 4) }}
            />
          ))}
          {/* The setting-out: the headline chalked on the felt. */}
          <svg
            aria-hidden
            className="absolute inset-0 size-full"
            viewBox={`0 0 ${W} ${r2(L.roofH)}`}
            preserveAspectRatio="none"
          >
            {painted.lines.map((line, i) => (
              <text
                key={i}
                x={r2(W / 2)}
                y={r2(painted.top + painted.lh * (i + 0.82))}
                textAnchor="middle"
                textLength={r2(
                  Math.min(0.86 * W, line.length * painted.fs * 0.6),
                )}
                lengthAdjust="spacingAndGlyphs"
                fontFamily="ui-sans-serif, system-ui, sans-serif"
                fontWeight={800}
                fontSize={painted.fs}
                letterSpacing={r2(painted.fs * 0.04)}
                fill="none"
                stroke="oklch(0.95 0 0 / 0.4)"
                strokeWidth={1.2}
                strokeDasharray="5 4"
              >
                {line.toUpperCase()}
              </text>
            ))}
          </svg>
          {slates}
          <motion.div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              zIndex: L.C + 4,
              x: sheen,
              backgroundImage:
                "linear-gradient(100deg, transparent 38%, color-mix(in oklab, white 22%, transparent) 50%, transparent 62%)",
            }}
          />
        </div>
        <span
          aria-hidden
          className="absolute inset-x-0 top-0 bg-[oklch(0.3_0.02_30)] shadow-[0_3px_6px_color-mix(in_oklab,black_50%,transparent)]"
          style={{ height: RIDGE, zIndex: L.C + 6 }}
        >
          <span className="absolute inset-x-0 top-0.5 h-px bg-[oklch(0.5_0.03_40)]" />
        </span>
        <span
          aria-hidden
          className="absolute inset-x-0 bottom-0 bg-[oklch(0.22_0.008_250)]"
          style={{ height: GUTTER, zIndex: L.C + 6 }}
        >
          <span className="absolute inset-x-0 top-0 h-px bg-[oklch(0.62_0.01_250)]" />
        </span>
        <p id={`${uid}-keys`} className="sr-only">
          Scroll to lay the roof. Down, Page Down and Space lay the next course,
          Up and Page Up lift the top one, Home and End lift all or lay all.
        </p>
        <p role="status" className="sr-only">
          <span key={said.n}>{said.text}</span>
        </p>
      </div>
    </section>
  );
}
