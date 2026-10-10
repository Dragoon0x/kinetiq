"use client";

import * as React from "react";

import { Ellipsis, Flag } from "lucide-react";
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
import { project, rubberband, useDrag } from "@/registry/lib/tactile-gesture";
import {
  panFrom,
  useTactileSound,
  type TactileSound,
} from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type LedgerSwipeTone =
  "accent" | "success" | "warn" | "danger" | "neutral";

export type LedgerSwipeAction = {
  id: string;
  /** One or two words: the button's text and accessible name. */
  label: string;
  /** 16px, drawn in currentColor. */
  icon?: React.ReactNode;
  /** The tile's pigment. @default "neutral" */
  tone?: LedgerSwipeTone;
  /** The action takes the row out of the list: it slides away and the gap closes. @default false */
  removes?: boolean;
};

export type LedgerSwipeItem = {
  id: string;
  /** The row's first line: a payee, a merchant. */
  title: string;
  /** A quieter second line: a category, a date. */
  subtitle?: string;
  /** Signed: money in is positive. Shown through `format`. */
  amount?: number;
  /** A 16px glyph in the row's tile. */
  icon?: React.ReactNode;
  /** Shows a flag beside the amount. */
  flagged?: boolean;
};

export type LedgerSwipeSides = "both" | "trailing" | "leading";
export type LedgerSwipeSize = "sm" | "md" | "lg";

