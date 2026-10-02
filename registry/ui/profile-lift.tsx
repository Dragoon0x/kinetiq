"use client";

import * as React from "react";

import {
  animate,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
  type Transition,
} from "motion/react";
import { ArrowUpRight, Check, Plus, X } from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade,
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type ProfileFigure = {
  id: string;
  /** What is counted, under the number: "Followers". */
  label: string;
  value: number;
};

export type ProfileLink = {
  id: string;
  label: string;
  /** A quieter second line: what is behind the link. */
  detail?: string;
  href: string;
};

export type ProfileMutuals = {
  /** The first few, by name, in the order they are listed. */
  names: string[];
  /** Everyone in common, the named ones included. */
  total: number;
};

export type ProfileLiftSize = "sm" | "md" | "lg";
export type ProfileLiftStats = "count" | "still" | "off";

export type ProfileLiftProps = {
  /** The person: the card's heading, the portrait's seed and every accessible name. @default "Ines Calder" */
  name?: string;
  /** Shown in the open sheet above the bio. @default "@ines.calder" */
  handle?: string;
  /** The line under the name. @default "Product designer at Fernworks" */
  role?: string;
  /** What fills the portrait disc: an `<img>`, an SVG. @default a portrait drawn from the name */
  portrait?: React.ReactNode;
  /** The open sheet's paragraph. */
  bio?: string;
  /** The counted row. The first figure is the followers count, which following adds one to. */
  figures?: ProfileFigure[];
  /** The open sheet's links. */
  links?: ProfileLink[];
  /** Followers in common: named ones first, then a count. */
  mutuals?: ProfileMutuals;
  /** Controlled: whether the viewer follows this person. */
  following?: boolean;
  /** Initial follow state when uncontrolled. @default false */
  defaultFollowing?: boolean;
  /** Fires from the press that changed it, with the new state. */
  onFollowingChange?: (following: boolean) => void;
  /** Controlled: whether the card is open as the full sheet. */
  expanded?: boolean;
  /** Initial sheet state when uncontrolled. @default false */
  defaultExpanded?: boolean;
  /** Fires from the press or the Escape that opened or closed the sheet. */
  onExpandedChange?: (expanded: boolean) => void;
  /** The follow button before following. @default "Follow" */
  followLabel?: string;
  /** The follow button once following. @default "Following" */
  followingLabel?: string;
  /** How far the portrait steps out of its frame, 0 to 1: how high it rises, how much it grows and how deep its shadow falls. @default 0.6 */
  lift?: number;
  /** How far the card turns toward the pointer, in degrees on each axis; 0 holds it flat. @default 6 */
  tilt?: number;
  /** What the figures do as the portrait lifts: count up from zero, stay still, or leave the card. @default "count" */
  stats?: ProfileLiftStats;
  /** How long the count-up runs, in ms. @default 700 */
  countDuration?: number;
  /** How a figure is written. @default compact en-US, "2.4K" */
  formatFigure?: (value: number) => string;
  /** The portrait: 72, 88 or 104 px across. @default "md" */
  size?: ProfileLiftSize;
  /** The follow button's fill and the drawn portrait's hue, any CSS colour. @default "var(--accent)" */
  accent?: string;
  /** Play the sheet's swish and the follow pop. Off unless asked for. @default false */
  sound?: boolean;
  /** Nothing lifts, tilts or opens, and the card is drawn at reduced strength. @default false */
  disabled?: boolean;
  /** Classes for the card's outer box. */
  className?: string;
};

export const defaultProfileFigures: ProfileFigure[] = [
  { id: "followers", label: "Followers", value: 2418 },
  { id: "following", label: "Following", value: 312 },
  { id: "projects", label: "Projects", value: 46 },
];

export const defaultProfileLinks: ProfileLink[] = [
  {
    id: "work",
    label: "Selected work",
    detail: "14 case studies",
    href: "#work",
  },
  {
    id: "notes",
    label: "Field notes",
    detail: "Weekly, since 2023",
    href: "#notes",
  },
  {
    id: "talks",
    label: "Talks",
    detail: "Gaugeworks Summit, 2026",
    href: "#talks",
  },
];

export const defaultProfileMutuals: ProfileMutuals = {
  names: ["Tomas Reyes", "Aiko Brandt", "Lena Okafor"],
  total: 12,
};

export const defaultProfileBio =
  "Designs the instruments field teams read in bad weather: big type, honest numbers, nothing that moves without a reason. Before that, maps at Basinworks.";

type Geometry = { disc: number; frame: number };

const SIZES: Record<ProfileLiftSize, Geometry> = {
  sm: { disc: 72, frame: 92 },
  md: { disc: 88, frame: 112 },
  lg: { disc: 104, frame: 132 },
};

