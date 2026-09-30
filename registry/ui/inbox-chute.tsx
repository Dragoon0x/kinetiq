"use client";

import * as React from "react";

import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  usePresence,
  useTransform,
  type AnimationPlaybackControls,
} from "motion/react";

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

export type InboxChuteTone = "info" | "success" | "warn" | "danger";

export type InboxChuteNotice = {
  id: string;
  title: string;
  body?: string;
  /** Colours its dot; danger is announced assertively. @default "info" */
  tone?: InboxChuteTone;
};

export type InboxChuteTray = "steel" | "wood" | "plastic";

export type InboxChuteProps = {
  /** The notices in the tray, oldest first. A new one drops down the chute. */
  notices: InboxChuteNotice[];
  /** A notice was dismissed from the fanned list: its ×, or Delete. */
  onDismiss?: (id: string) => void;
  /** Clear all tipped the tray. Without it, `onDismiss` fires for each. */
  onClearAll?: () => void;
  /** The inbox's accessible name. @default "Inbox" */
  label?: string;
  /** The Clear all button's text. @default "Clear all" */
  clearLabel?: string;
  /** How lively a landing is, 0 to 0.8: a dead drop, or a card that hops. @default 0.35 */
  bounce?: number;
  /** How untidy the pile is, 0 to 10 degrees. @default 4 */
  lean?: number;
  /** What the tray is made of: its look and the landing's voice. @default "steel" */
  tray?: InboxChuteTray;
  /** Play the landings, the fan and the clear. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

type Vars = React.CSSProperties & Record<`--${string}`, string>;

/** The tray's materials: pigments at fixed lightness from token hues. */
const MATERIAL: Record<InboxChuteTray, Vars> = {
  steel: {
    "--tray": "oklch(from var(--ink-3) 0.74 0.008 h)",
    "--tray-dark": "oklch(from var(--ink-3) 0.52 0.012 h)",
    "--tray-light": "oklch(from var(--ink-3) 0.9 0.005 h)",
    "--tray-ink": "oklch(from var(--ink-3) 0.3 0.02 h)",
  },
  wood: {
    "--tray": "oklch(from var(--warn) 0.6 0.085 calc(h - 28))",
    "--tray-dark": "oklch(from var(--warn) 0.44 0.07 calc(h - 30))",
    "--tray-light": "oklch(from var(--warn) 0.72 0.08 calc(h - 26))",
    "--tray-ink": "oklch(from var(--warn) 0.25 0.05 calc(h - 30))",
  },
  plastic: {
    "--tray": "oklch(from var(--accent-bright) 0.6 0.15 h)",
    "--tray-dark": "oklch(from var(--accent-bright) 0.46 0.15 h)",
    "--tray-light": "oklch(from var(--accent-bright) 0.8 0.09 h)",
    "--tray-ink": "oklch(from var(--accent-bright) 0.97 0.02 h)",
  },
};

/** How each tray answers a landing, as a pitch. */
const VOICE: Record<InboxChuteTray, number> = {
  steel: 1.3,
  wood: 0.8,
  plastic: 1.05,
};

const TONE_DOT: Record<InboxChuteTone, string> = {
  info: "bg-cobalt-bright",
  success: "bg-success",
  warn: "bg-warn",
  danger: "bg-danger",
};

/** The instrument's height, and where things sit in it. */
const H = 452;
const FLOOR = 380;
const CARD_H = 46;
const FAN_TOP = 10;
const CHUTE_END = 220;
/** Gravity, px/s². */
const G = 2400;
/** Paper does not bounce like a ball: the rebound speed is capped. */
const REBOUND_CAP = 380;
const HOP_MIN = 40;
/** Drops that arrive together leave the chute this far apart, in ms. */
const STAGGER = 160;
const TIP_DEG = 16;
const TILT_S = 0.3;
const SLIDE_A = 1500;

const r2 = (v: number) => Math.round(v * 100) / 100;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (t: number) => {
  const c = clamp(t, 0, 1);
  return c * c * (3 - 2 * c);
};

/** A spring from a stiffness and a damping ratio, at unit mass. */
const spring = (stiffness: number, ratio: number) => ({
  type: "spring" as const,
  stiffness,
  damping: 2 * ratio * Math.sqrt(stiffness),
  mass: 1,
});

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}

