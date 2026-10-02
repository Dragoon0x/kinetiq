"use client";

import * as React from "react";

import {
  Bookmark,
  Building2,
  Check,
  Clock,
  Globe,
  Laptop,
  LoaderCircle,
  MapPin,
} from "lucide-react";
import {
  animate,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { project, rubberClamp, useDrag } from "@/registry/lib/tactile-gesture";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type RoleRemote = "onsite" | "hybrid" | "remote";

export type RoleListing = {
  id: string;
  /** The role's name: the card's heading. */
  title: string;
  company: string;
  team: string;
  /** How many people the team has: shown on the back of the company badge. */
  teamSize: number;
  location: string;
  remote: RoleRemote;
  /** A few words after the remote chip, such as "2 days in office". */
  remoteNote?: string;
  employment: string;
  /** The offered band, in whole currency units. */
  salary: {
    min: number;
    max: number;
    /** The symbol written before amounts. */
    currency: string;
    period: "year" | "month" | "hour";
  };
  /** The market range for the role: 25th percentile, median, 75th percentile. */
  market: { low: number; median: number; high: number };
  summary: string;
  /** When it was posted, as words: "2 days ago". */
  posted: string;
  applicants?: number;
};

export type RoleApplication = {
  email: string;
  link: string;
};

export type RoleCardBand = "sweep" | "center" | "ends";
export type RoleCardExpand = "inline" | "sheet";
export type RoleCardReveal = "hover" | "always";
export type RoleCardSize = "sm" | "md" | "lg";

export type RoleCardProps = {
  /** The role. @default defaultListing */
  listing?: RoleListing;
  /** Controlled: the corner is folded down and the role saved. */
  saved?: boolean;
  /** Initial saved state when uncontrolled. @default false */
  defaultSaved?: boolean;
  /** Fires from the press or the drag that folded or unfolded the corner. */
  onSavedChange?: (saved: boolean) => void;
  /** Controlled: the application form is showing. */
  open?: boolean;
  /** Initial form state when uncontrolled. @default false */
  defaultOpen?: boolean;
  /** Fires from Apply, Cancel, Escape and a sent application. */
  onOpenChange?: (open: boolean) => void;
  /** Controlled: an application has been sent and the card is stamped. */
  applied?: boolean;
  /** Initial applied state when uncontrolled. @default false */
  defaultApplied?: boolean;
  /** Fires when a submission succeeds. */
  onAppliedChange?: (applied: boolean) => void;
  /** Sends the application. A returned promise shows "Sending"; a rejection keeps the form with an error. */
  onApply?: (application: RoleApplication) => void | Promise<unknown>;
  /** How the salary band draws: sweeping up from its low end, spreading from its midpoint, or closing in from the scale's edges. @default "sweep" */
  band?: RoleCardBand;
  /** The folding corner's size in px: a small dog-ear or a big fold. @default 40 */
  crease?: number;
  /** Where the form opens: growing the card in place, or as a sheet over its lower half. @default "inline" */
  expand?: RoleCardExpand;
  /** When the band draws, the chips settle and the badge flips: on hover and focus, or always. @default "hover" */
  reveal?: RoleCardReveal;
  /** How an amount is written. @default "€62k" */
  formatMoney?: (amount: number, currency: string) => string;
  /** The Apply button's text. @default "Apply" */
  applyLabel?: string;
  /** The text once applied, on the button and the stamp. @default "Applied" */
  appliedLabel?: string;
  /** Badge (36 / 40 / 48 px), title size, and padding (sm is tighter). @default "md" */
  size?: RoleCardSize;
  /** The offered band, the Apply fill and the warm chip icons. @default "var(--accent)" */
  accent?: string;
  /** Play the paper of the fold and the click of the stamp. Off unless asked for. @default false */
  sound?: boolean;
  /** No reveal, no fold, no applying. @default false */
  disabled?: boolean;
  className?: string;
};

export const defaultListing: RoleListing = {
  id: "gw-0214",
  title: "Senior Product Designer",
  company: "Gaugeworks",
  team: "Design systems",
  teamSize: 38,
  location: "Lisbon, PT",
  remote: "hybrid",
  remoteNote: "2 days on site",
  employment: "Full-time",
  salary: { min: 62000, max: 78000, currency: "€", period: "year" },
  market: { low: 52000, median: 64000, high: 74000 },
  summary:
    "Own the component library behind Gaugeworks' calibration tools: tokens, motion and the docs that teach them. You pair with two engineers and ship every week.",
  posted: "2 days ago",
  applicants: 41,
};

const SIZES: Record<
  RoleCardSize,
  { pad: number; padClass: string; gap: string; badge: string; title: string }
> = {
  sm: {
    pad: 16,
    padClass: "p-4",
    gap: "gap-3.5",
    badge: "size-9",
    title: "text-sm leading-5",
  },
  md: {
    pad: 20,
    padClass: "p-5",
    gap: "gap-4",
    badge: "size-10",
    title: "text-base leading-5",
  },
  lg: {
    // The larger badge and title, on md's padding and rhythm: in a card no
    // wider than 20rem more padding only wraps the chips and the title.
    pad: 20,
    padClass: "p-5",
    gap: "gap-4",
    badge: "size-12",
    title: "text-lg leading-6",
  },
};

const REMOTE: Record<RoleRemote, { label: string; icon: typeof Globe }> = {
  onsite: { label: "On site", icon: Building2 },
  hybrid: { label: "Hybrid", icon: Laptop },
  remote: { label: "Remote", icon: Globe },
};

const PERIOD: Record<RoleListing["salary"]["period"], string> = {
  year: "a year",
  month: "a month",
  hour: "an hour",
};

/** The corner lifts this far, in degrees, when the pointer is over it. */
const HINT = -24;
/** A sound answers the visitor only this soon after their press, in ms. */
const BEAT = 900;

const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Number(v.toFixed(3));
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

const money = (amount: number, currency: string) =>
  `${currency}${Math.round(amount / 1000)}k`;

/** FNV-1a: a stable 32-bit seed from text. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** A unit value from a hash and a salt, the same on the server and the browser. */
const unit = (seed: number, salt: number) =>
  (((seed ^ Math.imul(salt + 1, 0x9e3779b1)) >>> 0) % 1000) / 1000;

const pigment = (accent: string, l: number, turn: number) =>
  `oklch(from ${accent} ${l} c calc(h + ${turn}))`;

/** The company's mark: a gauge whose needle angle is the company's own. */
function Mark({ seed, accent }: { seed: number; accent: string }) {
  const a = Math.PI * (1.15 + unit(seed, 3) * 0.7);
  const nx = r3(20 + 9 * Math.cos(a));
  const ny = r3(23 + 9 * Math.sin(a));
  return (
    <svg aria-hidden viewBox="0 0 40 40" className="block size-full">
      <rect
        width="40"
        height="40"
        style={{ fill: pigment(accent, 0.42, -20) }}
      />
      <path
        d="M9 25 A11 11 0 0 1 31 25"
        fill="none"
        strokeWidth="3"
        strokeLinecap="round"
        style={{ stroke: pigment(accent, 0.86, 30) }}
      />
      <path
        d={`M20 23 L${nx} ${ny}`}
        strokeWidth="2.4"
        strokeLinecap="round"
        stroke="white"
      />
      <circle cx="20" cy="23" r="2.4" fill="white" />
    </svg>
  );
}

type Said =
  | { kind: "saved"; want: boolean }
  | { kind: "applied" }
  | { kind: "text"; text: string };

/**
 * A job listing that tells you what it pays the moment you look at it. On
 * hover (or keyboard focus within) the salary band draws itself against the
 * market range on glide, its end labels counting as they travel; the
 * location, remote and employment chips straighten from a loose scatter into
 * a row on snap; and the company badge flips over to show the team's size.
 *
 * The top-right corner is paper: press it, or drag it down and left, and it
 * folds over along the diagonal in real 3D on snap, cutting the card along
 * the crease and showing its shaded back — the role is saved. Apply morphs
 * into a two-field form inside the card through a shared layout, and a sent
 * application morphs back into "Applied" as a stamp lands beside it on the
 * recoil spring.
 *
 * Apply is a real disclosure (`aria-expanded`, focus into the form and back,
 * Escape closes wherever focus is); the corner is an `aria-pressed` button.
 * Under reduced motion nothing folds, flips, tilts, travels or bounces — each
 * state swaps or fades in place, and every state still shows.
 */
export function RoleCard({
  listing = defaultListing,
  saved,
  defaultSaved = false,
  onSavedChange,
  open,
  defaultOpen = false,
  onOpenChange,
  applied,
  defaultApplied = false,
  onAppliedChange,
  onApply,
  band = "sweep",
  crease = 40,
  expand = "inline",
  reveal = "hover",
  formatMoney = money,
  applyLabel = "Apply",
  appliedLabel = "Applied",
  size = "md",
  accent = "var(--accent)",
  sound = false,
  disabled = false,
  className,
}: RoleCardProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const formId = `${uid}-form`;
  const formTitleId = `${uid}-form-title`;
  const emailId = `${uid}-email`;
  const linkId = `${uid}-link`;
  const errorId = `${uid}-error`;
  const sendErrorId = `${uid}-send-error`;
  const layoutId = `${uid}-apply`;

  const s = Math.round(clamp(crease, 24, 72));
  const sz = SIZES[size] ?? SIZES.md;
  const seed = hash(`${listing.id}:${listing.company}`);
  const { salary, market } = listing;
  const fmt = (n: number) => formatMoney(n, salary.currency);

  // The scale the band is drawn on: both ranges, with room either side.
  const lowest = Math.min(market.low, salary.min);
  const highest = Math.max(market.high, salary.max);
  const span = Math.max(1, highest - lowest);
  const d0 = lowest - span * 0.14;
  const d1 = highest + span * 0.14;
  const pct = (v: number) => r2(((v - d0) / (d1 - d0)) * 100);
  const mid = (salary.min + salary.max) / 2;
  const start =
    band === "center"
      ? { lo: mid, hi: mid }
      : band === "ends"
        ? { lo: d0, hi: d1 }
        : { lo: salary.min, hi: salary.min };
  const diff = Math.round(((mid - market.median) / market.median) * 100);
  const versus =
    diff === 0
      ? "at the market median"
      : `${Math.abs(diff)}% ${diff > 0 ? "above" : "below"} median`;

  const [ownSaved, setOwnSaved] = React.useState(defaultSaved);
  const [ownOpen, setOwnOpen] = React.useState(defaultOpen);
  const [ownApplied, setOwnApplied] = React.useState(defaultApplied);
  const isSaved = saved ?? ownSaved;
  const isOpen = (open ?? ownOpen) && !disabled;
  const isApplied = applied ?? ownApplied;

  const [hovering, setHovering] = React.useState(false);
  const [focusVisible, setFocusVisible] = React.useState(false);
  const [tapped, setTapped] = React.useState(false);
  const [hint, setHint] = React.useState(false);
  const [folding, setFolding] = React.useState(false);
  const [email, setEmail] = React.useState("");
  const [link, setLink] = React.useState("");
  const [emailError, setEmailError] = React.useState(false);
  const [phase, setPhase] = React.useState<"idle" | "sending" | "error">(
    "idle",
  );
  const [said, setSaid] = React.useState<Said | null>(null);
  const [contentH, setContentH] = React.useState<number | null>(null);
  const [content, setContent] = React.useState<HTMLDivElement | null>(null);
  const [emailNode, setEmailNode] = React.useState<HTMLInputElement | null>(
    null,
  );
  const [applyNode, setApplyNode] = React.useState<HTMLButtonElement | null>(
    null,
  );
  const [appliedNode, setAppliedNode] =
    React.useState<HTMLButtonElement | null>(null);

  const lo = useMotionValue(start.lo);
  const hi = useMotionValue(start.hi);
  const drawn = useMotionValue(0);
  const spread = useMotionValue(0);
  const theta = useMotionValue(isSaved ? -180 : 0);
  const stampScale = useMotionValue(1);
  const stampRotate = useMotionValue(-8);
  const stampOpacity = useMotionValue(isApplied ? 1 : 0);

  const cornerRef = React.useRef<HTMLButtonElement | null>(null);
  const anims = React.useRef(new Map<string, AnimationPlaybackControls>());
  const pressedAt = React.useRef(-Infinity);
  const velocity = React.useRef(0);
  const dragBase = React.useRef(0);
  const focusAfter = React.useRef<"email" | "apply" | "applied" | null>(null);
  const generation = React.useRef(0);

  const run = (key: string, controls: AnimationPlaybackControls) => {
    anims.current.get(key)?.stop();
    anims.current.set(key, controls);
  };
  const visitorBeat = () => performance.now() - pressedAt.current < BEAT;
  const panOf = (el: Element | null | undefined) => {
    const rect = el?.getBoundingClientRect();
    return rect ? panFrom(rect.left + rect.width / 2, null) : 0;
  };

  const revealed =
    !disabled &&
    (reveal === "always" || hovering || focusVisible || tapped || isOpen);

  // ---- the band draws itself ---------------------------------------------------
  React.useEffect(() => {
    if (revealed) {
      if (drawn.get() < 0.02) {
        lo.jump(start.lo);
        hi.jump(start.hi);
      }
      if (!motionSafe) {
        lo.jump(salary.min);
        hi.jump(salary.max);
        run(
          "spread",
          animate(spread, 1, { duration: durations.base, ease: easings.enter }),
        );
        run(
          "drawn",
          animate(drawn, 1, { duration: durations.base, ease: easings.enter }),
        );
        return;
      }
      run("spread", animate(spread, 1, springs.glide));
      run(
        "drawn",
        animate(drawn, 1, { duration: durations.fast, delay: 0.06 }),
      );
      run("lo", animate(lo, salary.min, { ...springs.glide, delay: 0.1 }));
      run("hi", animate(hi, salary.max, { ...springs.glide, delay: 0.1 }));
      return;
    }
    run("spread", animate(spread, 0, exitFor(durations.base)));
    run(
      "drawn",
      animate(drawn, 0, {
        ...exitFor(durations.base),
        onComplete: () => {
          lo.jump(start.lo);
          hi.jump(start.hi);
        },
      }),
    );
    // Drawn again from its start whenever it is shown afresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealed, motionSafe, band, salary.min, salary.max]);

  // ---- the paper corner ---------------------------------------------------------
  const foldTarget = isSaved ? -180 : hint && !disabled ? HINT : 0;
  const settleFold = React.useCallback(
    (to: number) => {
      const v = velocity.current;
      velocity.current = 0;
      if (!motionSafe) {
        anims.current.get("fold")?.stop();
        theta.jump(to === HINT ? 0 : to);
        return;
      }
      // Folding over lands with one crisp overshoot; opening out glides.
      const spring = to <= -90 ? springs.snap : springs.glide;
      const controls = animate(theta, to, { ...spring, velocity: v });
      anims.current.get("fold")?.stop();
      anims.current.set("fold", controls);
    },
    [motionSafe, theta],
  );
  React.useEffect(() => {
    if (folding) return;
    settleFold(foldTarget);
  }, [foldTarget, folding, settleFold]);

  // ---- the stamp lands when an application is sent ------------------------------
  const appliedShown = React.useRef(isApplied);
  React.useEffect(() => {
    if (appliedShown.current === isApplied) return;
    appliedShown.current = isApplied;
    if (!isApplied) {
      run("stamp", animate(stampOpacity, 0, exitFor(durations.base)));
      return;
    }
    if (!motionSafe) {
      stampScale.jump(1);
      stampRotate.jump(-8);
      run(
        "stamp",
        animate(stampOpacity, 1, {
          duration: durations.base,
          ease: easings.enter,
        }),
      );
      return;
    }
    // Ink hitting paper: it arrives large and tilted and lands with two
    // bounces, once the form has morphed back into the button.
    const wait = 0.14;
    stampScale.jump(1.7);
    stampRotate.jump(-16);
    stampOpacity.jump(0);
    run(
      "stamp",
      animate(stampOpacity, 1, { duration: durations.blink, delay: wait }),
    );
    run(
      "stampScale",
      animate(stampScale, 1, { ...springs.recoil, delay: wait }),
    );
    run(
      "stampRotate",
      animate(stampRotate, -8, { ...springs.recoil, delay: wait }),
    );
    if (visitorBeat()) {
      const id = window.setTimeout(
        () => audio.play("click", { pitch: 0.55, gain: 0.7 }),
        Math.round((wait + 0.07) * 1000),
      );
      return () => window.clearTimeout(id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isApplied, motionSafe]);

  // ---- the card's height follows its content (the inline form) -----------------
  React.useEffect(() => {
    if (!content) return;
    const measure = () => {
      const h = Math.round(content.offsetHeight);
      if (h > 0) setContentH((now) => (now === h ? now : h));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(content);
    return () => observer.disconnect();
  }, [content]);

  // ---- focus goes where it was sent, once the node has arrived ------------------
  React.useEffect(() => {
    if (focusAfter.current === "email" && emailNode) {
      focusAfter.current = null;
      emailNode.focus({ preventScroll: true });
    }
  }, [emailNode]);
  React.useEffect(() => {
    if (focusAfter.current === "apply" && applyNode) {
      focusAfter.current = null;
      applyNode.focus({ preventScroll: true });
    }
  }, [applyNode]);
  React.useEffect(() => {
    if (focusAfter.current === "applied" && appliedNode) {
      focusAfter.current = null;
      appliedNode.focus({ preventScroll: true });
    }
  }, [appliedNode]);

  // ---- a tap that revealed the card on touch is undone by a tap elsewhere -------
  const [root, setRoot] = React.useState<HTMLElement | null>(null);
  React.useEffect(() => {
    if (!tapped || !root) return;
    const onDown = (event: PointerEvent) => {
      if (event.target instanceof Node && root.contains(event.target)) return;
      setTapped(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [tapped, root]);

  React.useEffect(() => {
    const live = anims.current;
    const gen = generation;
    return () => {
      gen.current += 1;
      for (const c of live.values()) c.stop();
      live.clear();
    };
  }, []);

  // ---- actions ---------------------------------------------------------------------
  const commitSave = (next: boolean) => {
    pressedAt.current = performance.now();
    audio.play("paper", {
      pitch: next ? 1.1 : 0.85,
      gain: 0.55,
      pan: panOf(cornerRef.current),
    });
    // Uncontrolled, the fold follows the new state; controlled, it goes back
    // to where the host says it is and folds once the host answers.
    if (saved === undefined) setOwnSaved(next);
    onSavedChange?.(next);
    setSaid({ kind: "saved", want: next });
  };

  const drag = useDrag({
    threshold: 4,
    disabled,
    onStart: () => {
      dragBase.current = clamp(-theta.get() / 180, 0, 1);
      anims.current.get("fold")?.stop();
      setFolding(true);
    },
    onMove: ({ offset }) => {
      // The corner's tip travels from (s, 0) to (0, s): progress is the
      // finger's travel along that diagonal, 1:1.
      const along = (-offset.x + offset.y) / 2 / s;
      const p = rubberClamp(dragBase.current + along, 0, 1, 0.12);
      theta.set(r2(-180 * p));
    },
    onEnd: ({ velocity: v }) => {
      const p = -theta.get() / 180;
      const rate = (-v.x + v.y) / 2 / s;
      const landing = project(p, rate, 0.99);
      velocity.current = r2(-180 * rate);
      // Letting go hands the fold back to the effect, which springs it to
      // wherever the (possibly new) state says, with this release velocity.
      setFolding(false);
      const next = landing > 0.5;
      if (next !== isSaved) commitSave(next);
    },
    onCancel: () => {
      velocity.current = 0;
      setFolding(false);
    },
    onTap: () => {
      if (!disabled) commitSave(!isSaved);
    },
  });

  const setOpenTo = (next: boolean) => {
    if (open === undefined) setOwnOpen(next);
    onOpenChange?.(next);
  };

  const openForm = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (disabled || isApplied) return;
    pressedAt.current = performance.now();
    audio.play("click", {
      pitch: 1,
      gain: 0.5,
      pan: panOf(event.currentTarget),
    });
    audio.play("paper", {
      pitch: 1.3,
      gain: 0.3,
      pan: panOf(event.currentTarget),
    });
    focusAfter.current = "email";
    setPhase("idle");
    setOpenTo(true);
  };

  const closeForm = (giveBack: boolean) => {
    generation.current += 1;
    setPhase("idle");
    setEmailError(false);
    focusAfter.current = giveBack ? "apply" : null;
    setOpenTo(false);
  };

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (phase === "sending" || disabled) return;
    pressedAt.current = performance.now();
    const value = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      setEmailError(true);
      setSaid({ kind: "text", text: "Enter an email address to apply." });
      emailNode?.focus({ preventScroll: true });
      return;
    }
    setEmailError(false);
    audio.play("click", { pitch: 1.2, gain: 0.55 });
    const ticket = (generation.current += 1);
    const succeed = () => {
      if (ticket !== generation.current) return;
      setPhase("idle");
      focusAfter.current = "applied";
      if (applied === undefined) setOwnApplied(true);
      onAppliedChange?.(true);
      setSaid({ kind: "applied" });
      setOpenTo(false);
    };
    const result = onApply?.({ email: value, link: link.trim() });
    if (result && typeof (result as Promise<unknown>).then === "function") {
      setPhase("sending");
      setSaid({ kind: "text", text: "Sending your application." });
      (result as Promise<unknown>).then(succeed, () => {
        if (ticket !== generation.current) return;
        setPhase("error");
        setSaid({
          kind: "text",
          text: "Your application was not sent. Try again.",
        });
      });
      return;
    }
    succeed();
  };

  // ---- per-frame geometry ------------------------------------------------------------
  const barLeft = useTransform(lo, (v) => `${pct(v)}%`);
  const barWidth = useTransform(
    [lo, hi] as MotionValue<number>[],
    ([a = 0, b = 0]: number[]) => `${r2(Math.max(0, pct(b) - pct(a)))}%`,
  );
  const loLeft = useTransform(
    lo,
    (v) => `clamp(0px, calc(${pct(v)}% - 44px), calc(100% - 88px))`,
  );
  const hiLeft = useTransform(
    hi,
    (v) => `clamp(44px, ${pct(v)}%, calc(100% - 44px))`,
  );
  const loText = useTransform(lo, (v) => fmt(v));
  const hiText = useTransform(hi, (v) => fmt(v));
  const spreadOpacity = useTransform(spread, (v) => r3(clamp(v, 0, 1)));
  const flap = useTransform(
    theta,
    (t) => `perspective(${s * 9}px) rotate3d(1, 1, 0, ${r2(t)}deg)`,
  );
  const cut = useTransform(theta, (t) =>
    t < -0.5
      ? `polygon(0 0, calc(100% - ${s}px) 0, 100% ${s}px, 100% 100%, 0 100%)`
      : "none",
  );
  const creaseOpacity = useTransform(theta, (t) => (t < -0.5 ? 1 : 0));
  const shade = useTransform(theta, (t) => r3(clamp((-t / 180) * 1.15, 0, 1)));

  const remote = REMOTE[listing.remote] ?? REMOTE.hybrid;
  const chips = [
    { id: "location", icon: MapPin, label: listing.location },
    {
      id: "remote",
      icon: remote.icon,
      label: listing.remoteNote
        ? `${remote.label} · ${listing.remoteNote}`
        : remote.label,
    },
    { id: "employment", icon: Clock, label: listing.employment },
  ];
  // Loose at rest, like tags dropped on a desk: alternating, never more than
  // a degree and a half, so it reads as placed rather than broken.
  const loose = chips.map((_, i) => ({
    rotate: r2((i % 2 === 0 ? -1 : 1) * (0.8 + unit(seed, 10 + i) * 0.7)),
    y: r2((i % 2 === 0 ? 1 : -1) * (0.6 + unit(seed, 20 + i) * 0.8)),
  }));

  const bandSentence = `Salary ${fmt(salary.min)} to ${fmt(salary.max)} ${PERIOD[salary.period]}; market ${fmt(market.low)} to ${fmt(market.high)}, median ${fmt(market.median)}.`;

  const sentence = (() => {
    if (!said) return "";
    if (said.kind === "text") return said.text;
    if (said.kind === "applied")
      return isApplied ? `Application sent to ${listing.company}.` : "";
    if (said.want !== isSaved) return "";
    return isSaved
      ? `Saved ${listing.title} at ${listing.company}.`
      : `Removed ${listing.title} from saved roles.`;
  })();

  const field = cn(
    "h-8 w-full rounded-2 border bg-background px-2.5 text-[13px] text-foreground transition-colors outline-none placeholder:text-ink-3",
    "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring focus-visible:outline-solid",
  );

  const formBody = (
    <motion.div
      className="flex flex-col"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{
        duration: durations.base,
        delay: motionSafe ? 0.12 : 0,
        ease: easings.enter,
      }}
    >
      <div className="flex items-baseline justify-between gap-2">
        <p
          id={formTitleId}
          className="truncate text-xs font-medium text-foreground"
        >
          Apply to {listing.company}
        </p>
        <p className="shrink-0 text-[11px] text-ink-3">2 fields</p>
      </div>
      <label htmlFor={emailId} className="mt-2.5 text-[11px] text-ink-2">
        Email
      </label>
      <input
        ref={setEmailNode}
        id={emailId}
        type="email"
        inputMode="email"
        autoComplete="email"
        value={email}
        disabled={disabled}
        onChange={(event) => {
          setEmail(event.target.value);
          if (emailError) setEmailError(false);
        }}
        aria-invalid={emailError || undefined}
        aria-describedby={emailError ? errorId : undefined}
        placeholder="you@example.com"
        className={cn(
          field,
          "mt-1",
          emailError ? "border-danger" : "border-input",
        )}
      />
      {emailError ? (
        <p id={errorId} className="mt-1 text-[11px] text-danger">
          Enter an email address.
        </p>
      ) : null}
      <label htmlFor={linkId} className="mt-2 text-[11px] text-ink-2">
        Portfolio or CV link <span className="text-ink-3">· optional</span>
      </label>
      <input
        id={linkId}
        type="url"
        inputMode="url"
        autoComplete="url"
        value={link}
        disabled={disabled}
        onChange={(event) => setLink(event.target.value)}
        placeholder="https://"
        className={cn(field, "mt-1 border-input")}
      />
      {phase === "error" ? (
        <p id={sendErrorId} className="mt-2 text-[11px] text-danger">
          Not sent. Check your connection and try again.
        </p>
      ) : null}
      <div className="mt-3 flex items-center justify-end gap-2">
        <button
          type="button"
          aria-expanded="true"
          aria-controls={formId}
          onClick={() => closeForm(true)}
          className={cn(
            "inline-flex h-8 cursor-pointer items-center rounded-full px-3 text-xs text-ink-2 transition-colors outline-none",
            "hover:bg-surface-2 hover:text-foreground",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
          )}
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={disabled}
          aria-busy={phase === "sending" || undefined}
          aria-describedby={phase === "error" ? sendErrorId : undefined}
          className={cn(
            "inline-flex h-8 cursor-pointer items-center rounded-full px-3.5 text-xs font-medium text-primary-foreground transition-opacity outline-none",
            "hover:opacity-90",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
            "disabled:cursor-not-allowed disabled:opacity-50",
          )}
          style={{ backgroundColor: accent }}
        >
          {/* Both labels share one cell, so the button keeps its width. */}
          <span className="inline-grid">
            <span
              className={cn(
                "[grid-area:1/1]",
                phase === "sending" && "invisible",
              )}
            >
              Send application
            </span>
            <span
              aria-hidden={phase !== "sending"}
              className={cn(
                "inline-flex items-center justify-center gap-1.5 [grid-area:1/1]",
                phase !== "sending" && "invisible",
              )}
            >
              <LoaderCircle
                aria-hidden
                className={cn("size-3.5", motionSafe && "animate-spin")}
              />
              Sending
            </span>
          </span>
        </button>
      </div>
    </motion.div>
  );

  const form = (
    <motion.form
      key="form"
      layoutId={layoutId}
      id={formId}
      aria-labelledby={formTitleId}
      noValidate
      onSubmit={submit}
      transition={motionSafe ? springs.glide : { duration: 0 }}
      style={{ borderRadius: 10 }}
      className={cn(
        "border border-hairline-strong bg-popover p-3",
        expand === "sheet"
          ? "absolute inset-x-2 bottom-2 z-20 shadow-[0_-12px_32px_-14px_color-mix(in_oklab,black_45%,transparent)]"
          : "relative",
      )}
    >
      {formBody}
    </motion.form>
  );

  const pill = cn(
    "inline-flex h-9 shrink-0 items-center gap-1.5 px-4 text-sm font-medium outline-none",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
  );

  return (
    <article
      ref={setRoot}
      aria-labelledby={titleId}
      onPointerEnter={(event) => {
        if (event.pointerType !== "touch") setHovering(true);
      }}
      onPointerLeave={(event) => {
        if (event.pointerType !== "touch") setHovering(false);
      }}
      onPointerDown={(event) => {
        if (event.pointerType !== "touch" || disabled) return;
        const t = event.target;
        if (t instanceof Element && t.closest("button, input, a, form")) return;
        setTapped((v) => !v);
      }}
      onFocus={(event) => {
        if (
          event.target instanceof Element &&
          event.target.matches(":focus-visible")
        ) {
          setFocusVisible(true);
        }
      }}
      onBlur={(event) => {
        const next = event.relatedTarget;
        if (!(next instanceof Node) || !event.currentTarget.contains(next)) {
          setFocusVisible(false);
        }
      }}
      onKeyDown={(event) => {
        // Caught here, wherever focus is in the card, and kept from the page.
        if (event.key === "Escape" && isOpen) {
          event.preventDefault();
          closeForm(true);
        }
      }}
      className={cn(
        "relative w-full max-w-80 text-foreground",
        folding && "select-none",
        disabled && "opacity-60",
        className,
      )}
    >
      <motion.div
        className="relative overflow-clip rounded-4 border border-hairline bg-card"
        style={{ clipPath: cut }}
      >
        <motion.div
          className="overflow-clip"
          initial={false}
          animate={{ height: contentH ?? "auto" }}
          transition={motionSafe ? springs.glide : { duration: 0 }}
        >
          <div
            ref={setContent}
            className={cn("flex flex-col", sz.padClass, sz.gap)}
          >
            <header
              className="flex items-start gap-3"
              style={{ paddingRight: Math.max(0, s - sz.pad + 4) }}
            >
              <div className={cn("relative shrink-0", sz.badge)}>
                <motion.div
                  className="relative size-full [transform-style:preserve-3d]"
                  initial={false}
                  animate={{ rotateY: revealed && motionSafe ? 180 : 0 }}
                  transition={springs.snap}
                  style={{ transformPerspective: 360 }}
                >
                  <motion.div
                    className="absolute inset-0 overflow-clip rounded-3 [backface-visibility:hidden]"
                    initial={false}
                    animate={{ opacity: !motionSafe && revealed ? 0 : 1 }}
                    transition={{ duration: durations.fast }}
                  >
                    <Mark seed={seed} accent={accent} />
                  </motion.div>
                  <motion.div
                    aria-hidden
                    className="absolute inset-0 flex flex-col items-center justify-center rounded-3 border border-hairline-strong bg-surface-2 [backface-visibility:hidden]"
                    initial={false}
                    animate={{ opacity: !motionSafe ? (revealed ? 1 : 0) : 1 }}
                    transition={{ duration: durations.fast }}
                    style={{ rotateY: motionSafe ? 180 : 0 }}
                  >
                    <span className="font-mono text-[13px] leading-4 font-medium text-foreground tabular-nums">
                      {listing.teamSize}
                    </span>
                    <span className="text-[8px] leading-3 tracking-[0.06em] text-ink-3 uppercase">
                      people
                    </span>
                  </motion.div>
                </motion.div>
              </div>
              <div className="min-w-0 flex-1">
                <h3
                  id={titleId}
                  className={cn("font-medium text-foreground", sz.title)}
                >
                  {listing.title}
                </h3>
                <p
                  title={`${listing.company} · ${listing.team}`}
                  className="mt-1 truncate text-xs text-ink-2"
                >
                  {listing.company} · {listing.team}
                </p>
                <p className="mt-0.5 truncate text-[11px] text-ink-3">
                  {listing.teamSize} people · Posted {listing.posted}
                </p>
              </div>
            </header>

            <ul role="list" className="flex flex-wrap gap-1.5">
              {chips.map((chip, i) => {
                const Icon = chip.icon;
                const rest = loose[i] ?? { rotate: 0, y: 0 };
                return (
                  <motion.li
                    key={chip.id}
                    initial={false}
                    animate={
                      motionSafe && !revealed
                        ? { rotate: rest.rotate, y: rest.y }
                        : { rotate: 0, y: 0 }
                    }
                    transition={
                      !motionSafe
                        ? { duration: 0 }
                        : revealed
                          ? {
                              ...springs.snap,
                              delay: i * cascade(chips.length),
                            }
                          : springs.glide
                    }
                    className={cn(
                      "inline-flex h-7 max-w-full items-center gap-1.5 rounded-full border px-2.5 text-xs transition-colors duration-200",
                      revealed
                        ? "border-hairline-strong bg-surface-2 text-foreground"
                        : "border-hairline text-ink-2",
                    )}
                  >
                    <span
                      aria-hidden
                      className={cn(
                        "inline-flex shrink-0 transition-colors duration-200",
                        !revealed && "text-ink-3",
                      )}
                      style={revealed ? { color: accent } : undefined}
                    >
                      <Icon className="size-3.5" />
                    </span>
                    <span className="truncate" title={chip.label}>
                      {chip.label}
                    </span>
                  </motion.li>
                );
              })}
            </ul>

            <div>
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-[11px] font-medium tracking-[0.06em] text-ink-3 uppercase">
                  Salary
                </p>
                <p className="font-mono text-[13px] text-foreground tabular-nums">
                  {fmt(salary.min)} – {fmt(salary.max)}
                  <span className="text-ink-3"> / {salary.period}</span>
                </p>
              </div>
              <div
                role="img"
                aria-label={bandSentence}
                className="relative mt-2 h-8"
              >
                <span
                  aria-hidden
                  className="absolute inset-x-0 top-1 h-2 rounded-full bg-ink-3/12"
                />
                <motion.span
                  aria-hidden
                  className="absolute top-1 h-2 rounded-full bg-ink-3/25"
                  style={{
                    left: `${pct(market.low)}%`,
                    width: `${r2(pct(market.high) - pct(market.low))}%`,
                    scaleX: motionSafe ? spread : 1,
                    opacity: spreadOpacity,
                    // A percentage string: motion multiplies a fraction by
                    // 100 and can leave a long float in the markup.
                    originX: `${r2(
                      ((market.median - market.low) /
                        Math.max(1, market.high - market.low)) *
                        100,
                    )}%`,
                  }}
                />
                <motion.span
                  aria-hidden
                  className="absolute top-0 h-4 w-px bg-ink-3/70"
                  style={{
                    left: `${pct(market.median)}%`,
                    opacity: spreadOpacity,
                  }}
                />
                <motion.span
                  aria-hidden
                  className="absolute top-0.5 h-3 rounded-full"
                  style={{
                    left: barLeft,
                    width: barWidth,
                    opacity: drawn,
                    backgroundColor: accent,
                  }}
                />
                <motion.span
                  aria-hidden
                  className="absolute top-4.5 w-11 text-right font-mono text-[10px] leading-3 text-foreground tabular-nums"
                  style={{ left: loLeft, opacity: drawn }}
                >
                  {loText}
                </motion.span>
                <motion.span
                  aria-hidden
                  className="absolute top-4.5 w-11 font-mono text-[10px] leading-3 text-foreground tabular-nums"
                  style={{ left: hiLeft, opacity: drawn }}
                >
                  {hiText}
                </motion.span>
              </div>
              <p className="text-[11px] text-ink-3">
                Market {fmt(market.low)} – {fmt(market.high)} ·{" "}
                <span className={diff > 0 ? "text-success" : undefined}>
                  {versus}
                </span>
              </p>
            </div>

            {/* The inline form takes the summary's place, so the card grows
                by the form less the summary rather than by the whole form. */}
            {isOpen && expand === "inline" ? null : (
              <p className="line-clamp-3 text-[13px] leading-5 text-ink-2">
                {listing.summary}
              </p>
            )}

            {isOpen && expand === "inline" ? (
              form
            ) : (
              <div className="relative flex h-9 items-center justify-between gap-3">
                {isApplied ? (
                  <motion.button
                    key="applied"
                    ref={setAppliedNode}
                    layoutId={layoutId}
                    type="button"
                    aria-disabled="true"
                    transition={motionSafe ? springs.glide : { duration: 0 }}
                    style={{ borderRadius: 999 }}
                    className={cn(
                      pill,
                      "cursor-default border border-hairline-strong bg-surface-2 text-foreground",
                    )}
                  >
                    <Check aria-hidden className="size-4 text-success" />
                    {appliedLabel}
                  </motion.button>
                ) : isOpen ? null : (
                  <motion.button
                    key="apply"
                    ref={setApplyNode}
                    layoutId={layoutId}
                    type="button"
                    disabled={disabled}
                    aria-expanded={false}
                    aria-controls={formId}
                    onClick={openForm}
                    transition={motionSafe ? springs.glide : { duration: 0 }}
                    style={{ borderRadius: 999, backgroundColor: accent }}
                    whileTap={motionSafe ? { scale: 0.97 } : undefined}
                    className={cn(
                      pill,
                      "cursor-pointer text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50",
                    )}
                  >
                    {applyLabel}
                  </motion.button>
                )}
                <span className="grid shrink-0 items-center justify-items-end">
                  <span
                    className={cn(
                      "text-[11px] text-ink-3 transition-opacity duration-200 [grid-area:1/1]",
                      isApplied && "opacity-0",
                    )}
                  >
                    {listing.applicants !== undefined
                      ? `${listing.applicants} ${listing.applicants === 1 ? "applicant" : "applicants"}`
                      : null}
                  </span>
                  <motion.span
                    aria-hidden
                    className="pointer-events-none inline-flex flex-col items-center rounded-2 border-2 px-2 py-0.5 font-mono leading-none uppercase [grid-area:1/1]"
                    style={{
                      scale: stampScale,
                      rotate: stampRotate,
                      opacity: stampOpacity,
                      color: "oklch(from var(--success) 0.62 c h)",
                      borderColor: "oklch(from var(--success) 0.62 c h)",
                    }}
                  >
                    <span className="text-[13px] font-semibold tracking-[0.14em]">
                      {appliedLabel}
                    </span>
                    <span className="mt-0.5 text-[7px] tracking-[0.12em]">
                      {listing.company} · {listing.id}
                    </span>
                  </motion.span>
                </span>
              </div>
            )}
          </div>
        </motion.div>
        {isOpen && expand === "sheet" ? form : null}
      </motion.div>

      {/* The paper corner: a shadow, the flap's two faces, and the crease. */}
      <div
        aria-hidden
        className="pointer-events-none absolute top-0 right-0 z-10"
        style={{ width: s, height: s }}
      >
        <motion.div
          className="absolute inset-0"
          style={{
            opacity: shade,
            clipPath: "polygon(0 0, 0 100%, 100% 100%)",
            background:
              "linear-gradient(to top right, transparent 22%, color-mix(in oklab, black 26%, transparent) 50%)",
          }}
        />
        <motion.div
          className="absolute inset-0 [transform-style:preserve-3d]"
          style={{ transform: flap }}
        >
          <div
            className="absolute inset-0 rounded-tr-4 border-t border-r border-hairline bg-card [backface-visibility:hidden]"
            style={{ clipPath: "polygon(0 0, 100% 0, 100% 100%)" }}
          >
            <Bookmark
              className="absolute text-ink-3"
              style={{
                top: Math.round(s * 0.12),
                right: Math.round(s * 0.12),
                width: Math.round(s * 0.34),
                height: Math.round(s * 0.34),
              }}
            />
          </div>
          <div
            className="absolute inset-0 [backface-visibility:hidden]"
            style={{
              transform: "rotate3d(1, 1, 0, 180deg)",
              clipPath: "polygon(0 0, 0 100%, 100% 100%)",
              background:
                "linear-gradient(to top right, color-mix(in oklab, var(--bg-2) 88%, white) 0%, var(--bg-2) 26%, color-mix(in oklab, var(--bg-2) 78%, black) 50%)",
            }}
          >
            <Bookmark
              className="absolute fill-current"
              style={{
                bottom: Math.round(s * 0.12),
                left: Math.round(s * 0.12),
                width: Math.round(s * 0.32),
                height: Math.round(s * 0.32),
                color: accent,
              }}
            />
          </div>
        </motion.div>
        <motion.svg
          className="absolute inset-0 overflow-visible"
          width={s}
          height={s}
          viewBox={`0 0 ${s} ${s}`}
          style={{ opacity: creaseOpacity }}
        >
          <line
            x1={0.5}
            y1={0.5}
            x2={s - 0.5}
            y2={s - 0.5}
            strokeWidth={1}
            className="stroke-hairline-strong"
          />
        </motion.svg>
      </div>
      <button
        ref={cornerRef}
        type="button"
        disabled={disabled}
        aria-pressed={isSaved}
        aria-label={`Save ${listing.title} at ${listing.company}`}
        onClick={(event) => {
          // Pointer presses arrive through the drag's tap; a click with no
          // pointer behind it (Space, Enter) folds through the same path.
          if (event.detail === 0 && !disabled) commitSave(!isSaved);
        }}
        onPointerEnter={(event) => {
          if (event.pointerType === "mouse" && !disabled) setHint(true);
        }}
        onPointerLeave={() => setHint(false)}
        {...drag}
        onPointerDown={(event) => {
          // A mouse drag from the corner must not start a text selection
          // across the card: the selection steals the pointer mid-fold.
          if (event.pointerType === "mouse") event.preventDefault();
          drag.onPointerDown(event);
        }}
        className={cn(
          // Square, so the very tip of the corner (outside the card's rounded
          // edge) can still be grabbed; rounded only while it shows a ring.
          "absolute top-0 right-0 z-20 cursor-pointer touch-none outline-none select-none focus-visible:rounded-tr-4",
          "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
          "disabled:cursor-not-allowed",
        )}
        style={{ width: s, height: s }}
      />
      <span role="status" aria-live="polite" className="sr-only">
        {sentence}
      </span>
    </article>
  );
}