/** The sheet's header portrait, whatever the card's size. */
const SHEET_DISC = 56;
/** Where the docked follow pill's top sits, above the frame's lower edge: it overlaps the rim, not the well. */
const DOCK_OVERLAP = 8;
/** How far the portrait rises at full lift, and how much it grows. */
const RISE = 26;
const GROW = 0.16;

const r2 = (v: number) => Math.round(v * 100) / 100;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

const COMPACT = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});
const GROUPED = new Intl.NumberFormat("en-US");

/** FNV-1a: a name always draws the same portrait, on the server and in the browser. */
function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/**
 * A head-and-shoulders portrait drawn from a name. Every colour is the
 * accent's hue turned by a seeded amount at a fixed lightness (pigment, not
 * text colour), so a face reads the same on a light page and a dark one.
 */
function Portrait({ seed, accent }: { seed: string; accent: string }) {
  const h = hash(seed);
  const shift = (h % 61) - 30;
  const hair = (h >>> 7) % 3;
  const headY = 40 + ((h >>> 11) % 4);
  const tint = (l: number, c: number, dh: number) =>
    `oklch(from ${accent} ${l} ${c} calc(h + ${shift + dh}))`;
  return (
    <span
      aria-hidden
      className="block size-full"
      style={{
        background: `radial-gradient(circle at 30% 20%, color-mix(in oklab, white 30%, transparent), transparent 58%), linear-gradient(160deg, ${tint(0.74, 0.09, 0)}, ${tint(0.47, 0.12, 26)})`,
      }}
    >
      <svg viewBox="0 0 100 100" className="block size-full">
        <path
          d="M12 104 C14 80 31 67 50 67 C69 67 86 80 88 104 Z"
          style={{ fill: tint(0.9, 0.035, -10) }}
        />
        <circle
          cx={50}
          cy={headY}
          r={17}
          style={{ fill: tint(0.95, 0.025, -10) }}
        />
        {hair === 1 ? (
          <path
            d={`M32 ${headY + 1} C31 ${headY - 24} 69 ${headY - 24} 68 ${headY + 1} C62 ${headY - 9} 38 ${headY - 9} 32 ${headY + 1} Z`}
            style={{ fill: tint(0.42, 0.06, 40) }}
          />
        ) : hair === 2 ? (
          <>
            <circle
              cx={50}
              cy={headY - 20}
              r={7}
              style={{ fill: tint(0.4, 0.05, 40) }}
            />
            <path
              d={`M33 ${headY - 2} C34 ${headY - 21} 66 ${headY - 21} 67 ${headY - 2} C60 ${headY - 12} 40 ${headY - 12} 33 ${headY - 2} Z`}
              style={{ fill: tint(0.4, 0.05, 40) }}
            />
          </>
        ) : null}
      </svg>
    </span>
  );
}

function MutualStack({ names, accent }: { names: string[]; accent: string }) {
  return (
    <span aria-hidden className="flex shrink-0 items-center">
      {names.slice(0, 3).map((n, i) => (
        <span
          key={n}
          className={cn(
            "block size-5 overflow-clip rounded-full ring-2 ring-card",
            i > 0 && "-ml-1.5",
          )}
        >
          <Portrait seed={n} accent={accent} />
        </span>
      ))}
    </span>
  );
}

/** "Followed by Tomas Reyes, Aiko Brandt and 10 others", plurals right. */
function followedBy(mutuals: ProfileMutuals, named: number): string {
  const shown = mutuals.names.slice(0, Math.max(0, named));
  const rest = Math.max(0, mutuals.total - shown.length);
  if (shown.length === 0) {
    return rest === 1 ? "1 follower in common" : `${rest} followers in common`;
  }
  const others = rest === 1 ? "1 other" : `${rest} others`;
  if (rest === 0) {
    const last = shown[shown.length - 1] ?? "";
    return shown.length === 1
      ? `Followed by ${last}`
      : `Followed by ${shown.slice(0, -1).join(", ")} and ${last}`;
  }
  return `Followed by ${shown.join(", ")} and ${others}`;
}

type FollowPillProps = {
  following: boolean;
  onToggle: (event: React.MouseEvent<HTMLButtonElement>) => void;
  followLabel: string;
  followingLabel: string;
  name: string;
  accent: string;
  disabled: boolean;
  motionSafe: boolean;
  wide?: boolean;
};

/**
 * The follow toggle. Each state's glyph and word are one layer, and both
 * layers share a grid cell, so the pill is always as wide as the longer one;
 * the layers trade places on the flick spring.
 */