function lcg(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const sentence = (title: string, body?: string) => {
  const t = title.trim();
  if (!body?.trim()) return t;
  return `${t}${/[.!?]$/.test(t) ? " " : ". "}${body.trim()}`;
};
const noticesText = (n: number) => (n === 1 ? "1 notice" : `${n} notices`);

/** True while the visitor has just pressed or typed: the page has user activation. */
const visitorActed = () =>
  typeof navigator !== "undefined" &&
  navigator.userActivation?.isActive === true;

type Geometry = {
  /** The box's width. */
  w: number;
  cardW: number;
  trayW: number;
  /** How far the pile may drift sideways. */
  room: number;
  /** The fanned list's step. */
  pitch: number;
};

type Pose = { x: number; y: number; rot: number };

/** A card's place in the pile: seeded by its id, so it keeps its lean. */
function pilePose(
  id: string,
  index: number,
  count: number,
  lean: number,
  geo: Geometry,
): Pose {
  const rand = lcg(hash(id));
  const a = rand();
  const b = rand();
  const c = rand();
  // Each card sits a card's edge above the one under it, so the pile shows
  // its layers; the stack drifts one way as it grows, each card askew.
  const step = count > 12 ? Math.max(4, 88 / (count - 1)) : 8;
  const drift = index * lean * 1.1 + (c - 0.5) * lean * 0.9;
  return {
    x: r2(clamp(drift, -geo.room, geo.room)),
    y: r2(FLOOR - CARD_H - index * step),
    rot: r2(lean * (0.2 + (a - 0.5) * 1.5) + (b - 0.5) * lean * 0.3),
  };
}

const fanPose = (rank: number, geo: Geometry): Pose => ({
  x: 0,
  y: r2(FAN_TOP + rank * geo.pitch),
  rot: 0,
});

type ExitMode = "tip" | "sweep" | "single" | null;
type Arrival = { how: "drop" | "slide"; delay: number };

type CardProps = {
  notice: InboxChuteNotice;
  index: number;
  count: number;
  fanned: boolean;
  lean: number;
  bounce: number;
  geo: Geometry;
  motionSafe: boolean;
  arrival: Arrival | null;
  /** Under the top landed card of the pile. */
  buried: boolean;
  exitMode: React.RefObject<ExitMode>;
  active: boolean;
  bind: (id: string, node: HTMLLIElement | null) => void;
  onImpact: (id: string, speed: number) => void;
  onKey: (event: React.KeyboardEvent<HTMLLIElement>, id: string) => void;
  onPick: () => void;
  onDismiss: (id: string) => void;
  onFocus: (id: string) => void;
};

function Card(props: CardProps) {
  const { notice, index, count, fanned, geo, motionSafe } = props;
  const [isPresent, safeToRemove] = usePresence();
  const rank = count - 1 - index;
  const start =
    props.arrival?.how === "drop"
      ? { x: 0, y: -CARD_H - 12, rot: 0 }
      : fanned
        ? fanPose(rank, geo)
        : pilePose(notice.id, index, count, props.lean, geo);
  const x = useMotionValue(start.x);
  const y = useMotionValue(start.y);
  const rot = useMotionValue(start.rot);
  const opacity = useMotionValue(props.arrival && !motionSafe ? 0 : 1);

  const latest = React.useRef(props);
  React.useEffect(() => {
    latest.current = props;
  });
  const falling = React.useRef(false);
  const runs = React.useRef<AnimationPlaybackControls[]>([]);
  const halt = () => {
    for (const r of runs.current) r.stop();
    runs.current = [];
  };

  // Arriving. A drop falls through the chute under gravity, lands on the
  // pile and hops with `bounce`; a card that arrives while the pile is
  // fanned slides into the top of the list. A re-run starts it clean.
  React.useEffect(() => {
    const p = latest.current;
    if (!isPresent || !p.arrival) return;
    halt();
    const rest = p.fanned
      ? fanPose(p.count - 1 - p.index, p.geo)
      : pilePose(p.notice.id, p.index, p.count, p.lean, p.geo);
    if (!p.motionSafe) {
      x.set(rest.x);
      y.set(rest.y);
      rot.set(rest.rot);
      opacity.set(0);
      runs.current = [
        animate(opacity, 1, {
          duration: durations.base,
          ease: easings.enter,
          delay: p.arrival.delay / 1000,
        }),
      ];
      const t = window.setTimeout(
        () => latest.current.onImpact(p.notice.id, 600),
        p.arrival.delay,
      );
      return () => {
        window.clearTimeout(t);
        halt();
      };
    }
    if (p.arrival.how === "slide" || p.fanned) {
      x.set(rest.x);
      y.set(rest.y - distances.shift);
      rot.set(0);
      opacity.set(0);
      runs.current = [
        animate(y, rest.y, springs.glide),
        animate(opacity, 1, { duration: durations.base, ease: easings.enter }),
      ];
      latest.current.onImpact(p.notice.id, 0);
      return () => halt();
    }

    // The fall, solved: one linear clock, y(t) and the hops computed from it.
    const y0 = -CARD_H - 12;
    const drop = Math.max(1, rest.y - y0);
    const tFall = Math.sqrt((2 * drop) / G);
    const speed = G * tFall;
    const e = clamp(p.bounce, 0, 0.8);
    const hops: { at: number; v: number; dur: number }[] = [];
    let v = e * Math.min(speed, REBOUND_CAP);
    let at = tFall;
    while (v > HOP_MIN && hops.length < 6) {
      const dur = (2 * v) / G;
      hops.push({ at, v, dur });
      at += dur;
      v *= e;
    }
    const total = at;
    let hit = false;
    falling.current = true;
    x.set(0);
    y.set(y0);
    rot.set(0);
    opacity.set(1);
    const clock = animate(0, total, {
      duration: total,
      ease: easings.linear,
      delay: p.arrival.delay / 1000,
      onUpdate: (t) => {
        if (t < tFall) {
          const yy = y0 + 0.5 * G * t * t;
          y.set(r2(yy));
          // Out of the spout it drifts over to where the pile leans.
          x.set(
            r2(rest.x * smooth((yy - CHUTE_END) / (rest.y - CHUTE_END || 1))),
          );
          return;
        }
        if (!hit) {
          hit = true;
          x.set(rest.x);
          const zeta = lerp(1, 0.4, e / 0.8);
          runs.current.push(animate(rot, rest.rot, spring(260, zeta)));
          latest.current.onImpact(latest.current.notice.id, speed);
        }
        const hop = hops.find((h) => t >= h.at && t < h.at + h.dur);
        if (!hop) {
          y.set(rest.y);
          return;
        }
        const tau = t - hop.at;
        y.set(r2(rest.y - (hop.v * tau - 0.5 * G * tau * tau)));
      },
      onComplete: () => {
        y.set(rest.y);
        falling.current = false;
      },
    });
    runs.current.push(clock);
    return () => {
      falling.current = false;
      halt();
    };
    // Arrival is decided once, when the card mounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPresent]);

  // Following its place: the pile or the list, the lean, the count. Mode
  // changes travel on glide (gathering lands with `bounce`); a change of
  // box size alone moves it straight there.
  const target = fanned
    ? fanPose(rank, geo)
    : pilePose(notice.id, index, count, props.lean, geo);
  const geoKey = `${geo.room}|${geo.pitch}|${geo.cardW}`;
  const was = React.useRef({ fanned, index, count, lean: props.lean, geoKey });
  React.useEffect(() => {
    if (!isPresent || falling.current) return;
    const before = was.current;
    was.current = { fanned, index, count, lean: props.lean, geoKey };
    const moved =
      before.fanned !== fanned ||
      before.index !== index ||
      before.count !== count ||
      before.lean !== props.lean;
    // Nothing changed (a mount, a re-run, an arrival in progress): leave it.
    if (!moved && before.geoKey === geoKey) return;
    if (!moved || !motionSafe) {
      if (!motionSafe && before.fanned !== fanned) {
        // Nothing travels: a dip in opacity covers the swap.
        halt();
        runs.current = [
          animate(opacity, 0.2, {
            duration: durations.fast,
            ease: easings.exit,
            onComplete: () => {
              x.set(target.x);
              y.set(target.y);
              rot.set(target.rot);
              runs.current.push(
                animate(opacity, 1, {
                  duration: durations.fast,
                  ease: easings.enter,
                }),
              );
            },
          }),
        ];
        return;
      }
      halt();
      x.jump(target.x);
      y.jump(target.y);
      rot.jump(target.rot);
      return;
    }
    halt();
    const order = fanned ? rank : index;
    const delay = order * cascade(count);
    const feel = fanned
      ? springs.glide
      : spring(320, lerp(1, 0.42, clamp(props.bounce, 0, 0.8) / 0.8));
    runs.current = [
      animate(x, target.x, { ...feel, delay }),
      animate(y, target.y, { ...feel, delay }),
      animate(rot, target.rot, { ...feel, delay }),
    ];
    if (opacity.get() < 1) runs.current.push(animate(opacity, 1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isPresent,
    fanned,
    index,
    count,
    props.lean,
    geoKey,
    target.x,
    target.y,
    target.rot,
  ]);

  // Leaving: tipped off the tray with the pile, swept out of the list, or
  // faded when the host took it away. It always finishes, then it goes.
  React.useEffect(() => {
    if (isPresent) return;
    let live = true;
    const done = () => {
      if (live) safeToRemove?.();
    };
    const p = latest.current;
    const mode = p.exitMode.current;
    halt();
    falling.current = false;
    if (!p.motionSafe) {
      runs.current = [
        animate(opacity, 0, {
          duration: durations.fast,
          ease: easings.exit,
          onComplete: done,
        }),
      ];
    } else if (mode === "tip" && !p.fanned) {
      // It rides the tray's tilt about the tray's right end, then slides
      // off the low edge, top of the pile first.
      const px = p.geo.trayW / 2;
      const py = FLOOR + 10;
      const x0 = x.get();
      const r0 = rot.get();
      const cx0 = x0 - px;
      const cy0 = y.get() + CARD_H / 2 - py;
      const wait = (p.count - 1 - p.index) * 0.03;
      const total = TILT_S + wait + 0.95;
      const slope = (TIP_DEG * Math.PI) / 180;
      runs.current = [
        animate(0, total, {
          duration: total,
          ease: easings.linear,
          onUpdate: (t) => {
            const k = smooth(t / TILT_S);
            const th = slope * k;
            const c = Math.cos(th);
            const s = Math.sin(th);
            let cx = px + cx0 * c - cy0 * s;
            let cy = py + cx0 * s + cy0 * c;
            const ts = t - TILT_S - wait;
            if (ts > 0) {
              const d = 0.5 * SLIDE_A * ts * ts;
              cx += d * Math.cos(slope);
              cy += d * Math.sin(slope);
            }
            x.set(r2(cx));
            y.set(r2(cy - CARD_H / 2));
            rot.set(r2(r0 + TIP_DEG * k));
          },
          onComplete: done,
        }),
      ];
    } else if (mode === "tip" || mode === "sweep" || mode === "single") {
      const wait =
        mode === "single" ? 0 : (p.count - 1 - p.index) * cascade(p.count);
      runs.current = [
        animate(x, r2(x.get() + p.geo.w), {
          ...exitFor(durations.slow),
          delay: wait,
        }),
        animate(opacity, 0, {
          ...exitFor(durations.slow),
          delay: wait,
          onComplete: done,
        }),
      ];
    } else {
      runs.current = [
        animate(y, r2(y.get() - distances.step), exitFor(durations.base)),
        animate(opacity, 0, { ...exitFor(durations.base), onComplete: done }),
      ];
    }
    return () => {
      live = false;
      halt();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPresent]);

  React.useEffect(() => () => halt(), []);

  const tone = notice.tone ?? "info";
  // Under the top card only a card's edge shows: its words fade back, so a
  // sliver reads as paper rather than as half a line of text.
  const buried = !fanned && props.buried;
  return (
    <motion.li
      ref={(node: HTMLLIElement | null) => props.bind(notice.id, node)}
      tabIndex={fanned && isPresent ? (props.active ? 0 : -1) : undefined}
      aria-label={sentence(notice.title, notice.body)}
      aria-keyshortcuts={fanned ? "Delete" : undefined}
      onKeyDown={(event) => props.onKey(event, notice.id)}
      onFocus={() => props.onFocus(notice.id)}
      onClick={() => {
        if (!fanned) props.onPick();
      }}
      className={cn(
        "absolute top-0 left-1/2 flex items-center gap-2.5 rounded-3 border border-hairline bg-card pr-1.5 pl-3 outline-none",
        "[box-shadow:0_1px_2px_color-mix(in_oklab,var(--ink-3)_22%,transparent),0_4px_10px_-6px_color-mix(in_oklab,var(--ink-3)_40%,transparent)]",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
        fanned ? "cursor-default" : "cursor-pointer",
      )}
      style={{
        width: geo.cardW,
        height: CARD_H,
        marginLeft: -geo.cardW / 2,
        x,
        y,
        rotate: rot,
        opacity,
        zIndex: fanned ? count - index : index + 1,
      }}
    >
      <span
        aria-hidden
        className={cn(
          "size-2 shrink-0 rounded-full transition-opacity duration-300",
          TONE_DOT[tone],
          buried && "opacity-30",
        )}
      />
      <span
        className={cn(
          "min-w-0 flex-1 transition-opacity duration-300",
          buried && "opacity-15",
        )}
      >
        <span className="block truncate text-[13px] leading-[18px] font-medium text-foreground">
          {notice.title}
        </span>
        {notice.body ? (
          <span className="block truncate text-xs leading-4 text-ink-3">
            {notice.body}
          </span>
        ) : null}
      </span>
      {fanned ? (
        <button
          type="button"
          tabIndex={-1}
          aria-label={`Dismiss ${notice.title}`}
          onClick={(event) => {
            event.stopPropagation();
            props.onDismiss(notice.id);
          }}
          className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-2 text-ink-3 transition-colors outline-none hover:bg-surface-2 hover:text-foreground"
        >
          <svg
            aria-hidden
            viewBox="0 0 16 16"
            className="size-3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.8}
            strokeLinecap="round"
          >
            <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" />
          </svg>
        </button>
      ) : null}
    </motion.li>
  );
}

/* ------------------------------------------------------------------ *
 * The tray's face, per material.
 * ------------------------------------------------------------------ */

function TrayFace({ tray, width }: { tray: InboxChuteTray; width: number }) {
  const w = width;
  const h = 36;
  const taper = 8;
  const face = `M 0 0 H ${w} L ${w - taper} ${h - 6} Q ${w - taper - 1} ${h} ${w - taper - 6} ${h} H ${taper + 6} Q ${taper + 1} ${h} ${taper} ${h - 6} Z`;
  const grain = React.useMemo(() => {
    const rand = lcg(hash(`grain-${w}`));
    return Array.from({ length: 5 }, (_, i) => {
      const y = 6 + i * 5.5 + (rand() - 0.5) * 2;
      const bend = (rand() - 0.5) * 5;
      return `M ${taper + 2} ${r2(y)} C ${r2(w * 0.3)} ${r2(y + bend)}, ${r2(w * 0.6)} ${r2(y - bend)}, ${r2(w - taper - 2)} ${r2(y + bend * 0.4)}`;
    });
  }, [w]);
  return (
    <svg
      aria-hidden
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      className="absolute inset-0 block overflow-visible"
    >
      <path d={face} style={{ fill: "var(--tray)" }} />
      {tray === "wood"
        ? grain.map((d) => (
            <path
              key={d}
              d={d}
              fill="none"
              strokeWidth={0.8}
              strokeOpacity={0.45}
              style={{ stroke: "var(--tray-dark)" }}
            />
          ))
        : null}
      {tray === "steel"
        ? [
            [14, 12],
            [w - 14, 12],
          ].map(([cx, cy]) => (
            <circle
              key={cx}
              cx={cx}
              cy={cy}
              r={1.8}
              style={{ fill: "var(--tray-dark)" }}
            />
          ))
        : null}
      {tray === "plastic" ? (
        <path
          d={`M ${taper + 8} 7 H ${w - taper - 8}`}
          strokeWidth={3}
          strokeLinecap="round"
          strokeOpacity={0.5}
          style={{ stroke: "var(--tray-light)" }}
        />
      ) : null}
      <path
        d={`M 1 0.75 H ${w - 1}`}
        strokeWidth={1.5}
        strokeLinecap="round"
        style={{ stroke: "var(--tray-light)" }}
      />
      <path
        d={face}
        fill="none"
        strokeWidth={1}
        strokeOpacity={0.6}
        style={{ stroke: "var(--tray-dark)" }}
      />
    </svg>
  );
}

type Api = {
  onImpact: (id: string, speed: number) => void;
};

/**
 * An inbox you can watch fill. Each notice is a small card that drops
 * through a glass chute under gravity, lands on the pile in the tray and
 * hops with `bounce`, then tips over to its own lean; the pile gives a
 * little under it and the tray's count rolls on. `lean` makes the pile a
 * leaning, untidy stack — seeded per card, so every card keeps its angle.
 *
 * A tap on the tray fans the pile into a readable list on the glide spring,
 * newest first; another tap, or Escape, drops the cards back onto the pile.
 * In the list every card is focusable and dismissible with Delete or its ×.
 * Clear all tips the tray about its right end and the pile slides off.
 *
 * The fall is solved analytically on one linear clock — no per-frame React
 * state. Under reduced motion nothing falls or tips: cards fade in on the
 * pile, the list swaps in under an opacity dip, and the count still counts.
 */
export function InboxChute({
  notices,
  onDismiss,
  onClearAll,
  label = "Inbox",
  clearLabel = "Clear all",
  bounce = 0.35,
  lean = 4,
  tray = "steel",
  sound = false,
  disabled = false,
  className,
}: InboxChuteProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const listId = `${uid}-list`;
  const glassId = `chute-glass-${uid.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const hintId = `${uid}-hint`;
  const material = MATERIAL[tray] ?? MATERIAL.steel;
  const leanDeg = clamp(lean, 0, 10);
  const springy = clamp(bounce, 0, 0.8);
  const count = notices.length;

  // --- arrivals ----------------------------------------------------------
  const ids = notices.map((n) => n.id);
  const idsKey = ids.join("\u0001");
  const [seen, setSeen] = React.useState({ key: idsKey, ids });
  const [arrivals, setArrivals] = React.useState<Record<string, Arrival>>({});
  const [fanned, setFanned] = React.useState(false);
  const [polite, setPolite] = React.useState({ n: 0, text: "" });
  const [urgent, setUrgent] = React.useState({ n: 0, text: "" });
  if (seen.key !== idsKey) {
    const fresh = notices.filter((n) => !seen.ids.includes(n.id));
    setSeen({ key: idsKey, ids });
    const kept: Record<string, Arrival> = {};
    for (const [id, a] of Object.entries(arrivals)) {
      if (ids.includes(id)) kept[id] = a;
    }
    fresh.forEach((n, i) => {
      kept[n.id] = { how: fanned ? "slide" : "drop", delay: i * STAGGER };
    });
    setArrivals(kept);
    const newest = fresh[fresh.length - 1];
    if (newest) {
      const said =
        fresh.length > 1
          ? `${fresh.length} new notices. Newest: ${sentence(newest.title, newest.body)}`
          : `${newest.tone === "danger" ? "Urgent notice" : "New notice"}: ${sentence(newest.title, newest.body)}`;
      if (newest.tone === "danger") {
        setUrgent((u) => ({ n: u.n + 1, text: said }));
      } else {
        setPolite((p) => ({ n: p.n + 1, text: said }));
      }
    }
  }
  // A disabled or emptied inbox folds its list back into the pile.
  if (fanned && (disabled || count === 0)) setFanned(false);
  // The highest card that has landed: everything under it is buried. A
  // card still falling does not bury the one it will land on until it lands.
  let topLanded = -1;
  notices.forEach((n, i) => {
    if (arrivals[n.id]?.how !== "drop") topLanded = i;
  });
  const landed =
    count - Object.values(arrivals).filter((a) => a.how === "drop").length;

  // --- geometry ------------------------------------------------------------
  const [w, setW] = React.useState(320);
  const cardW = Math.max(160, Math.min(232, w - 56));
  const geo: Geometry = {
    w,
    cardW,
    trayW: cardW + 40,
    room: Math.max(0, (w - cardW) / 2 - 12),
    pitch: r2(
      clamp((FLOOR - 34 - FAN_TOP - CARD_H) / Math.max(1, count - 1), 22, 52),
    ),
  };

  const tip = useMotionValue(0);
  const give = useMotionValue(0);
  const fan = useMotionValue(0);
  const chuteOpacity = useTransform(fan, (f) => r2(1 - 0.78 * f));
  const shineOpacity = useTransform(fan, (f) => r2(1 - f));

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const trayRef = React.useRef<HTMLButtonElement | null>(null);
  const cards = React.useRef(new Map<string, HTMLLIElement>());
  const exitMode = React.useRef<ExitMode>(null);
  const loud = React.useRef(new Map<string, boolean>());
  const focusFan = React.useRef(false);
  const anims = React.useRef(new Map<string, AnimationPlaybackControls>());
  const timers = React.useRef<number[]>([]);
  const api = React.useRef<Api | null>(null);
  const [activeId, setActiveId] = React.useState<string | null>(null);

  const runAnim = (key: string, controls: AnimationPlaybackControls) => {
    anims.current.get(key)?.stop();
    anims.current.set(key, controls);
  };

  const pan = () => {
    const rect = rootRef.current?.getBoundingClientRect();
    return rect ? panFrom(rect.left + rect.width / 2, null) : 0;
  };

  // Whether each arrival was the visitor's doing, decided as it arrives: a
  // landing is heard only when it answers them.
  const arrivalsKey = Object.keys(arrivals).join("\u0001");
  React.useEffect(() => {
    for (const id of Object.keys(arrivals)) {
      if (!loud.current.has(id)) loud.current.set(id, visitorActed());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arrivalsKey]);

  const onImpact = (id: string, speed: number) => {
    setArrivals((a) => {
      if (!a[id]) return a;
      const next = { ...a };
      delete next[id];
      return next;
    });
    if (speed <= 0) return;
    if (loud.current.get(id)) {
      audio.play("thud", {
        pitch: VOICE[tray] ?? 1,
        gain: r2(0.35 + 0.35 * Math.min(1, speed / 1400)),
        pan: pan(),
      });
    }
    loud.current.delete(id);
    if (motionSafe) {
      give.set(0);
      runAnim(
        "give",
        animate(give, 0, {
          ...spring(700, 0.45),
          velocity: r2(40 + 60 * Math.min(1, speed / 1400)),
        }),
      );
    }
  };

  React.useEffect(() => {
    api.current = { onImpact };
  });
  const impact = React.useCallback(
    (id: string, speed: number) => api.current?.onImpact(id, speed),
    [],
  );

  const bindCard = React.useCallback(
    (id: string, node: HTMLLIElement | null) => {
      if (node) cards.current.set(id, node);
      else cards.current.delete(id);
    },
    [],
  );

  const bindRoot = React.useCallback((node: HTMLDivElement | null) => {
    rootRef.current = node;
    if (!node) return;
    const measure = () => setW(Math.max(200, Math.round(node.clientWidth)));
    measure();
    const sizer = new ResizeObserver(measure);
    sizer.observe(node);
    return () => sizer.disconnect();
  }, []);

  // --- fanning ---------------------------------------------------------------
  React.useEffect(() => {
    runAnim(
      "fan",
      animate(fan, fanned ? 1 : 0, {
        duration: durations.slow,
        ease: easings.enter,
      }),
    );
    if (fanned && focusFan.current) {
      focusFan.current = false;
      const newest = notices[notices.length - 1];
      if (newest) cards.current.get(newest.id)?.focus({ preventScroll: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fanned]);

  const toggleFan = (next = !fanned) => {
    if (disabled || (next && count === 0) || next === fanned) return;
    exitMode.current = null;
    focusFan.current = next;
    const newest = notices[notices.length - 1];
    if (next && newest) setActiveId(newest.id);
    audio.play("pop", { pitch: next ? 1.15 : 0.85, gain: 0.5, pan: pan() });
    setFanned(next);
  };

  const gather = () => {
    toggleFan(false);
    trayRef.current?.focus({ preventScroll: true });
  };

  const dismiss = (id: string) => {
    if (disabled) return;
    const index = notices.findIndex((n) => n.id === id);
    const gone = notices[index];
    if (!gone) return;
    exitMode.current = "single";
    // The neighbour below in the list is the next older one.
    const neighbour = notices[index - 1] ?? notices[index + 1];
    audio.play("swish", { pitch: 1.2, gain: 0.35, pan: pan() });
    setPolite((p) => ({
      n: p.n + 1,
      text: `Dismissed: ${gone.title}. ${noticesText(count - 1)} left.`,
    }));
    if (neighbour) {
      setActiveId(neighbour.id);
      cards.current.get(neighbour.id)?.focus({ preventScroll: true });
    } else {
      setFanned(false);
      trayRef.current?.focus({ preventScroll: true });
    }
    onDismiss?.(id);
  };

  const clearAll = () => {
    if (disabled || count === 0) return;
    for (const t of timers.current) window.clearTimeout(t);
    timers.current = [];
    exitMode.current = fanned ? "sweep" : "tip";
    audio.play("swish", { gain: 0.55, pan: pan() });
    setPolite((p) => ({ n: p.n + 1, text: "Tray cleared." }));
    if (motionSafe && !fanned) {
      runAnim(
        "tip",
        animate(0, 1, {
          duration: TILT_S,
          ease: easings.linear,
          onUpdate: (p) => tip.set(r2(TIP_DEG * smooth(p))),
        }),
      );
      const back = Math.round(
        (TILT_S + Math.min(12, count) * 0.03 + 0.5) * 1000,
      );
      timers.current.push(
        window.setTimeout(() => {
          runAnim("tip", animate(tip, 0, springs.recoil));
          timers.current.push(
            window.setTimeout(() => {
              audio.play("thud", {
                pitch: r2((VOICE[tray] ?? 1) * 0.9),
                gain: 0.4,
                pan: pan(),
              });
            }, 90),
          );
        }, back),
      );
    }
    if (fanned) {
      setFanned(false);
      trayRef.current?.focus({ preventScroll: true });
    }
    if (onClearAll) onClearAll();
    else for (const id of ids) onDismiss?.(id);
  };

  const onCardKey = (event: React.KeyboardEvent<HTMLLIElement>, id: string) => {
    if (!fanned) return;
    // The list reads newest first: down is older.
    const order = [...notices].reverse();
    const at = order.findIndex((n) => n.id === id);
    const go = (to: number) => {
      const target = order[clamp(to, 0, order.length - 1)];
      if (!target) return;
      setActiveId(target.id);
      cards.current.get(target.id)?.focus({ preventScroll: true });
    };
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        go(at + 1);
        return;
      case "ArrowUp":
        event.preventDefault();
        go(at - 1);
        return;
      case "Home":
        event.preventDefault();
        go(0);
        return;
      case "End":
        event.preventDefault();
        go(order.length - 1);
        return;
      case "Delete":
      case "Backspace":
        event.preventDefault();
        dismiss(id);
        return;
      case "Escape":
        // Handled where focus is; the stage must not also close.
        event.preventDefault();
        gather();
        return;
    }
  };

  React.useEffect(() => {
    const running = anims.current;
    return () => {
      for (const t of timers.current) window.clearTimeout(t);
      timers.current = [];
      for (const c of running.values()) c.stop();
      running.clear();
      // A tip cut short settles level rather than freezing askew.
      tip.set(0);
      give.set(0);
    };
  }, [tip, give]);

  const newest = notices[notices.length - 1];
  const rovingId =
    activeId && ids.includes(activeId) ? activeId : (newest?.id ?? null);
  const trayName =
    count === 0
      ? "Tray empty"
      : `${noticesText(count)} in the tray. Newest: ${sentence(newest?.title ?? "", newest?.body)}.`;
  const chuteW = cardW + 12;
  const funnel = 18;

  return (
    <div
      ref={bindRoot}
      role="region"
      aria-label={label}
      className={cn(
        "relative isolate w-full overflow-clip select-none",
        disabled && "opacity-50",
        className,
      )}
      style={{ height: H, ...material }}
    >
      {/* The chute: a glass tube, shaded at its walls so it reads round,
          held to the wall by two clamps. */}
      <motion.svg
        aria-hidden
        width={chuteW + funnel * 2}
        height={CHUTE_END + 8}
        viewBox={`0 0 ${chuteW + funnel * 2} ${CHUTE_END + 8}`}
        className="pointer-events-none absolute top-0 left-1/2 -translate-x-1/2"
        style={{ opacity: chuteOpacity }}
      >
        <defs>
          <linearGradient id={glassId} x1="0" y1="0" x2="1" y2="0">
            {[
              [0, 0.2],
              [0.14, 0.07],
              [0.5, 0.03],
              [0.86, 0.08],
              [1, 0.22],
            ].map(([offset, alpha]) => (
              <stop
                key={offset}
                offset={offset}
                stopOpacity={alpha}
                style={{ stopColor: "var(--ink-3)" }}
              />
            ))}
          </linearGradient>
        </defs>
        <path
          d={`M 0 0 L ${funnel} 22 V ${CHUTE_END} H ${funnel + chuteW} V 22 L ${chuteW + funnel * 2} 0 Z`}
          fill={`url(#${glassId})`}
        />
        <path
          d={`M 0.75 0 L ${funnel} 22 V ${CHUTE_END + 2} q 0 4 -4 5`}
          fill="none"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="stroke-ink-3/50"
        />
        <path
          d={`M ${chuteW + funnel * 2 - 0.75} 0 L ${funnel + chuteW} 22 V ${CHUTE_END + 2} q 0 4 4 5`}
          fill="none"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="stroke-ink-3/50"
        />
        <path
          d={`M ${funnel} 22 H ${funnel + chuteW}`}
          strokeWidth={1}
          strokeDasharray="2 3"
          className="stroke-ink-3/30"
        />
        {[70, 168].map((y) => (
          <g key={y} className="fill-ink-3/40">
            <rect x={funnel - 7} y={y} width={7} height={12} rx={1.5} />
            <rect x={funnel + chuteW} y={y} width={7} height={12} rx={1.5} />
          </g>
        ))}
      </motion.svg>

      {/* The tray's back rim, behind the pile. */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute left-1/2 -translate-x-1/2"
        style={{
          top: FLOOR - 26,
          width: geo.trayW,
          height: 60,
          rotate: tip,
          originX: 1,
          originY: 0.6,
        }}
      >
        <div
          className="absolute inset-x-1 top-1.5 h-3 rounded-t-3"
          style={{ background: "var(--tray-dark)" }}
        />
      </motion.div>

      {/* The notices: a pile, or a list. */}
      <motion.ol
        id={listId}
        aria-label="Notices"
        aria-hidden={!fanned || undefined}
        className="pointer-events-none absolute inset-0 z-10 [&>li]:pointer-events-auto"
        style={{ y: give }}
      >
        <AnimatePresence>
          {notices.map((n, i) => (
            <Card
              key={n.id}
              notice={n}
              index={i}
              count={count}
              fanned={fanned}
              lean={leanDeg}
              bounce={springy}
              geo={geo}
              motionSafe={motionSafe}
              arrival={arrivals[n.id] ?? null}
              buried={i < topLanded}
              exitMode={exitMode}
              active={n.id === rovingId}
              bind={bindCard}
              onImpact={impact}
              onKey={onCardKey}
              onPick={() => toggleFan(true)}
              onDismiss={dismiss}
              onFocus={setActiveId}
            />
          ))}
        </AnimatePresence>
      </motion.ol>

      {/* The chute's front: a highlight over whatever falls inside it. */}
      <motion.svg
        aria-hidden
        width={chuteW + funnel * 2}
        height={CHUTE_END + 8}
        viewBox={`0 0 ${chuteW + funnel * 2} ${CHUTE_END + 8}`}
        className="pointer-events-none absolute top-0 left-1/2 z-30 -translate-x-1/2"
        style={{ opacity: shineOpacity }}
      >
        <path
          d={`M ${funnel + 9} 28 V ${CHUTE_END - 10}`}
          strokeWidth={5}
          strokeLinecap="round"
          className="stroke-white/20"
        />
        <path
          d={`M ${funnel + 17} 28 V ${CHUTE_END - 60}`}
          strokeWidth={1.5}
          strokeLinecap="round"
          className="stroke-white/15"
        />
      </motion.svg>

      {/* The tray's face: the fan button, carrying the count. */}
      <motion.div
        className="absolute left-1/2 z-20 -translate-x-1/2"
        style={{
          top: FLOOR - 26,
          width: geo.trayW,
          height: 60,
          rotate: tip,
          originX: 1,
          originY: 0.6,
        }}
      >
        <button
          ref={trayRef}
          type="button"
          disabled={disabled || count === 0}
          aria-label={trayName}
          aria-expanded={fanned}
          aria-controls={listId}
          aria-describedby={hintId}
          onClick={() => toggleFan()}
          onKeyDown={(event) => {
            if (event.key === "Escape" && fanned) {
              event.preventDefault();
              toggleFan(false);
            }
          }}
          className={cn(
            "absolute inset-x-0 top-[18px] h-9 rounded-2 outline-none",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
            "enabled:cursor-pointer disabled:cursor-default",
          )}
        >
          <TrayFace tray={tray} width={geo.trayW} />
          <span className="relative flex h-full items-center justify-center gap-1.5 font-mono text-[11px] tracking-[0.08em] text-(--tray-ink) uppercase">
            <span className="grid overflow-clip [contain:paint]">
              <AnimatePresence initial={false}>
                <motion.span
                  key={landed}
                  className="col-start-1 row-start-1 tabular-nums"
                  initial={
                    motionSafe
                      ? { opacity: 0, y: distances.step }
                      : { opacity: 0 }
                  }
                  animate={{
                    opacity: 1,
                    y: 0,
                    transition: motionSafe
                      ? springs.snap
                      : { duration: durations.fast },
                  }}
                  exit={
                    motionSafe
                      ? {
                          opacity: 0,
                          y: -distances.step,
                          transition: exitFor(durations.fast),
                        }
                      : { opacity: 0, transition: exitFor(durations.fast) }
                  }
                >
                  {Math.max(0, landed)}
                </motion.span>
              </AnimatePresence>
            </span>
            <span>{landed === 1 ? "notice" : "notices"}</span>
          </span>
        </button>
      </motion.div>

      <div
        className="absolute inset-x-0 z-20 flex justify-center"
        style={{ top: FLOOR + 36 }}
      >
        <button
          type="button"
          disabled={disabled || count === 0}
          onClick={clearAll}
          className={cn(
            "inline-flex h-8 items-center rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none",
            "hover:bg-surface-2 hover:text-foreground",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
            "enabled:cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent",
          )}
        >
          {clearLabel}
        </button>
      </div>

      <p id={hintId} className="sr-only">
        Press to fan the pile into a list. In the list, arrow keys move, Delete
        dismisses and Escape gathers the pile.
      </p>
      <p role="status" className="sr-only">
        <span key={polite.n}>{polite.text}</span>
      </p>
      <p role="alert" className="sr-only">
        <span key={urgent.n}>{urgent.text}</span>
      </p>
    </div>
  );
}