export type LedgerSwipeProps = {
  items: LedgerSwipeItem[];
  /** Revealed by swiping left, from the right edge in: the first is the primary, which a long swipe commits. */
  trailingActions?: LedgerSwipeAction[];
  /** Revealed by swiping right, from the left edge in: the first is the primary. */
  leadingActions?: LedgerSwipeAction[];
  /** Which sides swipe: both, only left (trailing) or only right (leading). Every action stays in the menu either way. @default "both" */
  actions?: LedgerSwipeSides;
  /** An action was chosen — by a long swipe, a tap on its tile or the menu — with the row's id. Fires at the moment of choice. */
  onAction?: (actionId: string, itemId: string) => void;
  /** A row was swiped open (its id) or closed (null). */
  onOpenChange?: (itemId: string | null) => void;
  /** How far a swipe must travel to commit the primary, as a share of the row's width. @default 0.5 */
  threshold?: number;
  /** How much the row gives, 0 to 1: the rubber band past the end and on a side with no actions, and the bounce of the snap back. @default 0.5 */
  elastic?: number;
  /** Each action tile's width when the row is swiped open, in px. @default 64 */
  actionWidth?: number;
  /** The first time the list is on screen, the first row slides open a little and back: the gesture, shown. @default false */
  hint?: boolean;
  /** How an amount is written. @default signed, with thousands and two decimals */
  format?: (amount: number) => string;
  /** The list's accessible name. */
  label: string;
  /** Said and shown when every row has gone. @default "Nothing left to review" */
  emptyLabel?: string;
  /** @default "md" */
  size?: LedgerSwipeSize;
  /** A snap as a row snaps open or arms its primary, a swish as one slides away. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

type Side = "trailing" | "leading";

const ROW: Record<LedgerSwipeSize, number> = { sm: 48, md: 56, lg: 64 };

const TONES: Record<LedgerSwipeTone, { bg: string; fg: string }> = {
  accent: {
    bg: "oklch(from var(--accent) 0.55 c h)",
    fg: "var(--primary-foreground)",
  },
  success: {
    bg: "oklch(from var(--success) 0.56 c h)",
    fg: "var(--primary-foreground)",
  },
  warn: {
    bg: "oklch(from var(--warn) 0.8 c h)",
    fg: "oklch(from var(--warn) 0.3 c h)",
  },
  danger: {
    bg: "oklch(from var(--danger) 0.57 c h)",
    fg: "var(--primary-foreground)",
  },
  neutral: {
    bg: "oklch(from var(--ink-3) 0.58 c h)",
    fg: "var(--primary-foreground)",
  },
};

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const r2 = (v: number) => Math.round(v * 100) / 100;
const easeOut = (t: number) => 1 - (1 - t) * (1 - t);

/** A spring from a stiffness and a damping ratio, at unit mass. */
const spring = (stiffness: number, ratio: number) => ({
  type: "spring" as const,
  stiffness,
  damping: 2 * ratio * Math.sqrt(stiffness),
  mass: 1,
});

/** Thousands and two decimals by hand, so the server and the page agree. */
const money = (n: number) => {
  const cents = Math.round(Math.abs(n) * 100);
  const whole = String(Math.floor(cents / 100)).replace(
    /\B(?=(\d{3})+(?!\d))/g,
    ",",
  );
  const frac = String(cents % 100).padStart(2, "0");
  return `${n < 0 ? "−" : "+"}${whole}.${frac}`;
};

type Geo = {
  left: number;
  width: number;
  /** The content box's left, inside the tile. */
  cx: number;
  scale: number;
  opacity: number;
};

const NONE: Geo = { left: 0, width: 0, cx: 0, scale: 0.5, opacity: 0 };

/**
 * Where every tile sits for the row at `x` with the expanding tile `e`
 * armed by `a`. Tiles are pinned from the edge, one `A` wide, so they are
 * uncovered one after another; past all of them they share the room; armed,
 * the expanding tile takes the whole uncovered width and the rest fold away.
 */
function layout(
  x: number,
  a: number,
  e: number,
  W: number,
  A: number,
  nT: number,
  nL: number,
): { trailing: Geo[]; leading: Geo[] } {
  const out = {
    trailing: Array.from({ length: nT }, () => NONE),
    leading: Array.from({ length: nL }, () => NONE),
  };
  const side: Side | null =
    x < 0 && nT > 0 ? "trailing" : x > 0 && nL > 0 ? "leading" : null;
  if (!side || W <= 0) return out;
  const n = side === "trailing" ? nT : nL;
  const w = Math.min(W * 1.05, Math.abs(x));
  const base = Math.max(A, w / n);
  let cursor = side === "trailing" ? W : 0;
  out[side] = Array.from({ length: n }, (_, k) => {
    const grow = k === e ? a : 0;
    const width = lerp(base, k === e ? Math.max(w, base) : 0, a);
    const left = side === "trailing" ? cursor - width : cursor;
    cursor = side === "trailing" ? left : cursor + width;
    const centred = (width - A) / 2;
    const hug = side === "trailing" ? 0 : width - A;
    const frac = clamp01((w - k * A) / A);
    return {
      left: r2(left),
      width: r2(width),
      cx: r2(lerp(centred, hug, grow)),
      scale: r2(0.5 + 0.5 * easeOut(frac)),
      opacity: r2(frac),
    };
  });
  return out;
}

type Departure = { side: Side; actionId: string };

type RowProps = {
  item: LedgerSwipeItem;
  rowH: number;
  W: number;
  A: number;
  trailing: LedgerSwipeAction[];
  leading: LedgerSwipeAction[];
  threshold: number;
  elastic: number;
  motionSafe: boolean;
  audio: TactileSound;
  format: (amount: number) => string;
  open: boolean;
  departing: Departure | null;
  hintNow: boolean;
  disabled: boolean;
  menuOpen: boolean;
  menuId: string;
  onOpen: (id: string | null) => void;
  onChoose: (
    item: LedgerSwipeItem,
    action: LedgerSwipeAction,
    side: Side,
  ) => void;
  onGone: (id: string) => void;
  onMenu: (id: string, button: HTMLButtonElement) => void;
  registerButton: (id: string, el: HTMLButtonElement | null) => void;
};

function Tile({
  action,
  side,
  k,
  geo,
  rowH,
  A,
  live,
  onPress,
}: {
  action: LedgerSwipeAction;
  side: Side;
  k: number;
  geo: MotionValue<{ trailing: Geo[]; leading: Geo[] }>;
  rowH: number;
  A: number;
  live: boolean;
  onPress: () => void;
}) {
  const pick = (g: { trailing: Geo[]; leading: Geo[] }) => g[side][k] ?? NONE;
  const left = useTransform(geo, (g) => pick(g).left);
  const width = useTransform(geo, (g) => pick(g).width);
  const cx = useTransform(geo, (g) => pick(g).cx);
  const scale = useTransform(geo, (g) => pick(g).scale);
  const opacity = useTransform(geo, (g) => pick(g).opacity);
  const tone = TONES[action.tone ?? "neutral"] ?? TONES.neutral;
  return (
    <motion.button
      type="button"
      tabIndex={-1}
      aria-hidden
      onClick={onPress}
      className={cn(
        "absolute top-0 overflow-clip outline-none",
        live ? "cursor-pointer" : "pointer-events-none",
      )}
      style={{ left, width, height: rowH, background: tone.bg, color: tone.fg }}
    >
      <motion.span
        className="absolute top-0 flex h-full flex-col items-center justify-center gap-1"
        style={{ x: cx, width: A, scale, opacity }}
      >
        {action.icon ? (
          <span className="flex size-4 items-center justify-center">
            {action.icon}
          </span>
        ) : null}
        <span className="max-w-full truncate px-1 text-[11px] leading-none font-medium">
          {action.label}
        </span>
      </motion.span>
    </motion.button>
  );
}

function LedgerRow({
  item,
  rowH,
  W,
  A,
  trailing,
  leading,
  threshold,
  elastic,
  motionSafe,
  audio,
  format,
  open,
  departing,
  hintNow,
  disabled,
  menuOpen,
  menuId,
  onOpen,
  onChoose,
  onGone,
  onMenu,
  registerButton,
}: RowProps) {
  const x = useMotionValue(0);
  const armed = useMotionValue(0);
  const height = useMotionValue(rowH);
  const fade = useMotionValue(1);
  const [expand, setExpand] = React.useState(0);

  const rowRef = React.useRef<HTMLDivElement | null>(null);
  const anims = React.useRef(new Map<string, AnimationPlaybackControls>());
  const base = React.useRef(0);
  const arming = React.useRef(false);
  const gone = React.useRef(false);
  /** Where x is heading, so a close already under way is not restarted. */
  const heading = React.useRef(0);
  const latest = React.useRef({ W, open });

  const run = (key: string, controls: AnimationPlaybackControls) => {
    anims.current.get(key)?.stop();
    anims.current.set(key, controls);
  };
  const halt = (key: string) => {
    anims.current.get(key)?.stop();
    anims.current.delete(key);
  };

  const nT = trailing.length;
  const nL = leading.length;
  const openW = (side: Side) => (side === "trailing" ? nT : nL) * A;
  const give = lerp(0.03, 0.16, clamp01(elastic));
  // The snap back bounces more the more elastic the row is.
  const home = motionSafe
    ? spring(springs.snap.stiffness, lerp(0.95, 0.6, clamp01(elastic)))
    : { duration: durations.fast, ease: easings.enter };

  const geo = useTransform(
    [x, armed] as MotionValue<number>[],
    ([xv = 0, a = 0]: number[]) => layout(xv, a, expand, W, A, nT, nL),
  );

  const pan = () => {
    const rect = rowRef.current?.getBoundingClientRect();
    return rect ? panFrom(rect.left + rect.width / 2, null) : 0;
  };

  const setArmed = (on: boolean) => {
    if (on === arming.current) return;
    arming.current = on;
    if (on) audio.play("snap", { pitch: 1.1, gain: 0.5, pan: pan() });
    run(
      "armed",
      animate(
        armed,
        on ? 1 : 0,
        motionSafe ? springs.snap : { duration: durations.fast },
      ),
    );
  };

  const settle = (to: number, velocity = 0) => {
    heading.current = to;
    run("x", animate(x, to, motionSafe ? { ...home, velocity } : home));
  };

  const close = (velocity = 0) => {
    setArmed(false);
    settle(0, velocity);
    if (latest.current.open) onOpen(null);
  };

  const drag = useDrag({
    axis: "x",
    threshold: 4,
    disabled: disabled || departing !== null,
    onStart: () => {
      halt("x");
      halt("hint");
      heading.current = Number.NaN;
      base.current = x.get();
      setExpand(0);
      onOpen(item.id);
    },
    onMove: ({ offset }) => {
      const width = latest.current.W || rowRef.current?.offsetWidth || 1;
      const raw = base.current + offset.x;
      const can = raw < 0 ? nT > 0 : nL > 0;
      let next: number;
      if (!can) {
        // A side with nothing under it barely gives.
        next = Math.sign(raw) * rubberband(Math.abs(raw), width * give);
      } else {
        const room = width * 0.94;
        next =
          Math.abs(raw) > room
            ? Math.sign(raw) *
              (room + rubberband(Math.abs(raw) - room, width * give))
            : raw;
      }
      x.set(r2(next));
      setArmed(can && Math.abs(next) >= threshold * width);
    },
    onEnd: ({ velocity }) => {
      const width = latest.current.W || rowRef.current?.offsetWidth || 1;
      const now = x.get();
      const side: Side = now < 0 ? "trailing" : "leading";
      const list = side === "trailing" ? trailing : leading;
      const landing = project(now, velocity.x, 0.995);
      const commit =
        list.length > 0 &&
        Math.sign(landing) === Math.sign(now) &&
        (arming.current || Math.abs(landing) >= threshold * width);
      const primary = list[0];
      if (commit && primary) {
        setArmed(true);
        onChoose(item, primary, side);
        if (!primary.removes) {
          // A primary that keeps the row: it lands, flashes, and goes home.
          window.setTimeout(() => close(), 140);
        }
        return;
      }
      const ow = list.length ? openW(side) : 0;
      const opens =
        ow > 0 &&
        Math.sign(landing) === Math.sign(now) &&
        Math.abs(landing) >= ow * 0.5;
      setArmed(false);
      if (opens) {
        audio.play("snap", { pitch: 0.9, gain: 0.4, pan: pan() });
        settle(Math.sign(now) * ow, velocity.x);
        onOpen(item.id);
      } else {
        close(velocity.x);
      }
    },
    onCancel: () => close(),
    onTap: () => {
      if (Math.abs(x.get()) > 1) close();
    },
  });

  // Another row opened, or a press elsewhere: this one shuts.
  React.useEffect(() => {
    latest.current = { W, open };
  });
  React.useEffect(() => {
    if (open || departing) return;
    if (Math.abs(x.get()) < 0.5 || heading.current === 0) return;
    setArmed(false);
    settle(0);
    // Closes when it stops being the open row.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Leaving: slide the rest of the way out, then fold the gap shut.
  React.useEffect(() => {
    if (!departing) {
      // The host kept a row it was told was leaving: it comes back.
      if (!gone.current) return;
      gone.current = false;
      setExpand(0);
      arming.current = false;
      armed.jump(0);
      x.jump(0);
      heading.current = 0;
      fade.set(1);
      run(
        "height",
        animate(
          height,
          rowH,
          motionSafe ? springs.glide : { duration: durations.base },
        ),
      );
      return;
    }
    if (gone.current) return;
    gone.current = true;
    const list = departing.side === "trailing" ? trailing : leading;
    const index = Math.max(
      0,
      list.findIndex((a) => a.id === departing.actionId),
    );
    setExpand(index);
    const width = latest.current.W || rowRef.current?.offsetWidth || 320;
    const out = (departing.side === "trailing" ? -1 : 1) * width * 1.05;
    const collapse = () =>
      run(
        "height",
        animate(height, 0, {
          ...(motionSafe ? springs.glide : { duration: durations.base }),
          onComplete: () => onGone(item.id),
        }),
      );
    audio.play("swish", {
      pitch: departing.side === "trailing" ? 0.9 : 1.1,
      gain: 0.5,
      pan: pan(),
    });
    if (!motionSafe) {
      run(
        "fade",
        animate(fade, 0, {
          duration: durations.fast,
          ease: easings.exit,
          onComplete: collapse,
        }),
      );
      return;
    }
    run("armed", animate(armed, 1, springs.snap));
    const remaining = Math.abs(out - x.get()) / Math.max(1, width);
    run(
      "x",
      animate(x, out, {
        duration: Math.max(0.14, durations.base * remaining),
        ease: easings.exit,
        onComplete: collapse,
      }),
    );
    // Runs once, when the row is told it is leaving.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [departing]);

  // The hint: open a little, hold, and settle back.
  React.useEffect(() => {
    if (!hintNow || !motionSafe || disabled) return;
    const dir = nT > 0 ? -1 : nL > 0 ? 1 : 0;
    if (!dir) return;
    const peek = Math.min(A * 1.15, (latest.current.W || 320) * 0.3);
    const running = anims.current;
    let back = 0;
    run(
      "hint",
      animate(x, dir * peek, {
        ...springs.glide,
        onComplete: () => {
          back = window.setTimeout(() => {
            if (!latest.current.open) {
              run("hint", animate(x, 0, springs.glide));
            }
          }, 520);
        },
      }),
    );
    return () => {
      window.clearTimeout(back);
      running.get("hint")?.stop();
      // Interrupted mid-peek (a rehearsal remount): finish closed, not frozen.
      if (!latest.current.open) x.jump(0);
    };
    // Once, when the list first comes into view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hintNow]);

  React.useEffect(() => {
    const running = anims.current;
    return () => {
      for (const c of running.values()) c.stop();
      running.clear();
    };
  }, []);

  const press = (action: LedgerSwipeAction, side: Side) => {
    if (disabled || departing) return;
    setExpand(
      Math.max(0, (side === "trailing" ? trailing : leading).indexOf(action)),
    );
    onChoose(item, action, side);
    if (!action.removes) close();
  };

  const live = open && !departing;
  const amount = item.amount;

  return (
    <motion.li
      data-ledger-row={item.id}
      className="group/ledger-row relative overflow-clip"
      style={{ height, opacity: fade }}
    >
      <div
        ref={rowRef}
        className="relative bg-surface-2"
        style={{ height: rowH }}
      >
        {trailing.map((action, k) => (
          <Tile
            key={`t-${action.id}`}
            action={action}
            side="trailing"
            k={k}
            geo={geo}
            rowH={rowH}
            A={A}
            live={live}
            onPress={() => press(action, "trailing")}
          />
        ))}
        {leading.map((action, k) => (
          <Tile
            key={`l-${action.id}`}
            action={action}
            side="leading"
            k={k}
            geo={geo}
            rowH={rowH}
            A={A}
            live={live}
            onPress={() => press(action, "leading")}
          />
        ))}
        <motion.div
          {...drag}
          className={cn(
            "relative z-10 flex h-full touch-pan-y items-center gap-3 bg-card pr-1.5 pl-3 select-none",
            !disabled && "cursor-grab active:cursor-grabbing",
          )}
          style={{ x }}
        >
          <span
            aria-hidden
            className="flex size-8 shrink-0 items-center justify-center rounded-2 bg-surface-2 text-ink-2 [&>svg]:size-4"
          >
            {item.icon}
          </span>
          <span className="min-w-0 flex-1 leading-tight">
            <span
              className="block truncate text-sm font-medium text-foreground"
              title={item.title}
            >
              {item.title}
            </span>
            {item.subtitle ? (
              <span className="mt-0.5 block truncate text-xs text-ink-3">
                {item.subtitle}
              </span>
            ) : null}
          </span>
          <span className="flex shrink-0 items-center gap-1.5">
            {item.flagged ? (
              <span className="flex text-warn">
                <Flag aria-hidden className="size-3.5" />
                <span className="sr-only">Flagged</span>
              </span>
            ) : null}
            {amount !== undefined ? (
              <span
                className={cn(
                  "text-sm tabular-nums",
                  amount > 0 ? "text-success" : "text-foreground",
                )}
              >
                {format(amount)}
              </span>
            ) : null}
          </span>
          <button
            ref={(el) => registerButton(item.id, el)}
            type="button"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-controls={menuOpen ? menuId : undefined}
            aria-label={`Actions for ${item.title}`}
            disabled={disabled}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => onMenu(item.id, event.currentTarget)}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                onMenu(item.id, event.currentTarget);
              }
              if (event.key === "Escape" && Math.abs(x.get()) > 1) {
                event.preventDefault();
                close();
              }
            }}
            className={cn(
              "flex size-8 shrink-0 items-center justify-center rounded-2 text-ink-3 transition-opacity outline-none",
              "hover:bg-surface-2 hover:text-foreground",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
              "disabled:cursor-not-allowed",
              menuOpen
                ? "opacity-100"
                : "opacity-0 group-hover/ledger-row:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-60",
            )}
          >
            <Ellipsis aria-hidden className="size-4" />
          </button>
        </motion.div>
      </div>
    </motion.li>
  );
}

/**
 * A ledger whose rows hide their actions underneath. Drag a row sideways and
 * it follows 1:1 while the actions on that side are uncovered one by one,
 * each tile's content scaling in as its slot comes into the light. Past
 * `threshold` the primary arms with a snap — it springs across the whole
 * uncovered width on springs.snap, its label riding the row's edge — and
 * letting go (or a flick whose projected rest gets there) commits it: the
 * row slides out on the exit ease and its height folds shut on
 * springs.glide while the rows below close the gap. A shorter swipe snaps
 * open to show the tiles; shorter still, it snaps home, bouncing as much as
 * `elastic` allows.
 *
 * Every row has one tab stop, its Actions button, which opens a real menu of
 * every action; the swipe tiles are a pointer shortcut to the same things.
 * Under reduced motion the row still follows the finger, but settles on a
 * short tween, and a removed row fades and folds instead of sliding.
 */
export function LedgerSwipe({
  items,
  trailingActions = [],
  leadingActions = [],
  actions = "both",
  onAction,
  onOpenChange,
  threshold = 0.5,
  elastic = 0.5,
  actionWidth = 64,
  hint = false,
  format = money,
  label,
  emptyLabel = "Nothing left to review",
  size = "md",
  sound = false,
  disabled = false,
  className,
}: LedgerSwipeProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const menuId = `${uid}-menu`;
  const rowH = ROW[size] ?? ROW.md;
  const A = Math.max(44, actionWidth);
  const trailing = actions === "leading" ? [] : trailingActions;
  const leading = actions === "trailing" ? [] : leadingActions;
  const th = Math.min(0.95, Math.max(0.15, threshold));

  const [openId, setOpenId] = React.useState<string | null>(null);
  const [leaving, setLeaving] = React.useState<
    { item: LedgerSwipeItem; index: number; departure: Departure }[]
  >([]);
  const [menu, setMenu] = React.useState<{ id: string; top: number } | null>(
    null,
  );
  const [menuIndex, setMenuIndex] = React.useState(0);
  const [W, setW] = React.useState(0);
  /** The row the hint played on, once: removing it never replays the hint. */
  const [hintRow, setHintRow] = React.useState<string | null>(null);
  const [refocus, setRefocus] = React.useState<string | null>(null);

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const listRef = React.useRef<HTMLUListElement | null>(null);
  const emptyRef = React.useRef<HTMLParagraphElement | null>(null);
  const buttons = React.useRef(new Map<string, HTMLButtonElement>());
  const menuItems = React.useRef(new Map<string, HTMLButtonElement>());
  const latest = React.useRef({
    openId,
    onOpenChange,
    first: items[0]?.id ?? null,
  });

  // Rows still leaving stay where they were until they have folded away.
  const rows: { item: LedgerSwipeItem; departure: Departure | null }[] =
    items.map((item) => ({
      item,
      departure: leaving.find((l) => l.item.id === item.id)?.departure ?? null,
    }));
  for (const l of leaving) {
    if (rows.some((r) => r.item.id === l.item.id)) continue;
    rows.splice(Math.min(l.index, rows.length), 0, {
      item: l.item,
      departure: l.departure,
    });
  }

  const setOpen = (id: string | null) => {
    if (latest.current.openId === id) return;
    latest.current.openId = id;
    setOpenId(id);
    onOpenChange?.(id);
  };

  const choose = (
    item: LedgerSwipeItem,
    action: LedgerSwipeAction,
    side: Side,
  ) => {
    if (action.removes) {
      const index = rows.findIndex((r) => r.item.id === item.id);
      setLeaving((prev) =>
        prev.some((l) => l.item.id === item.id)
          ? prev
          : [
              ...prev,
              { item, index, departure: { side, actionId: action.id } },
            ],
      );
      if (latest.current.openId === item.id) setOpen(null);
    }
    onAction?.(action.id, item.id);
  };

  const gone = (id: string) => {
    setLeaving((prev) => prev.filter((l) => l.item.id !== id));
  };

  // The menu offers every action, whichever sides swipe.
  const menuActions: { action: LedgerSwipeAction; side: Side }[] = [
    ...leadingActions.map((action) => ({ action, side: "leading" as const })),
    ...trailingActions.map((action) => ({ action, side: "trailing" as const })),
  ];

  const openMenu = (id: string, button: HTMLButtonElement) => {
    if (disabled) return;
    if (menu?.id === id) {
      setMenu(null);
      return;
    }
    // Under the row when it fits inside the list, over it when not; the
    // menu's height is known from its rows.
    const root = rootRef.current;
    const a = root?.getBoundingClientRect();
    const b = (button.closest("li") ?? button).getBoundingClientRect();
    const menuH = menuActions.length * 32 + 10;
    const rootH = a?.height ?? 0;
    const rowTop = a ? b.top - a.top : 0;
    const below = rowTop + b.height - 6;
    const above = rowTop - menuH + 6;
    const top =
      below + menuH <= rootH
        ? below
        : above >= 0
          ? above
          : Math.max(0, rootH - menuH);
    setMenuIndex(0);
    setMenu({ id, top: r2(top) });
    if (latest.current.openId && latest.current.openId !== id) setOpen(null);
  };

  const closeMenu = (focusButton = true) => {
    const id = menu?.id;
    setMenu(null);
    if (focusButton && id)
      buttons.current.get(id)?.focus({ preventScroll: true });
  };

  const chooseFromMenu = (i: number) => {
    const entry = menuActions[i];
    const row = rows.find((r) => r.item.id === menu?.id);
    if (!entry || !row) return;
    audio.play("snap", { pitch: 1, gain: 0.4 });
    if (entry.action.removes) {
      // Focus moves on once the row has gone: to the next row, or the one
      // before, or the list.
      const at = rows.findIndex((r) => r.item.id === row.item.id);
      const next =
        rows.slice(at + 1).find((r) => !r.departure) ??
        [...rows.slice(0, at)].reverse().find((r) => !r.departure);
      setRefocus(next ? next.item.id : "");
      setMenu(null);
    } else {
      closeMenu();
    }
    choose(row.item, entry.action, entry.side);
  };

  const onMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const n = menuActions.length;
    const go = (i: number) => {
      const next = ((i % n) + n) % n;
      setMenuIndex(next);
      menuItems.current.get(`${next}`)?.focus({ preventScroll: true });
    };
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        go(menuIndex + 1);
        return;
      case "ArrowUp":
        event.preventDefault();
        go(menuIndex - 1);
        return;
      case "Home":
        event.preventDefault();
        go(0);
        return;
      case "End":
        event.preventDefault();
        go(n - 1);
        return;
      case "Enter":
      case " ":
        event.preventDefault();
        chooseFromMenu(menuIndex);
        return;
      case "Escape":
        // Handled here, where focus is; the stage must not also see it.
        event.preventDefault();
        closeMenu();
        return;
      case "Tab":
        setMenu(null);
        return;
    }
  };

  React.useEffect(() => {
    latest.current = { openId, onOpenChange, first: items[0]?.id ?? null };
  });

  // The list's width, for the tiles' places.
  React.useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const sizer = new ResizeObserver(() => setW(list.clientWidth));
    sizer.observe(list);
    return () => sizer.disconnect();
  }, []);

  // The hint plays the first time the list is properly on screen.
  React.useEffect(() => {
    if (!hint) return;
    const list = listRef.current;
    if (!list) return;
    let t = 0;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.intersectionRatio >= 0.6)) {
          io.disconnect();
          t = window.setTimeout(() => setHintRow(latest.current.first), 350);
        }
      },
      { threshold: [0.6] },
    );
    io.observe(list);
    return () => {
      io.disconnect();
      window.clearTimeout(t);
    };
  }, [hint]);

  // A press outside the open row, or outside the menu, closes it.
  React.useEffect(() => {
    if (!openId && !menu) return;
    const onDown = (event: PointerEvent) => {
      const root = rootRef.current;
      const target = event.target instanceof Element ? event.target : null;
      if (!root || !target) return;
      if (menu && !target.closest(`[data-ledger-menu="${uid}"]`)) {
        if (!root.contains(target) || !target.closest("[aria-haspopup=menu]")) {
          setMenu(null);
        }
      }
      if (
        openId &&
        !target.closest(`[data-ledger-row="${CSS.escape(openId)}"]`)
      ) {
        latest.current.openId = null;
        setOpenId(null);
        latest.current.onOpenChange?.(null);
      }
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [openId, menu, uid]);

  // Focus into the menu once it has arrived.
  React.useEffect(() => {
    if (!menu) return;
    menuItems.current.get(`${menuIndex}`)?.focus({ preventScroll: true });
    // Only when a menu opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menu?.id]);

  // After a removal from the menu, focus lands once the row has gone.
  const stillLeaving = leaving.length > 0;
  React.useEffect(() => {
    if (refocus === null || stillLeaving) return;
    const target = refocus ? buttons.current.get(refocus) : null;
    if (target?.isConnected) target.focus({ preventScroll: true });
    else emptyRef.current?.focus({ preventScroll: true });
    queueMicrotask(() => setRefocus(null));
  }, [refocus, stillLeaving]);

  const menuOwner = rows.find((r) => r.item.id === menu?.id)?.item;
  const empty = rows.length === 0;

  return (
    <div
      ref={rootRef}
      className={cn(
        "relative w-full max-w-md",
        disabled && "opacity-60",
        className,
      )}
    >
      <ul
        ref={listRef}
        role="list"
        aria-label={label}
        className="flex flex-col divide-y divide-hairline overflow-clip rounded-3 border border-hairline bg-card"
      >
        {rows.map(({ item, departure }) => (
          <LedgerRow
            key={item.id}
            item={item}
            rowH={rowH}
            W={W}
            A={A}
            trailing={trailing}
            leading={leading}
            threshold={th}
            elastic={elastic}
            motionSafe={motionSafe}
            audio={audio}
            format={format}
            open={openId === item.id}
            departing={departure}
            hintNow={hintRow === item.id}
            disabled={disabled}
            menuOpen={menu?.id === item.id}
            menuId={menuId}
            onOpen={setOpen}
            onChoose={choose}
            onGone={gone}
            onMenu={openMenu}
            registerButton={(id, el) => {
              if (el) buttons.current.set(id, el);
              else buttons.current.delete(id);
            }}
          />
        ))}
      </ul>
      {empty ? (
        <p
          ref={emptyRef}
          tabIndex={-1}
          role="status"
          className="rounded-3 border border-dashed border-hairline-strong px-4 py-6 text-center text-sm text-ink-3 outline-none"
        >
          {emptyLabel}
        </p>
      ) : null}

      {menu && menuOwner ? (
        <motion.div
          id={menuId}
          role="menu"
          aria-label={`Actions for ${menuOwner.title}`}
          data-ledger-menu={uid}
          onKeyDown={onMenuKeyDown}
          initial={
            motionSafe ? { opacity: 0, y: -4, scale: 0.98 } : { opacity: 0 }
          }
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={motionSafe ? springs.snap : { duration: durations.fast }}
          className="absolute right-2 z-30 min-w-40 origin-top-right rounded-3 border border-hairline-strong bg-popover p-1 shadow-raised"
          style={{ top: menu.top }}
        >
          {menuActions.map(({ action }, i) => (
            <button
              key={`${action.id}-${i}`}
              ref={(el) => {
                if (el) menuItems.current.set(`${i}`, el);
                else menuItems.current.delete(`${i}`);
              }}
              type="button"
              role="menuitem"
              tabIndex={i === menuIndex ? 0 : -1}
              onClick={() => chooseFromMenu(i)}
              onPointerMove={() => setMenuIndex(i)}
              className={cn(
                "flex h-8 w-full items-center gap-2.5 rounded-2 px-2.5 text-left text-sm outline-none",
                i === menuIndex ? "bg-cobalt-wash" : "",
                action.tone === "danger" ? "text-danger" : "text-foreground",
                "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
              )}
            >
              {action.icon ? (
                <span
                  aria-hidden
                  className="flex size-4 shrink-0 items-center justify-center"
                >
                  {action.icon}
                </span>
              ) : null}
              <span className="truncate">{action.label}</span>
            </button>
          ))}
        </motion.div>
      ) : null}
    </div>
  );
}