function FollowPill({
  following,
  onToggle,
  followLabel,
  followingLabel,
  name,
  accent,
  disabled,
  motionSafe,
  wide = false,
}: FollowPillProps) {
  const flick: Transition = motionSafe
    ? springs.flick
    : { duration: durations.fast };
  const layer = (state: boolean) => {
    const shown = state === following;
    const away = motionSafe ? (state ? distances.nudge : -distances.nudge) : 0;
    return (
      <motion.span
        key={state ? "on" : "off"}
        className="col-start-1 row-start-1 inline-flex items-center justify-center gap-1.5"
        initial={false}
        animate={shown ? { opacity: 1, y: 0 } : { opacity: 0, y: away }}
        transition={flick}
      >
        {state ? (
          <Check aria-hidden className="size-3.5 shrink-0" strokeWidth={2.4} />
        ) : (
          <Plus aria-hidden className="size-3.5 shrink-0" strokeWidth={2.4} />
        )}
        {state ? followingLabel : followLabel}
      </motion.span>
    );
  };
  return (
    <button
      type="button"
      aria-pressed={following}
      aria-label={`${followLabel} ${name}`}
      disabled={disabled}
      onClick={onToggle}
      className={cn(
        "inline-grid shrink-0 cursor-pointer place-items-center rounded-full border font-medium transition-[background-color,border-color,color] outline-none",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
        "disabled:cursor-not-allowed",
        wide ? "h-9 w-full px-4 text-sm" : "h-7 px-3 text-xs",
        following
          ? "border-hairline-strong bg-card text-foreground hover:bg-surface-2"
          : "border-transparent text-primary-foreground hover:brightness-110",
      )}
      style={following ? undefined : { background: accent }}
    >
      <span aria-hidden className="grid">
        {layer(false)}
        {layer(true)}
      </span>
    </button>
  );
}

type FigureCellProps = {
  figure: ProfileFigure;
  value: number;
  format: (value: number) => string;
  register: (id: string, start: (() => void) | null) => void;
  duration: number;
  delay: number;
  motionSafe: boolean;
};

/**
 * One counted figure. The number on screen is a motion value written
 * straight into the text node, so a count-up re-renders nothing; the true
 * value sits beside it for assistive technology, which never hears a count.
 */
function FigureCell({
  figure,
  value,
  format,
  register,
  duration,
  delay,
  motionSafe,
}: FigureCellProps) {
  const shown = useMotionValue(value);
  const text = useTransform(shown, (v) => format(Math.round(v)));
  const anim = React.useRef<AnimationPlaybackControls | null>(null);
  const target = React.useRef(value);

  // A changed value (following adds one) rolls to it from where it shows.
  React.useEffect(() => {
    if (target.current === value) return;
    target.current = value;
    anim.current?.stop();
    if (!motionSafe) {
      shown.set(value);
      return;
    }
    anim.current = animate(shown, value, {
      duration: durations.slow,
      ease: easings.enter,
    });
  }, [value, motionSafe, shown]);

  React.useEffect(() => {
    register(figure.id, () => {
      anim.current?.stop();
      shown.set(0);
      anim.current = animate(shown, target.current, {
        duration: Math.max(0.05, duration / 1000),
        ease: easings.enter,
        delay,
      });
    });
    return () => register(figure.id, null);
  }, [figure.id, register, shown, duration, delay]);

  React.useEffect(
    () => () => {
      anim.current?.stop();
      // A count cut short by unmounting still lands on the value.
      shown.set(target.current);
    },
    [shown],
  );

  return (
    <div className="flex min-w-0 flex-col-reverse items-center gap-0.5">
      <dt className="max-w-full truncate text-[11px] text-ink-3">
        {figure.label}
      </dt>
      <dd className="font-mono text-base leading-6 text-foreground tabular-nums">
        <motion.span aria-hidden>{text}</motion.span>
        <span className="sr-only">{GROUPED.format(value)}</span>
      </dd>
    </div>
  );
}

/**
 * A person's card whose portrait steps out of its frame. Hovering it, or
 * moving keyboard focus into it, lifts the portrait out of its circular well
 * on the snap spring — it rises and grows past the frame's edge while its
 * shadow falls on the card below and softens with the height, the frame left
 * behind as an empty ring — as the figures count up from zero and the follow
 * pill docks on the frame's lower edge. A mouse or pen tilts the card toward
 * itself on the glide spring, the lifted portrait shifting further than the
 * card so it visibly floats above it.
 *
 * Pressing the card grows it into a sheet with the bio, links and followers in
 * common: one shared-layout surface on the glide spring, the portrait, name,
 * role and figures travelling to their new places. The sheet is a real
 * disclosure: focus moves to its close button, Escape anywhere in the card
 * closes it, and focus goes back to the card. Under reduced motion nothing
 * tilts, rises or travels: the frame lights, the shadow and follow pill fade
 * in place, the figures show their values and the sheet cross-fades.
 */
