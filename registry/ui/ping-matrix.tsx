"use client";

import * as React from "react";

import {
  animate,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
} from "motion/react";
import { RotateCcw } from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type PingMatrixEvent = {
  id: string;
  label: string;
  /** One line on what triggers it; hidden at compact density. */
  description?: string;
};

export type PingMatrixChannel = { id: string; label: string };

/** On or off for every event and channel: `value[eventId][channelId]`. */
export type PingMatrixValue = Record<string, Record<string, boolean>>;

export type PingMatrixStatus = "ready" | "loading";
export type PingMatrixSwitchStyle = "pill" | "check" | "dot";
export type PingMatrixDensity = "compact" | "cozy" | "roomy";

export type PingMatrixProps = {
  /** The rows: what can happen. @default defaultPingMatrixEvents */
  events?: PingMatrixEvent[];
  /** The columns: where it can reach you. @default defaultPingMatrixChannels */
  channels?: PingMatrixChannel[];
  /** Controlled preferences. */
  value?: PingMatrixValue;
  /** Initial preferences when uncontrolled; also what counts as saved until a save. @default defaultPingMatrixValue */
  defaultValue?: PingMatrixValue;
  /** Fires with every preference after each cell changes. */
  onValueChange?: (value: PingMatrixValue) => void;
  /** The workspace's defaults; a cell that differs carries the edited mark. @default defaultPingMatrixDefaults */
  defaults?: PingMatrixValue;
  /** One cell changed — per cell, also during a column's run. */
  onChange?: (eventId: string, channelId: string, on: boolean) => void;
  /** One cell went back to the workspace default — per cell. */
  onReset?: (eventId: string, channelId: string) => void;
  /** Save was pressed. Return a promise to show it saving; a rejection keeps the edits and says so. */
  onSave?: (value: PingMatrixValue) => void | Promise<unknown>;
  /** Whether the preferences have arrived. Loading draws switch skeletons. @default "ready" */
  status?: PingMatrixStatus;
  /** A track and knob, a box that ticks, or a ring that fills. @default "pill" */
  switchStyle?: PingMatrixSwitchStyle;
  /** Row height and how much is said: 40, 52 or 64px rows. @default "cozy" */
  density?: PingMatrixDensity;
  /** The colour of a switch that is on, the edited marks and the column meters. Any CSS colour. @default "var(--accent-bright)" */
  accent?: string;
  /** The heading. @default "Notifications" */
  title?: string;
  /** Whose defaults these are, in the copy. @default "Basinworks" */
  workspace?: string;
  /** Tallest the surface grows before its body scrolls, px. @default 548 */
  maxHeight?: number;
  /** Nothing can be changed or saved. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                              Seeded defaults                             */
/* ----------------------------------------------------------------------- */

export const defaultPingMatrixEvents: PingMatrixEvent[] = [
  {
    id: "mentions",
    label: "Mentions",
    description: "Someone @mentions you in a thread or a doc",
  },
  {
    id: "assignments",
    label: "Assignments",
    description: "A task is assigned to you or handed back",
  },
  {
    id: "deploys",
    label: "Deploys",
    description: "A deploy you started reaches production",
  },
  {
    id: "failed",
    label: "Failed deploys",
    description: "A deploy fails or is rolled back",
  },
  {
    id: "invoices",
    label: "Invoices",
    description: "An invoice is paid, due or overdue",
  },
  {
    id: "comments",
    label: "Comments",
    description: "Replies on threads you follow",
  },
];

export const defaultPingMatrixChannels: PingMatrixChannel[] = [
  { id: "email", label: "Email" },
  { id: "push", label: "Push" },
  { id: "inapp", label: "In-app" },
  { id: "digest", label: "Digest" },
];

/** What the Basinworks workspace turns on for everyone. */
export const defaultPingMatrixDefaults: PingMatrixValue = {
  mentions: { email: true, push: true, inapp: true, digest: false },
  assignments: { email: true, push: false, inapp: true, digest: false },
  deploys: { email: false, push: false, inapp: true, digest: true },
  failed: { email: true, push: true, inapp: true, digest: false },
  invoices: { email: true, push: false, inapp: false, digest: true },
  comments: { email: false, push: false, inapp: true, digest: true },
};

/** This member's preferences: the defaults with two of their own. */
export const defaultPingMatrixValue: PingMatrixValue = {
  ...defaultPingMatrixDefaults,
  mentions: { email: true, push: true, inapp: true, digest: true },
  deploys: { email: false, push: true, inapp: true, digest: true },
};

/* ----------------------------------------------------------------------- */
/*                                  Helpers                                 */
/* ----------------------------------------------------------------------- */

const r3 = (v: number) => Number(v.toFixed(3));
const plural = (n: number, one: string, other = `${one}s`) =>
  `${n} ${n === 1 ? one : other}`;
const keyOf = (e: string, c: string) => `${e}\u0000${c}`;
const read = (v: PingMatrixValue, e: string, c: string) => !!v[e]?.[c];
const write = (
  v: PingMatrixValue,
  e: string,
  c: string,
  on: boolean,
): PingMatrixValue => ({ ...v, [e]: { ...v[e], [c]: on } });

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

const DENSITY: Record<
  PingMatrixDensity,
  { row: string; chip: string; describe: boolean; pad: string }
> = {
  compact: {
    row: "@min-[47.5rem]/ping-matrix:h-10",
    chip: "h-7",
    describe: false,
    pad: "p-2.5",
  },
  cozy: {
    row: "@min-[47.5rem]/ping-matrix:h-[52px]",
    chip: "h-8",
    describe: true,
    pad: "p-3",
  },
  roomy: {
    row: "@min-[47.5rem]/ping-matrix:h-16",
    chip: "h-9",
    describe: true,
    pad: "p-3.5",
  },
};

/**
 * The domino chain: each switch starts falling when the one before it hits,
 * and the gaps close as the run gathers speed, never under 40ms — six rows
 * land well inside 400ms.
 */
const dominoTimes = (n: number) => {
  const out: number[] = [];
  let t = 0;
  for (let i = 0; i < n; i += 1) {
    out.push(Math.round(t));
    t += Math.max(40, 110 * Math.pow(0.82, i));
  }
  return out;
};

/** How long a switch takes to fall forward: an ease-in, the shape of gravity. */
const FALL_S = 0.12;
/** How far it tips, degrees about its bottom edge. */
const TIP = 62;

/* ----------------------------------------------------------------------- */
/*                                The switch                                */
/* ----------------------------------------------------------------------- */

type CellApi = { fall: (flip: () => void) => void };

function SwitchMark({
  on,
  style,
  motionSafe,
}: {
  on: boolean;
  style: PingMatrixSwitchStyle;
  motionSafe: boolean;
}) {
  const snap = motionSafe ? springs.snap : { duration: 0 };
  if (style === "check") {
    return (
      <span
        aria-hidden
        className={cn(
          "relative flex size-[18px] shrink-0 items-center justify-center rounded-[5px] border transition-colors duration-150",
          on
            ? "border-transparent bg-(--pm-accent)"
            : "border-hairline-strong bg-card",
        )}
      >
        <svg viewBox="0 0 16 16" className="size-3">
          <motion.path
            d="M3.5 8.5 L6.5 11.5 L12.5 4.5"
            fill="none"
            strokeWidth={2.2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="stroke-primary-foreground"
            initial={false}
            animate={{ pathLength: on ? 1 : 0, opacity: on ? 1 : 0 }}
            transition={motionSafe ? springs.flick : { duration: 0 }}
          />
        </svg>
      </span>
    );
  }
  if (style === "dot") {
    return (
      <span
        aria-hidden
        className={cn(
          "relative flex size-[18px] shrink-0 items-center justify-center rounded-full border-[1.5px] transition-colors duration-150",
          on ? "border-(--pm-accent)" : "border-hairline-strong",
        )}
      >
        <motion.span
          className="size-2 rounded-full bg-(--pm-accent)"
          initial={false}
          animate={{ scale: on ? 1 : 0, opacity: on ? 1 : 0 }}
          transition={{ scale: snap, opacity: { duration: durations.fast } }}
        />
      </span>
    );
  }
  return (
    <span
      aria-hidden
      className={cn(
        "relative flex h-[18px] w-[30px] shrink-0 items-center rounded-full border px-[2px] transition-colors duration-150",
        on
          ? "border-transparent bg-(--pm-accent)"
          : "border-transparent bg-[color-mix(in_oklab,var(--ink-3)_30%,var(--card))]",
      )}
    >
      <motion.span
        className="size-3 rounded-full bg-primary-foreground shadow-[0_1px_2px_color-mix(in_oklab,black_30%,transparent)]"
        initial={false}
        animate={{ x: on ? 12 : 0 }}
        transition={snap}
      />
    </span>
  );
}

/**
 * One cell's switch. It registers how to fall with the grid, so a column's
 * run can tip it over on its own beat: forward about its bottom edge on an
 * ease-in, the value flips while it is down, and it stands back up on snap.
 */
function PingSwitch({
  cellKey,
  register,
  on,
  edited,
  defaultOn,
  label,
  channel,
  workspace,
  switchStyle,
  chipHeight,
  active,
  disabled,
  motionSafe,
  onToggle,
  onKeyDown,
  onFocus,
  bind,
}: {
  cellKey: string;
  register: (key: string, api: CellApi | null) => void;
  on: boolean;
  edited: boolean;
  defaultOn: boolean;
  label: string;
  channel: string;
  workspace: string;
  switchStyle: PingMatrixSwitchStyle;
  chipHeight: string;
  active: boolean;
  disabled: boolean;
  motionSafe: boolean;
  onToggle: () => void;
  onKeyDown: (event: React.KeyboardEvent) => void;
  onFocus: () => void;
  bind: (key: string, node: HTMLButtonElement | null) => void;
}) {
  // A motion element binds its ref once, so the callback must be stable.
  const bindNode = React.useCallback(
    (node: HTMLButtonElement | null) => bind(cellKey, node),
    [bind, cellKey],
  );
  const tilt = useMotionValue(0);
  const shadow = useTransform(tilt, (t) => r3(t / TIP));
  const running = React.useRef<AnimationPlaybackControls[]>([]);
  const safe = React.useRef(motionSafe);
  React.useEffect(() => {
    safe.current = motionSafe;
  });

  React.useEffect(() => {
    const api: CellApi = {
      fall: (flip) => {
        for (const c of running.current) c.stop();
        running.current = [];
        if (!safe.current) {
          flip();
          return;
        }
        const down = animate(tilt, TIP, {
          duration: FALL_S,
          ease: easings.exit,
        });
        running.current.push(down);
        void down.then(() => {
          flip();
          running.current.push(animate(tilt, 0, springs.snap));
        });
      },
    };
    register(cellKey, api);
    return () => {
      register(cellKey, null);
      for (const c of running.current) c.stop();
      running.current = [];
      tilt.jump(0);
    };
  }, [cellKey, register, tilt]);

  return (
    <motion.button
      ref={bindNode}
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={`${channel} for ${label}${
        edited
          ? `, changed from the ${workspace} default (${defaultOn ? "on" : "off"})`
          : ""
      }`}
      aria-disabled={disabled || undefined}
      tabIndex={active ? 0 : -1}
      onClick={onToggle}
      onKeyDown={onKeyDown}
      onFocus={onFocus}
      style={{ rotateX: tilt, transformPerspective: 120, originY: "100%" }}
      className={cn(
        "group/ping-matrix-cell relative inline-flex w-full min-w-0 shrink-0 items-center gap-2 rounded-full border border-hairline bg-card pr-3 pl-2 text-[12px] transition-colors",
        chipHeight,
        "@min-[47.5rem]/ping-matrix:h-8 @min-[47.5rem]/ping-matrix:w-auto @min-[47.5rem]/ping-matrix:gap-0 @min-[47.5rem]/ping-matrix:border-transparent @min-[47.5rem]/ping-matrix:bg-transparent @min-[47.5rem]/ping-matrix:px-1.5",
        on ? "text-foreground" : "text-ink-3",
        !disabled && "cursor-pointer hover:border-hairline-strong",
        disabled && "cursor-not-allowed",
        FOCUS_RING,
      )}
    >
      <motion.span
        aria-hidden
        className="pointer-events-none absolute inset-x-1 -bottom-1 h-1.5 rounded-full bg-[color-mix(in_oklab,black_22%,transparent)] blur-[2px]"
        style={{ opacity: shadow, scaleY: shadow, originY: "0%" }}
      />
      <SwitchMark on={on} style={switchStyle} motionSafe={motionSafe} />
      <span
        aria-hidden
        className="min-w-0 truncate @min-[47.5rem]/ping-matrix:hidden"
      >
        {channel}
      </span>
      <motion.span
        aria-hidden
        className="absolute -top-0.5 -right-0.5 size-2 rounded-full border-2 border-card bg-(--pm-accent)"
        initial={false}
        animate={{ scale: edited ? 1 : 0, opacity: edited ? 1 : 0 }}
        transition={
          motionSafe
            ? { scale: springs.flick, opacity: { duration: durations.fast } }
            : { duration: durations.fast }
        }
      />
    </motion.button>
  );
}

/* ----------------------------------------------------------------------- */
/*                                 The grid                                 */
/* ----------------------------------------------------------------------- */

type Said = { n: number; text: string };
type SaveState = "idle" | "saving" | "saved" | "failed";
type Pos = { r: number; c: number };

/**
 * Notification preferences as a grid of switches, events down and channels
 * across. Pressing a channel's heading turns the whole column on (or off when
 * it is all on) and the change runs down the column like falling dominoes:
 * each switch tips forward about its bottom edge on an ease-in, flips while
 * it is down and stands back up on `springs.snap`, and the next one starts
 * the moment it hits, the gaps closing as the run gathers speed. Any switch
 * that differs from the workspace default carries a small mark that pops in
 * on `springs.flick`; Delete resets a cell and "Reset to defaults" runs every
 * edited cell back as one diagonal run.
 *
 * It is a real grid with one roving tab stop — arrows move across headings
 * and cells, Home and End reach a row's ends, Ctrl with Home or End the
 * corners, Space or Enter toggles — and `onChange` and `onReset` fire per
 * cell. Below 760px each event becomes a card of channel chips. Under
 * reduced motion nothing tips: the switches change in the same order.
 */
export function PingMatrix({
  events = defaultPingMatrixEvents,
  channels = defaultPingMatrixChannels,
  value,
  defaultValue = defaultPingMatrixValue,
  onValueChange,
  defaults = defaultPingMatrixDefaults,
  onChange,
  onReset,
  onSave,
  status = "ready",
  switchStyle = "pill",
  density = "cozy",
  accent = "var(--accent-bright)",
  title = "Notifications",
  workspace = "Basinworks",
  maxHeight = 548,
  disabled = false,
  className,
}: PingMatrixProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const hintId = `${uid}-hint`;
  const loading = status === "loading";
  const dens = DENSITY[density] ?? DENSITY.cozy;

  /* ------------------------------- state -------------------------------- */

  const [own, setOwn] = React.useState<PingMatrixValue>(defaultValue);
  const current = value ?? own;
  const [saved, setSaved] = React.useState<PingMatrixValue>(
    () => value ?? defaultValue,
  );
  const [saveState, setSaveState] = React.useState<SaveState>("idle");
  const [said, setSaid] = React.useState<Said>({ n: 0, text: "" });
  const say = (text: string) => setSaid((s) => ({ n: s.n + 1, text }));
  const [pos, setPos] = React.useState<Pos>({ r: -1, c: 0 });

  // Runs flip cells after the render that started them, so they accumulate
  // on the latest value rather than a stale closure's.
  const latest = React.useRef({
    value: current,
    controlled: value !== undefined,
    onValueChange,
    onChange,
    onReset,
    defaults,
  });
  React.useEffect(() => {
    latest.current = {
      value: current,
      controlled: value !== undefined,
      onValueChange,
      onChange,
      onReset,
      defaults,
    };
  });

  const apis = React.useRef(new Map<string, CellApi>());
  const register = React.useCallback((key: string, api: CellApi | null) => {
    if (api) apis.current.set(key, api);
    else apis.current.delete(key);
  }, []);
  const nodes = React.useRef(new Map<string, HTMLButtonElement>());
  const bind = React.useCallback(
    (key: string, node: HTMLButtonElement | null) => {
      if (node) nodes.current.set(key, node);
      else nodes.current.delete(key);
    },
    [],
  );
  const timers = React.useRef(new Set<number>());
  React.useEffect(() => {
    const list = timers.current;
    return () => {
      for (const t of list) window.clearTimeout(t);
      list.clear();
    };
  }, []);
  const alive = React.useRef(true);
  React.useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  /* ------------------------------ actions ------------------------------- */

  const setCell = (e: string, c: string, on: boolean, reset: boolean) => {
    const now = latest.current;
    if (read(now.value, e, c) === on) return;
    const next = write(now.value, e, c, on);
    now.value = next;
    if (!now.controlled) setOwn(next);
    now.onValueChange?.(next);
    now.onChange?.(e, c, on);
    if (reset) now.onReset?.(e, c);
  };

  /** Tips each cell over on its beat; `cells` are in the order they fall. */
  const run = (
    cells: { e: string; c: string; on: boolean }[],
    reset: boolean,
  ) => {
    const times = dominoTimes(cells.length);
    cells.forEach((cell, i) => {
      const go = () => {
        const api = apis.current.get(keyOf(cell.e, cell.c));
        const flip = () => {
          if (alive.current) setCell(cell.e, cell.c, cell.on, reset);
        };
        if (api) api.fall(flip);
        else flip();
      };
      const at = times[i] ?? 0;
      if (at === 0) {
        go();
        return;
      }
      const t = window.setTimeout(() => {
        timers.current.delete(t);
        go();
      }, at);
      timers.current.add(t);
    });
    if (saveState !== "saving") setSaveState("idle");
  };

  // A single press answers at once, on the knob's own snap; the tipping is
  // kept for the runs, where it carries the order of the change.
  const toggleCell = (e: PingMatrixEvent, c: PingMatrixChannel) => {
    if (disabled || loading) return;
    setCell(e.id, c.id, !read(current, e.id, c.id), false);
    if (saveState !== "saving") setSaveState("idle");
  };

  const toggleColumn = (c: PingMatrixChannel) => {
    if (disabled || loading) return;
    const allOn = events.every((e) => read(current, e.id, c.id));
    const on = !allOn;
    const cells = events
      .filter((e) => read(current, e.id, c.id) !== on)
      .map((e) => ({ e: e.id, c: c.id, on }));
    run(cells, false);
    say(`${c.label} ${on ? "on" : "off"} for every event.`);
  };

  const resetCell = (e: PingMatrixEvent, c: PingMatrixChannel) => {
    if (disabled || loading) return;
    const d = read(defaults, e.id, c.id);
    if (read(current, e.id, c.id) === d) return;
    setCell(e.id, c.id, d, true);
    if (saveState !== "saving") setSaveState("idle");
    say(
      `${c.label} for ${e.label} back to the ${workspace} default, ${d ? "on" : "off"}.`,
    );
  };

  const edits = events.flatMap((e) =>
    channels
      .filter((c) => read(current, e.id, c.id) !== read(defaults, e.id, c.id))
      .map((c) => ({ e, c })),
  );

  const resetAll = () => {
    if (disabled || loading || edits.length === 0) return;
    // One diagonal run: top-left first, so the reset reads as a single act.
    const order = edits
      .map(({ e, c }) => ({
        e: e.id,
        c: c.id,
        on: read(defaults, e.id, c.id),
        k: events.indexOf(e) + channels.indexOf(c),
      }))
      .sort((a, b) => a.k - b.k);
    run(order, true);
    say(
      `${plural(order.length, "setting")} back to the ${workspace} defaults.`,
    );
  };

  const unsaved = events.reduce(
    (n, e) =>
      n +
      channels.filter(
        (c) => read(current, e.id, c.id) !== read(saved, e.id, c.id),
      ).length,
    0,
  );

  const save = () => {
    if (disabled || loading || unsaved === 0 || saveState === "saving") return;
    const snapshot = current;
    const ok = () => {
      if (!alive.current) return;
      setSaved(snapshot);
      setSaveState("saved");
      say("Notification settings saved.");
    };
    let result: void | Promise<unknown>;
    try {
      result = onSave?.(snapshot);
    } catch (err) {
      result = Promise.reject(err);
    }
    if (result && typeof (result as Promise<unknown>).then === "function") {
      setSaveState("saving");
      (result as Promise<unknown>).then(ok, () => {
        if (!alive.current) return;
        setSaveState("failed");
        say(`Couldn't save. Your ${plural(unsaved, "change")} are still here.`);
      });
    } else ok();
  };

  /* ------------------------------ keyboard ------------------------------ */

  const lastR = events.length - 1;
  const lastC = channels.length - 1;
  const at: Pos = {
    r: Math.min(Math.max(-1, pos.r), lastR),
    c: Math.min(Math.max(0, pos.c), Math.max(0, lastC)),
  };
  const nodeKey = (p: Pos) =>
    p.r < 0
      ? `h\u0000${channels[p.c]?.id ?? ""}`
      : keyOf(events[p.r]?.id ?? "", channels[p.c]?.id ?? "");
  const go = (p: Pos) => {
    const next = {
      r: Math.min(Math.max(-1, p.r), lastR),
      c: Math.min(Math.max(0, p.c), lastC),
    };
    setPos(next);
    nodes.current.get(nodeKey(next))?.focus();
  };

  const onGridKey = (
    event: React.KeyboardEvent,
    here: Pos,
    cell?: { e: PingMatrixEvent; c: PingMatrixChannel },
  ) => {
    const mod = event.ctrlKey || event.metaKey;
    switch (event.key) {
      case "ArrowRight":
        event.preventDefault();
        go({ r: here.r, c: here.c + 1 });
        return;
      case "ArrowLeft":
        event.preventDefault();
        go({ r: here.r, c: here.c - 1 });
        return;
      case "ArrowDown":
        event.preventDefault();
        go({ r: here.r + 1, c: here.c });
        return;
      case "ArrowUp":
        event.preventDefault();
        go({ r: here.r - 1, c: here.c });
        return;
      case "Home":
        event.preventDefault();
        go(mod ? { r: 0, c: 0 } : { r: here.r, c: 0 });
        return;
      case "End":
        event.preventDefault();
        go(mod ? { r: lastR, c: lastC } : { r: here.r, c: lastC });
        return;
      case "Delete":
      case "Backspace":
        if (cell) {
          event.preventDefault();
          resetCell(cell.e, cell.c);
        }
        return;
      default:
        return;
    }
  };

  /* ------------------------------- render ------------------------------- */

  const cols = `minmax(13rem, 2.4fr) repeat(${channels.length}, minmax(5rem, 1fr))`;
  const statusText =
    saveState === "saving"
      ? "Saving…"
      : saveState === "failed"
        ? `Couldn't save. Your ${plural(unsaved, "change")} are still here.`
        : unsaved > 0
          ? `${plural(unsaved, "unsaved change")}`
          : saveState === "saved"
            ? "Saved"
            : `${plural(edits.length, "setting")} differ from the ${workspace} defaults`;
  const rowCard = cn(
    "flex flex-wrap items-center gap-1.5 rounded-3 border border-hairline bg-card",
    dens.pad,
    "@min-[47.5rem]/ping-matrix:grid @min-[47.5rem]/ping-matrix:[grid-template-columns:var(--pm-cols)] @min-[47.5rem]/ping-matrix:gap-0 @min-[47.5rem]/ping-matrix:rounded-none @min-[47.5rem]/ping-matrix:border-0 @min-[47.5rem]/ping-matrix:border-b @min-[47.5rem]/ping-matrix:bg-transparent @min-[47.5rem]/ping-matrix:p-0",
    dens.row,
  );

  return (
    <section
      aria-labelledby={titleId}
      className={cn(
        "@container/ping-matrix flex w-full flex-col overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        disabled && "opacity-70",
        className,
      )}
      style={
        {
          maxHeight,
          "--pm-accent": accent,
          "--pm-cols": cols,
        } as React.CSSProperties
      }
    >
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-hairline px-4 py-3">
        <div className="min-w-0">
          <p id={titleId} className="truncate text-sm font-semibold">
            {title}
          </p>
          <p className="text-[11px] leading-snug text-ink-3">
            A dot marks a switch that differs from the {workspace} defaults.
          </p>
        </div>
      </header>

      <p id={hintId} className="sr-only">
        Arrow keys move between switches and channel headings. Space toggles.
        Delete puts a switch back to the workspace default.
      </p>

      <div className="flex-1 overflow-y-auto overscroll-contain p-3 @min-[47.5rem]/ping-matrix:p-0">
        <div
          role="grid"
          aria-labelledby={titleId}
          aria-describedby={hintId}
          aria-rowcount={events.length + 1}
          aria-colcount={channels.length + 1}
          aria-busy={loading || undefined}
          className="grid grid-cols-1 gap-2.5 @min-[34rem]/ping-matrix:grid-cols-2 @min-[47.5rem]/ping-matrix:block"
        >
          <div
            role="row"
            aria-rowindex={1}
            className="col-span-full flex flex-wrap items-center gap-1.5 pb-1 @min-[47.5rem]/ping-matrix:sticky @min-[47.5rem]/ping-matrix:top-0 @min-[47.5rem]/ping-matrix:z-[2] @min-[47.5rem]/ping-matrix:grid @min-[47.5rem]/ping-matrix:h-11 @min-[47.5rem]/ping-matrix:[grid-template-columns:var(--pm-cols)] @min-[47.5rem]/ping-matrix:gap-0 @min-[47.5rem]/ping-matrix:border-b @min-[47.5rem]/ping-matrix:border-hairline @min-[47.5rem]/ping-matrix:bg-surface-1 @min-[47.5rem]/ping-matrix:pb-0"
          >
            <div
              role="columnheader"
              aria-colindex={1}
              className="basis-full text-[11px] font-medium text-ink-3 @min-[47.5rem]/ping-matrix:flex @min-[47.5rem]/ping-matrix:basis-auto @min-[47.5rem]/ping-matrix:items-center @min-[47.5rem]/ping-matrix:px-4 @min-[47.5rem]/ping-matrix:text-ink-2"
            >
              <span className="@min-[47.5rem]/ping-matrix:hidden">
                Turn a channel on for every event
              </span>
              <span className="hidden @min-[47.5rem]/ping-matrix:inline">
                Event
              </span>
            </div>
            {channels.map((c, ci) => {
              const count = events.filter((e) =>
                read(current, e.id, c.id),
              ).length;
              const allOn = count === events.length;
              const isActive = at.r === -1 && at.c === ci;
              return (
                <div
                  key={c.id}
                  role="columnheader"
                  aria-colindex={ci + 2}
                  className="@min-[47.5rem]/ping-matrix:flex @min-[47.5rem]/ping-matrix:items-center @min-[47.5rem]/ping-matrix:justify-center"
                >
                  <button
                    ref={(node) => {
                      const k = `h\u0000${c.id}`;
                      if (node) nodes.current.set(k, node);
                      else nodes.current.delete(k);
                    }}
                    type="button"
                    tabIndex={isActive ? 0 : -1}
                    aria-label={`Turn ${c.label.toLowerCase()} ${allOn ? "off" : "on"} for every event`}
                    aria-disabled={disabled || loading || undefined}
                    onClick={() => toggleColumn(c)}
                    onFocus={() => setPos({ r: -1, c: ci })}
                    onKeyDown={(event) => onGridKey(event, { r: -1, c: ci })}
                    className={cn(
                      "group/ping-matrix-head relative inline-flex h-7 items-center gap-1.5 rounded-full border border-hairline bg-surface-2 px-2.5 text-[12px] font-medium text-ink-2 transition-colors",
                      "@min-[47.5rem]/ping-matrix:h-9 @min-[47.5rem]/ping-matrix:flex-col @min-[47.5rem]/ping-matrix:justify-center @min-[47.5rem]/ping-matrix:gap-1 @min-[47.5rem]/ping-matrix:rounded-2 @min-[47.5rem]/ping-matrix:border-transparent @min-[47.5rem]/ping-matrix:bg-transparent @min-[47.5rem]/ping-matrix:px-3",
                      !disabled &&
                        !loading &&
                        "hover:text-foreground @min-[47.5rem]/ping-matrix:hover:bg-surface-2",
                      FOCUS_RING,
                    )}
                  >
                    <span className="flex items-center gap-1.5 leading-none">
                      {c.label}
                      <span className="font-mono text-[10px] font-normal text-ink-3 tabular-nums">
                        {loading ? "–" : `${count}/${events.length}`}
                      </span>
                    </span>
                    <span
                      aria-hidden
                      className="hidden h-[3px] w-10 overflow-clip rounded-full bg-hairline @min-[47.5rem]/ping-matrix:block"
                    >
                      <motion.span
                        className="block h-full rounded-full bg-(--pm-accent)"
                        initial={false}
                        animate={{
                          width: `${loading ? 0 : Math.round((count / Math.max(1, events.length)) * 100)}%`,
                        }}
                        transition={motionSafe ? springs.snap : { duration: 0 }}
                      />
                    </span>
                  </button>
                </div>
              );
            })}
          </div>

          {events.map((e, ri) => (
            <div
              key={e.id}
              role="row"
              aria-rowindex={ri + 2}
              className={rowCard}
            >
              <div
                role="rowheader"
                aria-colindex={1}
                className="flex min-w-0 basis-full flex-col pb-1.5 @min-[47.5rem]/ping-matrix:basis-auto @min-[47.5rem]/ping-matrix:justify-center @min-[47.5rem]/ping-matrix:px-4 @min-[47.5rem]/ping-matrix:pb-0"
              >
                <span className="truncate text-[13px] font-medium">
                  {e.label}
                </span>
                {dens.describe && e.description ? (
                  <span
                    title={e.description}
                    className="truncate text-[11px] text-ink-3"
                  >
                    {e.description}
                  </span>
                ) : null}
              </div>
              {channels.map((c, ci) => {
                const on = read(current, e.id, c.id);
                const d = read(defaults, e.id, c.id);
                const k = keyOf(e.id, c.id);
                return (
                  <div
                    key={c.id}
                    role="gridcell"
                    aria-colindex={ci + 2}
                    className="flex min-w-0 basis-[calc(50%-3px)] @min-[47.5rem]/ping-matrix:basis-auto @min-[47.5rem]/ping-matrix:items-center @min-[47.5rem]/ping-matrix:justify-center"
                  >
                    {loading ? (
                      <span
                        aria-hidden
                        className={cn(
                          "flex w-full items-center gap-2 rounded-full border border-hairline px-2 motion-safe:animate-pulse @min-[47.5rem]/ping-matrix:w-auto",
                          dens.chip,
                          "@min-[47.5rem]/ping-matrix:h-8 @min-[47.5rem]/ping-matrix:border-transparent",
                        )}
                      >
                        <span
                          className={cn(
                            "h-[18px] bg-surface-2",
                            switchStyle === "pill"
                              ? "w-[30px] rounded-full"
                              : switchStyle === "dot"
                                ? "w-[18px] rounded-full"
                                : "w-[18px] rounded-[5px]",
                          )}
                        />
                        <span className="h-2 w-8 rounded-full bg-surface-2 @min-[47.5rem]/ping-matrix:hidden" />
                      </span>
                    ) : (
                      <PingSwitch
                        cellKey={k}
                        register={register}
                        on={on}
                        edited={on !== d}
                        defaultOn={d}
                        label={e.label}
                        channel={c.label}
                        workspace={workspace}
                        switchStyle={switchStyle}
                        chipHeight={dens.chip}
                        active={at.r === ri && at.c === ci}
                        disabled={disabled}
                        motionSafe={motionSafe}
                        onToggle={() => toggleCell(e, c)}
                        onKeyDown={(event) =>
                          onGridKey(event, { r: ri, c: ci }, { e, c })
                        }
                        onFocus={() => setPos({ r: ri, c: ci })}
                        bind={bind}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <footer className="flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-hairline px-4 py-3">
        <p
          className={cn(
            "min-w-0 flex-1 basis-44 text-[12px] leading-snug",
            saveState === "failed" ? "text-danger" : "text-ink-3",
          )}
        >
          {loading ? "Loading your settings…" : statusText}
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={resetAll}
            aria-disabled={
              disabled || loading || edits.length === 0 || undefined
            }
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs transition-colors",
              disabled || loading || edits.length === 0
                ? "cursor-default text-ink-3"
                : "text-foreground hover:bg-surface-2",
              FOCUS_RING,
            )}
          >
            <RotateCcw aria-hidden className="size-3.5" />
            <span className="@max-[22rem]/ping-matrix:hidden">
              Reset to defaults
            </span>
            <span className="hidden @max-[22rem]/ping-matrix:inline">
              Reset
            </span>
          </button>
          <button
            type="button"
            onClick={save}
            aria-disabled={
              disabled ||
              loading ||
              unsaved === 0 ||
              saveState === "saving" ||
              undefined
            }
            aria-busy={saveState === "saving" || undefined}
            className={cn(
              "inline-flex h-8 items-center rounded-2 px-3.5 text-xs font-medium transition-colors",
              disabled || loading || unsaved === 0
                ? "cursor-default border border-hairline text-ink-3"
                : "bg-primary text-primary-foreground hover:bg-primary/90",
              FOCUS_RING,
            )}
          >
            {saveState === "saving" ? "Saving…" : "Save"}
          </button>
        </div>
      </footer>

      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </section>
  );
}