export function ProfileLift({
  name = "Ines Calder",
  handle = "@ines.calder",
  role = "Product designer at Fernworks",
  portrait,
  bio = defaultProfileBio,
  figures = defaultProfileFigures,
  links = defaultProfileLinks,
  mutuals = defaultProfileMutuals,
  following,
  defaultFollowing = false,
  onFollowingChange,
  expanded,
  defaultExpanded = false,
  onExpandedChange,
  followLabel = "Follow",
  followingLabel = "Following",
  lift = 0.6,
  tilt = 6,
  stats = "count",
  countDuration = 700,
  formatFigure,
  size = "md",
  accent = "var(--accent)",
  sound = false,
  disabled = false,
  className,
}: ProfileLiftProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const nameId = `${uid}-name`;
  const sheetId = `${uid}-sheet`;
  const geo = SIZES[size] ?? SIZES.md;
  const height = clamp(lift, 0, 1);
  const lean = clamp(tilt, 0, 10);
  const format = formatFigure ?? ((v: number) => COMPACT.format(v));

  const [ownFollowing, setOwnFollowing] = React.useState(defaultFollowing);
  const isFollowing = following ?? ownFollowing;
  const [ownOpen, setOwnOpen] = React.useState(defaultExpanded);
  const isOpen = expanded ?? ownOpen;

  const [hover, setHover] = React.useState(false);
  const [focusWithin, setFocusWithin] = React.useState(false);
  const [pressing, setPressing] = React.useState(false);
  const revealed = !disabled && !isOpen && (hover || focusWithin || pressing);

  // Spoken once, from the value that was just shown.
  const [spoken, setSpoken] = React.useState("");
  const [seenFollowing, setSeenFollowing] = React.useState(isFollowing);
  if (seenFollowing !== isFollowing) {
    setSeenFollowing(isFollowing);
    setSpoken(isFollowing ? `Following ${name}` : `Unfollowed ${name}`);
  }
  // Content that arrives after the first open fades in; the first render does not.
  const [everOpened, setEverOpened] = React.useState(isOpen);
  if (isOpen && !everOpened) setEverOpened(true);
  /** Where the lifted portrait was when the sheet took it, so it starts there. */
  const [handoff, setHandoff] = React.useState({ y: 0, scale: 1 });

  const rise = useMotionValue(0);
  const glow = useMotionValue(0);
  const dock = useMotionValue(0);
  const nx = useMotionValue(0);
  const ny = useMotionValue(0);
  const press = useMotionValue(1);

  const rootRef = React.useRef<HTMLElement | null>(null);
  const anims = React.useRef(new Map<string, AnimationPlaybackControls>());
  const starters = React.useRef(new Map<string, () => void>());
  const focusClose = React.useRef(false);
  const focusTrigger = React.useRef(false);
  const [closeNode, setCloseNode] = React.useState<HTMLButtonElement | null>(
    null,
  );
  const [triggerNode, setTriggerNode] =
    React.useState<HTMLButtonElement | null>(null);
  const [surfaceNode, setSurfaceNode] = React.useState<HTMLDivElement | null>(
    null,
  );
  /** The card's flow height, in px; below zero until the surface is first measured ("auto"). */
  const flowSpring = useMotionValue(-1);
  /** The surface's drawn height while a morph runs, 0 otherwise. */
  const drawn = useMotionValue(0);
  const flowHeight = useTransform(
    [flowSpring, drawn] as MotionValue<number>[],
    ([f = -1, d = 0]: number[]): number | string =>
      f < 0 ? "auto" : r2(Math.max(f, d)),
  );
  const flowTarget = React.useRef<number | null>(null);
  const followFrame = React.useRef(0);

  const run = React.useCallback(
    (key: string, controls: AnimationPlaybackControls) => {
      anims.current.get(key)?.stop();
      anims.current.set(key, controls);
    },
    [],
  );

  // The card's flow height follows the surface's layout height on the same
  // spring as the morph, started in the same frame (measured as the swap
  // commits, before paint), so the surface never draws past the card's box.
  React.useLayoutEffect(() => {
    if (!surfaceNode) return;
    const h = r2(surfaceNode.offsetHeight);
    if (flowTarget.current === null || !motionSafe) {
      flowTarget.current = h;
      anims.current.get("flow")?.stop();
      flowSpring.jump(h);
      return;
    }
    if (h === flowTarget.current) return;
    // Growing, the box leads the surface; shrinking, it trails it by two
    // frames, so the morph is always inside it.
    const shrinking = h < flowTarget.current;
    flowTarget.current = h;
    run(
      "flow",
      animate(flowSpring, h, {
        ...springs.glide,
        delay: shrinking ? 0.034 : 0,
      }),
    );
    // A morph that restarts mid-way (a hover or a focus change re-renders
    // it) loses its speed and can fall behind the spring: for the length of
    // the morph the box is never shorter than the surface as drawn.
    window.cancelAnimationFrame(followFrame.current);
    const started = performance.now();
    const follow = () => {
      if (performance.now() - started > 1200) {
        drawn.set(0);
        return;
      }
      drawn.set(r2(surfaceNode.getBoundingClientRect().height));
      followFrame.current = window.requestAnimationFrame(follow);
    };
    followFrame.current = window.requestAnimationFrame(follow);
  }, [isOpen, surfaceNode, motionSafe, flowSpring, drawn, run]);

  React.useEffect(
    () => () => window.cancelAnimationFrame(followFrame.current),
    [],
  );

  // Any other change of size (the card's width, its content) is followed at
  // once, or retargeted if a morph is still running. A ResizeObserver reads
  // layout, not the transform a morph is drawing.
  React.useEffect(() => {
    if (!surfaceNode) return;
    const ro = new ResizeObserver(() => {
      const h = r2(surfaceNode.offsetHeight);
      if (h === flowTarget.current) return;
      flowTarget.current = h;
      if (flowSpring.isAnimating()) {
        run("flow", animate(flowSpring, h, springs.glide));
      } else {
        flowSpring.jump(h);
      }
    });
    ro.observe(surfaceNode);
    return () => ro.disconnect();
  }, [surfaceNode, flowSpring, run]);

  const register = React.useCallback(
    (id: string, start: (() => void) | null) => {
      if (start) starters.current.set(id, start);
      else starters.current.delete(id);
    },
    [],
  );

  // The reveal: the portrait pops out on snap (one crisp overshoot) and
  // settles back on glide; the pill docks a beat after the lift and leaves on
  // the exit tween, because exits never spring.
  React.useEffect(() => {
    if (revealed) {
      if (stats === "count" && motionSafe && rise.get() < 0.25) {
        for (const start of starters.current.values()) start();
      }
      if (motionSafe) {
        run("rise", animate(rise, 1, springs.snap));
        run("dock", animate(dock, 1, { ...springs.snap, delay: 0.06 }));
      } else {
        rise.jump(0);
        dock.jump(1);
      }
      run(
        "glow",
        animate(glow, 1, { duration: durations.base, ease: easings.enter }),
      );
      return;
    }
    if (motionSafe) {
      run("rise", animate(rise, 0, springs.glide));
      run("dock", animate(dock, 0, exitFor(durations.base)));
    } else {
      rise.jump(0);
    }
    run("glow", animate(glow, 0, exitFor(durations.base)));
  }, [revealed, motionSafe, stats, rise, dock, glow, run]);

  // Tilt is pointer-led and never shows on a sheet or under reduced motion.
  React.useEffect(() => {
    if (isOpen || !motionSafe || disabled) {
      run("nx", animate(nx, 0, springs.glide));
      run("ny", animate(ny, 0, springs.glide));
    }
  }, [isOpen, motionSafe, disabled, nx, ny, run]);

  React.useEffect(() => {
    if (!closeNode || !focusClose.current) return;
    focusClose.current = false;
    closeNode.focus({ preventScroll: true });
  }, [closeNode]);

  React.useEffect(() => {
    if (!triggerNode || !focusTrigger.current) return;
    focusTrigger.current = false;
    triggerNode.focus({ preventScroll: true });
  }, [triggerNode]);

  React.useEffect(() => {
    const running = anims.current;
    return () => {
      for (const c of running.values()) c.stop();
      running.clear();
    };
  }, []);

  const panOf = () => {
    const rect = rootRef.current?.getBoundingClientRect();
    return rect ? panFrom(rect.left + rect.width / 2, null) : 0;
  };

  const setOpen = (next: boolean) => {
    if (disabled || next === isOpen) return;
    if (next) {
      // The sheet's portrait starts where the lifted one is, in its own scale.
      const r = rise.get();
      setHandoff({
        y: r2((-RISE * height * r * SHEET_DISC) / geo.disc),
        scale: r2(1 + GROW * height * r),
      });
      focusClose.current = true;
    } else {
      focusTrigger.current =
        rootRef.current?.contains(document.activeElement) ?? false;
    }
    if (expanded === undefined) setOwnOpen(next);
    onExpandedChange?.(next);
    audio.play("swish", {
      pitch: next ? 1.15 : 0.85,
      gain: 0.45,
      pan: panOf(),
    });
  };

  const toggleFollow = () => {
    if (disabled) return;
    const next = !isFollowing;
    if (following === undefined) setOwnFollowing(next);
    onFollowingChange?.(next);
    audio.play("pop", { pitch: next ? 1.2 : 0.85, gain: 0.55, pan: panOf() });
  };

  const onPointerMove = (event: React.PointerEvent<HTMLElement>) => {
    if (event.pointerType === "touch" || isOpen || disabled || !motionSafe) {
      return;
    }
    const rect = rootRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) return;
    const x = clamp(((event.clientX - rect.left) / rect.width) * 2 - 1, -1, 1);
    const y = clamp(((event.clientY - rect.top) / rect.height) * 2 - 1, -1, 1);
    run("nx", animate(nx, r2(x), springs.glide));
    run("ny", animate(ny, r2(y), springs.glide));
  };

  const endPress = () => {
    setPressing(false);
    run("press", animate(press, 1, springs.flick));
  };

  // The card turns its face toward the pointer: the side under it recedes.
  const rotateY = useTransform(nx, (v) => r2(v * lean));
  const rotateX = useTransform(ny, (v) => r2(-v * lean));
  // The lifted portrait floats above the card, so it travels further with
  // the tilt than the card does, and its shadow goes the other way.
  const discX = useTransform([nx, rise] as MotionValue<number>[], ([x, r]) =>
    r2((x as number) * 6 * height * (r as number)),
  );
  const discY = useTransform([ny, rise] as MotionValue<number>[], ([y, r]) =>
    r2(
      -(r as number) * height * RISE +
        (y as number) * 4 * height * (r as number),
    ),
  );
  const discScale = useTransform(rise, (r) => r2(1 + GROW * height * r));
  const shadowX = useTransform([nx, rise] as MotionValue<number>[], ([x, r]) =>
    r2(-(x as number) * 3 * height * (r as number)),
  );
  const shadowY = useTransform(rise, (r) => r2(r * height * 8));
  const shadowScale = useTransform(rise, (r) => r2(1 + r * height * 0.45));
  const shadowOpacity = useTransform(
    [glow, rise] as MotionValue<number>[],
    ([g, r]) =>
      r2(
        Math.min(1, (g as number) * (motionSafe ? 0.35 + 0.65 * height : 0.6)) *
          (1 - 0.35 * (r as number) * height),
      ),
  );
  const dockY = useTransform(dock, (d) => r2((1 - d) * -20));
  const dockScale = useTransform(dock, (d) => r2(0.7 + 0.3 * d));

  const layoutT: Transition = motionSafe ? springs.glide : { duration: 0 };
  const enterFade = (i: number) =>
    motionSafe
      ? {
          initial: { opacity: 0, y: distances.step },
          animate: { opacity: 1, y: 0 },
          transition: {
            y: { ...springs.glide, delay: 0.08 + i * cascade(4) },
            opacity: {
              duration: durations.base,
              ease: easings.enter,
              delay: 0.08 + i * cascade(4),
            },
          },
        }
      : {
          initial: { opacity: 0 },
          animate: { opacity: 1 },
          transition: { duration: durations.fast },
        };

  const shownFigures = figures.map((f, i) => ({
    figure: f,
    value: f.value + (i === 0 && isFollowing ? 1 : 0),
  }));

  const figureRow =
    stats !== "off" && shownFigures.length > 0 ? (
      <motion.dl
        layoutId={`${uid}-figures`}
        transition={layoutT}
        className="grid w-full gap-2"
        style={{
          gridTemplateColumns: `repeat(${shownFigures.length}, minmax(0, 1fr))`,
        }}
      >
        {shownFigures.map(({ figure, value }, i) => (
          <FigureCell
            key={figure.id}
            figure={figure}
            value={value}
            format={format}
            register={register}
            duration={countDuration}
            delay={i * cascade(shownFigures.length)}
            motionSafe={motionSafe}
          />
        ))}
      </motion.dl>
    ) : null;

  const pill = (wide: boolean) => (
    <FollowPill
      following={isFollowing}
      onToggle={toggleFollow}
      followLabel={followLabel}
      followingLabel={followingLabel}
      name={name}
      accent={accent}
      disabled={disabled}
      motionSafe={motionSafe}
      wide={wide}
    />
  );

  const ownPortrait = portrait ?? <Portrait seed={name} accent={accent} />;
  const fromFade = everOpened ? { opacity: 0 } : false;

  return (
    <article
      ref={rootRef}
      aria-labelledby={nameId}
      onPointerEnter={(event) => {
        if (event.pointerType !== "touch") setHover(true);
      }}
      onPointerLeave={() => {
        setHover(false);
        run("nx", animate(nx, 0, springs.glide));
        run("ny", animate(ny, 0, springs.glide));
      }}
      onPointerMove={onPointerMove}
      onFocus={() => setFocusWithin(true)}
      onBlur={(event) => {
        const to = event.relatedTarget;
        if (!(to instanceof Node) || !event.currentTarget.contains(to)) {
          setFocusWithin(false);
        }
      }}
      onKeyDown={(event) => {
        // Handled wherever focus is inside the card; the stage around it
        // must not also take this Escape.
        if (event.key === "Escape" && isOpen) {
          event.preventDefault();
          setOpen(false);
        }
      }}
      className={cn(
        "relative w-full max-w-80 overflow-clip p-2",
        disabled && "opacity-60",
        className,
      )}
    >
      {/* The card's flow height follows the surface on the same spring, so
          the morphing surface never draws outside the card's box and
          whatever sits under the card moves with it. */}
      <motion.div style={{ height: flowHeight }}>
        <motion.div
          ref={setSurfaceNode}
          layout
          transition={layoutT}
          className="relative overflow-clip border border-hairline bg-card"
          style={{
            borderRadius: 16,
            rotateX,
            rotateY,
            scale: press,
            transformPerspective: 1100,
          }}
        >
          {/* The card's own button lies under its content and is not part of
            the face's layout, so its focus ring follows the surface as it
            morphs. */}
          {!isOpen ? (
            <motion.button
              ref={setTriggerNode}
              type="button"
              aria-expanded={false}
              aria-label={`View ${name}'s profile`}
              disabled={disabled}
              initial={fromFade}
              animate={{ opacity: 1 }}
              transition={{ duration: durations.base }}
              onPointerDown={(event) => {
                if (event.pointerType === "mouse" && event.button !== 0) return;
                if (disabled) return;
                setPressing(true);
                if (motionSafe)
                  run("press", animate(press, 0.985, springs.flick));
              }}
              onPointerUp={endPress}
              onPointerCancel={endPress}
              onPointerLeave={endPress}
              onClick={() => setOpen(true)}
              className={cn(
                "absolute inset-0 z-0 cursor-pointer rounded-4 outline-none",
                "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
                "disabled:cursor-not-allowed",
              )}
            />
          ) : null}
          {isOpen ? (
            <motion.div
              key="sheet"
              layout
              transition={layoutT}
              role="region"
              id={sheetId}
              aria-labelledby={nameId}
              className="flex flex-col gap-4 p-5"
            >
              <div className="flex items-center gap-3">
                <motion.div
                  layoutId={`${uid}-portrait`}
                  transition={layoutT}
                  className="relative shrink-0 rounded-full"
                  style={{ width: SHEET_DISC, height: SHEET_DISC }}
                >
                  <motion.div
                    className="size-full overflow-clip rounded-full ring-2 ring-card"
                    initial={
                      motionSafe
                        ? { y: handoff.y, scale: handoff.scale }
                        : false
                    }
                    animate={{ y: 0, scale: 1 }}
                    transition={springs.glide}
                  >
                    {ownPortrait}
                  </motion.div>
                </motion.div>
                <div className="flex min-w-0 flex-1 flex-col items-start">
                  <motion.h3
                    layoutId={`${uid}-heading`}
                    transition={layoutT}
                    id={nameId}
                    title={name}
                    className="w-fit max-w-full truncate text-base leading-6 font-medium text-foreground"
                  >
                    {name}
                  </motion.h3>
                  <motion.p
                    {...enterFade(0)}
                    className="line-clamp-2 text-xs leading-4 text-ink-3"
                  >
                    {role}
                  </motion.p>
                </div>
                <motion.button
                  ref={setCloseNode}
                  type="button"
                  aria-expanded
                  aria-controls={sheetId}
                  aria-label={`Close ${name}'s profile`}
                  onClick={() => setOpen(false)}
                  {...enterFade(0)}
                  className={cn(
                    "inline-flex size-8 shrink-0 cursor-pointer items-center justify-center self-start rounded-2 text-ink-3 transition-colors outline-none",
                    "hover:bg-surface-2 hover:text-foreground",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
                  )}
                >
                  <X aria-hidden className="size-4" />
                </motion.button>
              </div>

              {figureRow}

              <motion.div {...enterFade(1)}>{pill(true)}</motion.div>

              <motion.div {...enterFade(2)} className="flex flex-col gap-1">
                {handle ? (
                  <p className="font-mono text-[11px] leading-4 text-ink-3">
                    {handle}
                  </p>
                ) : null}
                {bio ? (
                  <p className="text-sm leading-5 text-ink-2">{bio}</p>
                ) : null}
              </motion.div>

              {links.length > 0 ? (
                <motion.ul
                  {...enterFade(3)}
                  className="flex flex-col divide-y divide-hairline overflow-clip rounded-3 border border-hairline"
                >
                  {links.map((link) => (
                    <li key={link.id}>
                      <a
                        href={link.href}
                        className={cn(
                          "flex h-10 items-center gap-3 px-3 transition-colors outline-none",
                          "hover:bg-surface-2",
                          "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
                        )}
                      >
                        <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                          {link.label}
                        </span>
                        {link.detail ? (
                          <span className="max-w-[45%] shrink-0 truncate text-xs text-ink-3">
                            {link.detail}
                          </span>
                        ) : null}
                        <ArrowUpRight
                          aria-hidden
                          className="size-4 shrink-0 text-ink-3"
                        />
                      </a>
                    </li>
                  ))}
                </motion.ul>
              ) : null}

              {mutuals.total > 0 ? (
                <motion.div
                  {...enterFade(4)}
                  className="flex items-center gap-2"
                >
                  <MutualStack names={mutuals.names} accent={accent} />
                  <p className="min-w-0 text-xs leading-4 text-ink-2">
                    {followedBy(mutuals, 2)}
                  </p>
                </motion.div>
              ) : null}
            </motion.div>
          ) : (
            <motion.div
              key="face"
              layout
              transition={layoutT}
              className="pointer-events-none relative flex flex-col items-center px-5 pt-8 pb-5"
            >
              <div
                className="pointer-events-none relative z-[1]"
                style={{ width: geo.frame, height: geo.frame }}
              >
                {/* The frame: a recessed well that shows as an empty ring once
                  the portrait has left it. */}
                <span
                  aria-hidden
                  className="absolute inset-0 rounded-full border transition-[border-color] duration-200"
                  style={{
                    background:
                      "radial-gradient(circle at 50% 38%, var(--bg-1), var(--bg-2) 70%)",
                    boxShadow:
                      "inset 0 2px 7px color-mix(in oklab, black 26%, transparent), inset 0 -1px 0 color-mix(in oklab, white 6%, transparent)",
                    borderColor: revealed
                      ? `color-mix(in oklab, ${accent} 55%, transparent)`
                      : "var(--hairline-strong)",
                  }}
                />
                <motion.span
                  aria-hidden
                  className="absolute left-1/2 rounded-full"
                  style={{
                    width: r2(geo.disc * 0.92),
                    height: r2(geo.disc * 0.36),
                    marginLeft: r2(-geo.disc * 0.46),
                    top: r2(geo.frame / 2 + geo.disc * 0.2),
                    x: shadowX,
                    y: shadowY,
                    scaleX: shadowScale,
                    opacity: shadowOpacity,
                    background:
                      "radial-gradient(closest-side, color-mix(in oklab, black 42%, transparent), transparent)",
                  }}
                />
                <motion.div
                  layoutId={`${uid}-portrait`}
                  transition={layoutT}
                  className="absolute rounded-full"
                  style={{
                    left: (geo.frame - geo.disc) / 2,
                    top: (geo.frame - geo.disc) / 2,
                    width: geo.disc,
                    height: geo.disc,
                  }}
                >
                  <motion.div
                    className="size-full overflow-clip rounded-full ring-2 ring-card"
                    style={{ x: discX, y: discY, scale: discScale }}
                  >
                    {ownPortrait}
                  </motion.div>
                </motion.div>
                <motion.div
                  className={cn(
                    "absolute inset-x-0 flex justify-center",
                    revealed ? "pointer-events-auto" : "pointer-events-none",
                  )}
                  style={{
                    top: geo.frame - DOCK_OVERLAP,
                    y: dockY,
                    scale: dockScale,
                    opacity: glow,
                  }}
                >
                  {pill(false)}
                </motion.div>
              </div>

              <motion.h3
                layoutId={`${uid}-heading`}
                transition={layoutT}
                id={nameId}
                title={name}
                className="pointer-events-none relative z-[1] mt-7 w-fit max-w-full truncate text-base leading-6 font-medium text-foreground"
              >
                {name}
              </motion.h3>
              <motion.p
                initial={fromFade}
                animate={{ opacity: 1 }}
                transition={{ duration: durations.base }}
                title={role}
                className="pointer-events-none relative z-[1] w-fit max-w-full truncate text-xs leading-4 text-ink-3"
              >
                {role}
              </motion.p>

              {figureRow ? (
                <div className="pointer-events-none relative z-[1] mt-4 w-full">
                  {figureRow}
                </div>
              ) : null}

              {mutuals.total > 0 ? (
                <motion.div
                  initial={fromFade}
                  animate={{ opacity: 1 }}
                  transition={{ duration: durations.base }}
                  className="pointer-events-none relative z-[1] mt-4 flex w-full items-center gap-2 border-t border-hairline pt-3"
                >
                  <MutualStack names={mutuals.names} accent={accent} />
                  <p className="min-w-0 truncate text-xs leading-4 text-ink-2">
                    {followedBy(
                      {
                        ...mutuals,
                        names: mutuals.names.map((n) => n.split(" ")[0] ?? n),
                      },
                      1,
                    )}
                  </p>
                </motion.div>
              ) : null}
            </motion.div>
          )}
        </motion.div>
      </motion.div>
      <span aria-live="polite" className="sr-only">
        {spoken}
      </span>
    </article>
  );
}
