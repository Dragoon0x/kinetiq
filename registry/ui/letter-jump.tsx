"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";
import {
  ChartColumn,
  Command,
  Flag,
  Gauge,
  Hourglass,
  Inbox,
  Keyboard,
  ReceiptText,
  RotateCcw,
  Settings,
  Siren,
  TriangleAlert,
  UserCheck,
  Users,
  UserX,
  X,
} from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, exitFor, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type LetterJumpAccent = "cobalt" | "plum" | "mint" | "ink";
export type LetterJumpBadgeStyle = "keycap" | "pill" | "outline";
export type LetterJumpStatus = "ready" | "loading" | "error";
export type LetterJumpIcon =
  | "inbox"
  | "assigned"
  | "unassigned"
  | "urgent"
  | "waiting"
  | "flag"
  | "refund"
  | "gauge"
  | "chart"
  | "macro"
  | "team"
  | "settings";

export type LetterJumpSection = { id: string; label: string };

export type LetterJumpItem = {
  id: string;
  label: string;
  section: string;
  icon: LetterJumpIcon;
  count?: number;
  /** A key to ask for (one or two letters). Collisions fall back to two letters. */
  key?: string;
};

export type LetterJumpProps = {
  /** How the letter badges are drawn. @default "keycap" */
  badgeStyle?: LetterJumpBadgeStyle;
  /** Milliseconds between one badge rising and the next, rippling out from the current row; the whole cascade stays under 600ms. @default 20 */
  cascade?: number;
  /** Accent for the current page, the flash and pill badges. A name or any CSS colour. @default "cobalt" */
  accent?: LetterJumpAccent | (string & {});
  /** The sections, in order. @default defaultLetterJumpSections */
  sections?: LetterJumpSection[];
  /** Every row, in order within its section. @default defaultLetterJumpItems */
  items?: LetterJumpItem[];
  /** Controlled current page id. */
  current?: string;
  /** Initial current page when uncontrolled. @default "inbox" */
  defaultCurrent?: string;
  /** A row was opened: a press, Enter, or a letter jump. */
  onNavigate?: (id: string) => void;
  /** A key was rebound in the key sheet; anything it collided with has fallen back. */
  onRebindKey?: (id: string, key: string) => void;
  /** Controlled: the badges are showing. */
  showKeys?: boolean;
  /** Initial badges state when uncontrolled. @default false */
  defaultShowKeys?: boolean;
  /** Fires when the badges rise or sink, from the key, button or press that did it. */
  onShowKeysChange?: (shown: boolean) => void;
  /** The key held (or tapped) to raise the badges. Never assigned to an item. @default "g" */
  leader?: string;
  /** How long the badges wait for a letter after a tapped leader, in ms. @default 1500 */
  timeout?: number;
  /** How long a press on the header must last to raise the badges on touch, in ms. @default 450 */
  longPress?: number;
  /** The product in the header. @default "Gaugeworks" */
  title?: string;
  /** The line under it. @default "Support desk" */
  subtitle?: string;
  /** Whether the list's data has arrived. @default "ready" */
  status?: LetterJumpStatus;
  /** Try again after an error. */
  onRetry?: () => void;
  /** The navigation's accessible name. @default "<title> navigation" */
  label?: string;
  className?: string;
};

export const defaultLetterJumpSections: LetterJumpSection[] = [
  { id: "queues", label: "Queues" },
  { id: "views", label: "Views" },
  { id: "admin", label: "Admin" },
];

export const defaultLetterJumpItems: LetterJumpItem[] = [
  { id: "inbox", label: "Inbox", section: "queues", icon: "inbox", count: 24 },
  {
    id: "mine",
    label: "Assigned to me",
    section: "queues",
    icon: "assigned",
    count: 7,
  },
  {
    id: "unassigned",
    label: "Unassigned",
    section: "queues",
    icon: "unassigned",
    count: 12,
  },
  {
    id: "urgent",
    label: "Urgent",
    section: "queues",
    icon: "urgent",
    count: 3,
  },
  {
    id: "waiting",
    label: "Waiting on customer",
    section: "queues",
    icon: "waiting",
    count: 18,
  },
  {
    id: "escalations",
    label: "Escalations",
    section: "views",
    icon: "flag",
    count: 4,
  },
  {
    id: "refunds",
    label: "Refunds",
    section: "views",
    icon: "refund",
    count: 6,
  },
  {
    id: "sla",
    label: "SLA breaches",
    section: "views",
    icon: "gauge",
    count: 2,
  },
  { id: "volume", label: "Volume report", section: "views", icon: "chart" },
  { id: "macros", label: "Macros", section: "admin", icon: "macro" },
  { id: "teams", label: "Teams", section: "admin", icon: "team" },
  { id: "settings", label: "Settings", section: "admin", icon: "settings" },
];

const ICONS: Record<LetterJumpIcon, typeof Inbox> = {
  inbox: Inbox,
  assigned: UserCheck,
  unassigned: UserX,
  urgent: Siren,
  waiting: Hourglass,
  flag: Flag,
  refund: ReceiptText,
  gauge: Gauge,
  chart: ChartColumn,
  macro: Command,
  team: Users,
  settings: Settings,
};

const ACCENTS: Record<LetterJumpAccent, string> = {
  cobalt: "var(--accent-bright)",
  plum: "oklch(from var(--accent-bright) l c 320)",
  mint: "var(--success)",
  ink: "var(--ink-2)",
};

const BADGE: Record<LetterJumpBadgeStyle, string> = {
  keycap:
    "rounded-[5px] border border-hairline-strong bg-surface-1 text-foreground shadow-[0_1.5px_0_var(--hairline-strong)]",
  pill: "rounded-full bg-[var(--lj-ink)] text-background",
  outline:
    "rounded-[5px] border border-[var(--lj-soft)] bg-card text-[var(--lj-ink)]",
};

const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";
const FOCUS_IN =
  "outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

const ALPHABET = "abcdefghijklmnopqrstuvwxyz";
const clean = (s: string | undefined) =>
  (s ?? "").toLowerCase().replace(/[^a-z]/g, "");
const r3 = (v: number) => Math.round(v * 1000) / 1000;

/**
 * Keys for every item, as a pure function so the server and the browser
 * agree. A letter is either one item's key or the prefix of several
 * two-letter keys, never both: items whose letters collide all fall back to
 * two letters (the next letter of the first word, then later words'
 * initials). Rebinds in `pins` win over asked-for keys, which win over
 * first letters; the leader is never a key.
 */
export function assignLetterKeys(
  items: LetterJumpItem[],
  leader = "g",
  pins: Record<string, string> = {},
): Record<string, string> {
  const lead = clean(leader).charAt(0) || "g";
  const want = (it: LetterJumpItem) => clean(pins[it.id] ?? it.key);
  const pinned = Object.keys(pins);
  const rank = (it: LetterJumpItem) => {
    const p = pinned.indexOf(it.id);
    if (p >= 0) return -1000 + (pinned.length - p);
    return clean(it.key) ? 0 : 1;
  };
  const prio = items
    .map((it, i) => ({ it, i }))
    .sort((a, b) => rank(a.it) - rank(b.it) || a.i - b.i)
    .map((x) => x.it);

  const singles = new Map<string, string>();
  for (const it of prio) {
    const w = want(it);
    if (w.length === 1 && w !== lead && !singles.has(w)) singles.set(w, it.id);
  }
  const taken = new Set(singles.values());
  const groups = new Map<string, LetterJumpItem[]>();
  for (const it of items) {
    if (taken.has(it.id)) continue;
    const w = want(it);
    const pool = [w.charAt(0), ...clean(it.label), ...ALPHABET];
    const first = pool.find((c) => c && c !== lead && !singles.has(c)) ?? "z";
    const list = groups.get(first);
    if (list) list.push(it);
    else groups.set(first, [it]);
  }

  const out: Record<string, string> = {};
  for (const [letter, id] of singles) out[id] = letter;
  for (const [letter, list] of groups) {
    const only = list[0];
    if (list.length === 1 && only && want(only).length !== 2) {
      out[only.id] = letter;
      continue;
    }
    const used = new Set<string>();
    for (const it of list) {
      const w = want(it);
      const words = it.label.toLowerCase().split(/\s+/).map(clean);
      const firstWord = words[0] ?? "";
      const after = firstWord.slice(Math.max(0, firstWord.indexOf(letter)) + 1);
      const initials = words.slice(1).map((x) => x.charAt(0));
      const pool = [
        w.charAt(0) === letter ? w.charAt(1) : "",
        ...after,
        ...initials,
        ...clean(it.label),
        ...ALPHABET,
      ];
      const second = pool.find((c) => c && !used.has(c)) ?? "z";
      used.add(second);
      out[it.id] = letter + second;
    }
  }
  return out;
}

const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement &&
  (t.isContentEditable || /^(input|textarea|select)$/i.test(t.tagName));

/* --------------------------------- sidebar -------------------------------- */

/**
 * A keyboard-first sidebar that reads as a calm, ordinary list until you
 * hold G. Then every row raises a letter badge — rising 4px on `snap`, one
 * after another as a ripple out from the current page, `cascade` ms apart
 * — and a letter jumps: its badge flashes, filling with the accent and
 * landing from 1.25× on snap, the current pill glides to the row, focus
 * follows, and the badges sink again on the exit ease. Letters that more
 * than one row wants become prefixes: the first press dims every other row
 * and lights the second letters, and the second press lands.
 *
 * G can be held or tapped (the badges then wait `timeout` ms), the header's
 * keys button shows them for a pointer, and a long press on the header does
 * on touch. ? opens the key sheet, where any key can be rebound; collisions
 * fall back to two letters and are announced. Arrow keys still walk the
 * list. Under reduced motion the badges fade without rising and the flash
 * is a colour change.
 */
export function LetterJump({
  badgeStyle = "keycap",
  cascade = 20,
  accent = "cobalt",
  sections = defaultLetterJumpSections,
  items = defaultLetterJumpItems,
  current,
  defaultCurrent = "inbox",
  onNavigate,
  onRebindKey,
  showKeys,
  defaultShowKeys = false,
  onShowKeysChange,
  leader = "g",
  timeout = 1500,
  longPress = 450,
  title = "Gaugeworks",
  subtitle = "Support desk",
  status = "ready",
  onRetry,
  label,
  className,
}: LetterJumpProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const sheetTitleId = `${uid}-sheet`;
  const lead = clean(leader).charAt(0) || "g";

  const [ownCurrent, setOwnCurrent] = React.useState(defaultCurrent);
  const currentId = current ?? ownCurrent;
  const [ownShown, setOwnShown] = React.useState(defaultShowKeys);
  const armed = showKeys ?? ownShown;
  const [pins, setPins] = React.useState<Record<string, string>>({});
  const keys = React.useMemo(
    () => assignLetterKeys(items, lead, pins),
    [items, lead, pins],
  );

  const ordered = React.useMemo(
    () => sections.flatMap((s) => items.filter((it) => it.section === s.id)),
    [items, sections],
  );
  const singles = new Map<string, string>();
  const pairs = new Map<string, string>();
  const prefixes = new Set<string>();
  for (const it of ordered) {
    const k = keys[it.id];
    if (!k) continue;
    if (k.length === 1) singles.set(k, it.id);
    else {
      pairs.set(k, it.id);
      prefixes.add(k.charAt(0));
    }
  }

  const [prefix, setPrefix] = React.useState<string | null>(null);
  const [flash, setFlash] = React.useState<{ id: string; n: number } | null>(
    null,
  );
  const [hint, setHint] = React.useState<{ n: number; text: string } | null>(
    null,
  );
  const [focusId, setFocusId] = React.useState<string | null>(null);
  const [sheet, setSheet] = React.useState(false);
  const [listening, setListening] = React.useState<string | null>(null);
  const [sheetNode, setSheetNode] = React.useState<HTMLDivElement | null>(null);
  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const say = (text: string) => setSaid((s) => ({ n: s.n + 1, text }));

  const rootRef = React.useRef<HTMLElement | null>(null);
  const rowRefs = React.useRef(new Map<string, HTMLButtonElement>());
  const held = React.useRef(false);
  const jumped = React.useRef(false);
  const hovered = React.useRef(false);
  const disarmTimer = React.useRef(0);
  const pressTimer = React.useRef(0);
  const hintTimer = React.useRef(0);
  const sheetReturn = React.useRef<HTMLElement | null>(null);
  const longFired = React.useRef(false);

  React.useEffect(
    () => () => {
      window.clearTimeout(disarmTimer.current);
      window.clearTimeout(pressTimer.current);
      window.clearTimeout(hintTimer.current);
    },
    [],
  );

  const setArmed = React.useCallback(
    (next: boolean) => {
      window.clearTimeout(disarmTimer.current);
      if (!next) setPrefix(null);
      // A new showing starts clean; the last flash sinks with its badges.
      else setFlash(null);
      if (next === armed) return;
      if (showKeys === undefined) setOwnShown(next);
      onShowKeysChange?.(next);
    },
    [armed, onShowKeysChange, showKeys],
  );

  const disarmLater = (ms: number) => {
    window.clearTimeout(disarmTimer.current);
    disarmTimer.current = window.setTimeout(() => setArmed(false), ms);
  };

  const flashHint = (text: string) => {
    window.clearTimeout(hintTimer.current);
    setHint((h) => ({ n: (h?.n ?? 0) + 1, text }));
    hintTimer.current = window.setTimeout(() => setHint(null), 1400);
  };

  const navigate = (id: string) => {
    if (current === undefined) setOwnCurrent(id);
    onNavigate?.(id);
  };

  const jump = (id: string) => {
    const item = items.find((it) => it.id === id);
    if (!item) return;
    jumped.current = true;
    setPrefix(null);
    setFlash((f) => ({ id, n: (f?.n ?? 0) + 1 }));
    navigate(id);
    setFocusId(id);
    rowRefs.current.get(id)?.focus({ preventScroll: false });
    say(`${item.label}.`);
    // Long enough for the flash to land before the badges sink.
    disarmLater(motionSafe ? 320 : 160);
  };

  const onLetter = (c: string) => {
    if (prefix) {
      const id = pairs.get(prefix + c);
      setPrefix(null);
      if (id) jump(id);
      else {
        flashHint(`No key for ${(prefix + c).toUpperCase()}`);
        disarmLater(900);
      }
      return;
    }
    const single = singles.get(c);
    if (single) {
      jump(single);
      return;
    }
    if (prefixes.has(c)) {
      window.clearTimeout(disarmTimer.current);
      setPrefix(c);
      return;
    }
    flashHint(`No key for ${c.toUpperCase()}`);
    if (!held.current) disarmLater(900);
  };

  /* -------------------------------- keyboard ------------------------------ */

  const openSheet = (from: HTMLElement | null) => {
    sheetReturn.current = from;
    setArmed(false);
    setListening(null);
    setSheet(true);
  };

  const closeSheet = () => {
    setSheet(false);
    setListening(null);
    const back = sheetReturn.current;
    window.requestAnimationFrame(() => {
      if (back?.isConnected) back.focus();
      else rowRefs.current.get(currentId)?.focus();
    });
  };

  const handleKey = (e: KeyboardEvent | React.KeyboardEvent): boolean => {
    if (sheet || status !== "ready") return false;
    if (isTyping(e.target)) return false;
    if (e.metaKey || e.ctrlKey || e.altKey) return false;
    const k = e.key.toLowerCase();
    if (k === lead) {
      e.preventDefault();
      if (!e.repeat) {
        held.current = true;
        jumped.current = false;
        setPrefix(null);
        setArmed(true);
      }
      return true;
    }
    if (e.key === "?") {
      e.preventDefault();
      openSheet(document.activeElement as HTMLElement | null);
      return true;
    }
    if (!armed) return false;
    if (e.key === "Escape") {
      e.preventDefault();
      setArmed(false);
      return true;
    }
    if (/^[a-z]$/.test(k)) {
      e.preventDefault();
      onLetter(k);
      return true;
    }
    return false;
  };

  const handleKeyRef = React.useRef(handleKey);
  React.useEffect(() => {
    handleKeyRef.current = handleKey;
  });
  const armedRef = React.useRef(armed);
  React.useEffect(() => {
    armedRef.current = armed;
  });

  // The leader's release is heard anywhere; with nothing focused, the list
  // under the pointer answers the keys too.
  React.useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      const a = document.activeElement;
      if (rootRef.current?.contains(a)) return;
      if (a && a !== document.body) return;
      if (!hovered.current) return;
      handleKeyRef.current(e);
    };
    const onUp = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== lead || !held.current) return;
      held.current = false;
      if (!armedRef.current) return;
      if (jumped.current) return;
      window.clearTimeout(disarmTimer.current);
      disarmTimer.current = window.setTimeout(() => {
        if (!held.current) {
          setPrefix(null);
          if (showKeys === undefined) setOwnShown(false);
          onShowKeysChange?.(false);
        }
      }, timeout);
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
    };
  }, [lead, onShowKeysChange, showKeys, timeout]);

  const go = (id: string | undefined) => {
    if (!id) return;
    setFocusId(id);
    rowRefs.current.get(id)?.focus();
  };

  const onRowKey = (e: React.KeyboardEvent<HTMLButtonElement>, id: string) => {
    const i = ordered.findIndex((it) => it.id === id);
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        go(ordered[Math.min(ordered.length - 1, i + 1)]?.id);
        return;
      case "ArrowUp":
        e.preventDefault();
        go(ordered[Math.max(0, i - 1)]?.id);
        return;
      case "Home":
        e.preventDefault();
        go(ordered[0]?.id);
        return;
      case "End":
        e.preventDefault();
        go(ordered[ordered.length - 1]?.id);
        return;
      default:
        break;
    }
  };

  /* ------------------------------- key sheet ------------------------------ */

  const rebind = (id: string, c: string) => {
    const item = items.find((it) => it.id === id);
    if (!item) return;
    const nextPins = { ...pins };
    delete nextPins[id];
    nextPins[id] = c;
    const next = assignLetterKeys(items, lead, nextPins);
    setPins(nextPins);
    setListening(null);
    onRebindKey?.(id, c);
    const moved = items
      .filter((it) => it.id !== id && keys[it.id] !== next[it.id])
      .map((it) => `${it.label} moved to ${(next[it.id] ?? "").toUpperCase()}`);
    say(
      [
        `${item.label} is now ${(next[id] ?? c).toUpperCase()}.`,
        ...moved.map((m) => `${m}.`),
      ].join(" "),
    );
  };

  React.useEffect(() => {
    if (!sheetNode) return;
    sheetNode.querySelector<HTMLElement>("[data-lj-close]")?.focus();
  }, [sheetNode]);

  const onSheetKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (listening) {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        setListening(null);
        return;
      }
      const k = e.key.toLowerCase();
      if (!e.metaKey && !e.ctrlKey && !e.altKey && /^[a-z]$/.test(k)) {
        e.preventDefault();
        if (k === lead) {
          say(`${k.toUpperCase()} raises the keys, so it can’t be one.`);
          return;
        }
        rebind(listening, k);
        return;
      }
    }
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      closeSheet();
      return;
    }
    if (e.key !== "Tab" || !sheetNode) return;
    const nodes = [...sheetNode.querySelectorAll<HTMLElement>("button")];
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (!first || !last) return;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  /* -------------------------------- render -------------------------------- */

  const currentIndex = Math.max(
    0,
    ordered.findIndex((it) => it.id === currentId),
  );
  const maxDist = ordered.reduce(
    (m, _it, i) => Math.max(m, Math.abs(i - currentIndex)),
    0,
  );
  // The ripple: rows rise in order of distance from the current page, the
  // whole wave inside the 600ms choreography budget.
  const stepMs = Math.min(
    Math.max(0, cascade),
    maxDist > 0 ? 600 / maxDist : 0,
  );
  const tabId =
    focusId && ordered.some((it) => it.id === focusId)
      ? focusId
      : (ordered[currentIndex]?.id ?? null);
  const twoLetter = Object.values(keys).filter((k) => k.length === 2).length;
  const name = label ?? `${title} navigation`;

  const footerText = hint
    ? hint.text
    : prefix
      ? `${prefix.toUpperCase()} then ${ordered
          .map((it) => keys[it.id])
          .filter((k): k is string => !!k && k.startsWith(prefix))
          .map((k) => k.charAt(1).toUpperCase())
          .join(" or ")}`
      : armed
        ? "Press a letter"
        : `Hold ${lead.toUpperCase()} to jump · ? for keys`;

  const badge = (id: string, i: number) => {
    const k = keys[id] ?? "";
    const dist = Math.abs(i - currentIndex);
    const matches = !prefix || k.startsWith(prefix);
    const shown = armed;
    const flashing = flash?.id === id;
    return (
      <motion.span
        aria-hidden
        className={cn(
          "pointer-events-none absolute top-1/2 right-2 flex h-5 min-w-5 -translate-y-1/2 items-center justify-center gap-px px-1 font-mono text-[10.5px] leading-none font-medium uppercase",
          BADGE[badgeStyle] ?? BADGE.keycap,
        )}
        initial={false}
        animate={{
          opacity: shown ? (matches ? 1 : 0.3) : 0,
          y: shown || !motionSafe ? 0 : 4,
        }}
        transition={
          shown
            ? motionSafe
              ? {
                  y: { ...springs.snap, delay: r3((dist * stepMs) / 1000) },
                  opacity: {
                    duration: durations.fast,
                    delay: prefix ? 0 : r3((dist * stepMs) / 1000),
                  },
                }
              : { duration: durations.fast }
            : {
                ...exitFor(durations.fast),
                delay: motionSafe
                  ? r3(((maxDist - dist) * Math.min(stepMs, 12)) / 1000)
                  : 0,
              }
        }
      >
        {k.length === 2 ? (
          <>
            <span className={cn(prefix && "opacity-45")}>{k.charAt(0)}</span>
            <span>{k.charAt(1)}</span>
          </>
        ) : (
          k
        )}
        {flashing ? (
          <motion.span
            key={flash.n}
            className="absolute inset-0 flex items-center justify-center rounded-[inherit] bg-[var(--lj-ink)] text-background"
            initial={{ scale: motionSafe ? 1.25 : 1, opacity: 1 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={motionSafe ? springs.snap : { duration: 0 }}
          >
            {k}
          </motion.span>
        ) : null}
      </motion.span>
    );
  };

  let body: React.ReactNode;
  if (status === "loading") {
    body = (
      <div aria-busy="true" className="flex flex-col gap-2 px-3 py-3">
        <p className="sr-only">Loading the navigation.</p>
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="h-6 rounded-2 bg-surface-2" />
        ))}
      </div>
    );
  } else if (status === "error") {
    body = (
      <div className="flex flex-col items-center-safe justify-center-safe gap-3 px-4 py-12 text-center">
        <TriangleAlert aria-hidden className="size-5 text-danger" />
        <p className="text-[13px] text-foreground">
          The navigation didn’t load.
        </p>
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-foreground transition-colors hover:bg-surface-2",
              FOCUS,
            )}
          >
            <RotateCcw aria-hidden className="size-3.5" />
            Try again
          </button>
        ) : null}
      </div>
    );
  } else {
    body = (
      <div className="flex flex-1 [scrollbar-width:thin] flex-col gap-1.5 overflow-y-auto overscroll-contain px-2 pb-1.5">
        {sections.map((section) => {
          const rows = ordered.filter((it) => it.section === section.id);
          if (rows.length === 0) return null;
          return (
            <div key={section.id} className="flex flex-col">
              <p className="flex h-6 items-center px-2.5 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
                {section.label}
              </p>
              <ul className="flex flex-col gap-px">
                {rows.map((item) => {
                  const i = ordered.indexOf(item);
                  const Icon = ICONS[item.icon] ?? Inbox;
                  const isCurrent = item.id === currentId;
                  const k = keys[item.id] ?? "";
                  const dim = armed && !!prefix && !k.startsWith(prefix);
                  return (
                    <li key={item.id}>
                      <button
                        ref={(node) => {
                          if (node) rowRefs.current.set(item.id, node);
                          else rowRefs.current.delete(item.id);
                        }}
                        type="button"
                        data-lj-row={item.id}
                        tabIndex={item.id === tabId ? 0 : -1}
                        aria-current={isCurrent ? "page" : undefined}
                        title={item.label}
                        onFocus={() => setFocusId(item.id)}
                        onKeyDown={(e) => onRowKey(e, item.id)}
                        onClick={() => {
                          // A press while the keys are up is a jump too.
                          if (armed) jump(item.id);
                          else navigate(item.id);
                        }}
                        className={cn(
                          "relative flex h-[30px] w-full items-center gap-2.5 rounded-2 pr-2 pl-2.5 text-left text-[13px] transition-[color,background-color,opacity] duration-150",
                          isCurrent
                            ? "font-medium text-foreground"
                            : "text-ink-2 hover:bg-surface-2 hover:text-foreground",
                          dim && "opacity-40",
                          FOCUS_IN,
                        )}
                      >
                        {isCurrent ? (
                          <motion.span
                            layoutId={`${uid}-current`}
                            aria-hidden
                            className="absolute inset-0 rounded-2 bg-[var(--lj-wash)]"
                            transition={
                              motionSafe ? springs.glide : { duration: 0 }
                            }
                          />
                        ) : null}
                        <Icon
                          aria-hidden
                          className={cn(
                            "relative size-4 shrink-0",
                            isCurrent ? "text-[var(--lj-ink)]" : "text-ink-3",
                          )}
                        />
                        <span className="relative min-w-0 flex-1 truncate">
                          {item.label}
                        </span>
                        {k ? (
                          <span className="sr-only">
                            {`, ${lead.toUpperCase()} then ${k.toUpperCase().split("").join(" ")}`}
                          </span>
                        ) : null}
                        {typeof item.count === "number" ? (
                          <span
                            className={cn(
                              "relative shrink-0 font-mono text-[11px] text-ink-3 tabular-nums transition-opacity duration-150",
                              armed && "opacity-0",
                            )}
                          >
                            {item.count}
                          </span>
                        ) : null}
                        {k ? badge(item.id, i) : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div
      className={cn("flex w-full justify-center", className)}
      style={
        {
          "--lj-ink": ACCENTS[accent as LetterJumpAccent] ?? accent,
          "--lj-wash": "color-mix(in oklab, var(--lj-ink) 13%, transparent)",
          "--lj-soft": "color-mix(in oklab, var(--lj-ink) 55%, transparent)",
        } as React.CSSProperties
      }
    >
      <nav
        ref={rootRef}
        aria-label={name}
        onKeyDown={(e) => {
          handleKey(e);
        }}
        onPointerEnter={() => {
          hovered.current = true;
        }}
        onPointerLeave={() => {
          hovered.current = false;
        }}
        className="relative flex max-h-[34rem] w-full max-w-[18rem] flex-col overflow-hidden rounded-4 border border-hairline bg-card text-foreground"
      >
        <header
          className="flex h-12 shrink-0 touch-manipulation items-center gap-2.5 px-3 select-none"
          onPointerDown={(e) => {
            if (e.target instanceof HTMLElement && e.target.closest("button"))
              return;
            longFired.current = false;
            window.clearTimeout(pressTimer.current);
            pressTimer.current = window.setTimeout(
              () => {
                longFired.current = true;
                setArmed(!armed);
              },
              Math.max(150, longPress),
            );
          }}
          onPointerUp={() => window.clearTimeout(pressTimer.current)}
          onPointerCancel={() => window.clearTimeout(pressTimer.current)}
          onPointerLeave={() => window.clearTimeout(pressTimer.current)}
          onContextMenu={(e) => {
            if (longFired.current) e.preventDefault();
          }}
        >
          <span
            aria-hidden
            className="flex size-8 shrink-0 items-center justify-center rounded-2 bg-[var(--lj-wash)] text-sm font-semibold text-[var(--lj-ink)]"
          >
            {title.charAt(0)}
          </span>
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-sm leading-5 font-semibold">
              {title}
            </span>
            <span className="truncate text-[11px] leading-4 text-ink-3">
              {subtitle}
            </span>
          </div>
          <button
            type="button"
            aria-pressed={armed}
            aria-label={armed ? "Hide the keys" : "Show the keys"}
            title={`Show the keys (hold ${lead.toUpperCase()})`}
            disabled={status !== "ready"}
            onClick={() => {
              jumped.current = false;
              setArmed(!armed);
            }}
            className={cn(
              "inline-flex h-7 min-w-7 shrink-0 items-center justify-center rounded-[6px] border px-1.5 font-mono text-[11px] font-medium uppercase transition-[color,background-color,border-color] active:translate-y-px disabled:opacity-50",
              armed
                ? "border-[var(--lj-soft)] bg-[var(--lj-wash)] text-[var(--lj-ink)]"
                : "border-hairline-strong bg-surface-1 text-ink-2 shadow-[0_1.5px_0_var(--hairline-strong)] hover:text-foreground",
              FOCUS,
            )}
          >
            {lead}
          </button>
          <button
            type="button"
            aria-label="Keyboard shortcuts"
            aria-keyshortcuts="Shift+Slash"
            title="Keyboard shortcuts (?)"
            disabled={status !== "ready"}
            onClick={(e) => openSheet(e.currentTarget)}
            className={cn(
              "inline-flex size-7 shrink-0 items-center justify-center rounded-2 text-ink-3 transition-colors hover:bg-surface-2 hover:text-foreground disabled:opacity-50",
              FOCUS,
            )}
          >
            <Keyboard aria-hidden className="size-4" />
          </button>
        </header>

        {body}

        <footer className="grid h-9 shrink-0 items-center border-t border-hairline px-3.5 font-mono text-[10.5px] text-ink-3">
          <AnimatePresence initial={false}>
            <motion.span
              key={footerText}
              className={cn(
                "truncate [grid-area:1/1]",
                hint ? "text-warn" : armed ? "text-[var(--lj-ink)]" : "",
              )}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={{ duration: durations.fast, ease: easings.enter }}
            >
              {footerText}
            </motion.span>
          </AnimatePresence>
        </footer>

        <AnimatePresence>
          {sheet ? (
            <motion.div
              key="sheet"
              ref={setSheetNode}
              role="dialog"
              aria-modal="true"
              aria-labelledby={sheetTitleId}
              onKeyDown={onSheetKey}
              className="absolute inset-0 z-30 flex flex-col bg-popover text-popover-foreground"
              initial={{ opacity: 0, y: motionSafe ? 8 : 0 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={
                motionSafe
                  ? { y: springs.snap, opacity: { duration: durations.fast } }
                  : { duration: durations.fast }
              }
            >
              <div className="flex h-12 shrink-0 items-center gap-2 border-b border-hairline px-3.5">
                <h2
                  id={sheetTitleId}
                  className="min-w-0 flex-1 truncate text-sm font-semibold"
                >
                  Keyboard shortcuts
                </h2>
                <button
                  type="button"
                  data-lj-close=""
                  aria-label="Close"
                  onClick={closeSheet}
                  className={cn(
                    "inline-flex size-7 items-center justify-center rounded-2 text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
                    FOCUS,
                  )}
                >
                  <X aria-hidden className="size-4" />
                </button>
              </div>
              <div className="flex flex-1 [scrollbar-width:thin] flex-col gap-3 overflow-y-auto overscroll-contain p-3">
                <dl className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1.5 text-[12.5px] text-ink-2">
                  {[
                    [`${lead.toUpperCase()} …`, "Hold, then a letter, to jump"],
                    ["↑ ↓", "Walk the list"],
                    ["?", "This sheet"],
                    ["Esc", "Put the keys away"],
                  ].map(([k, d]) => (
                    <React.Fragment key={k}>
                      <dt className="font-mono text-[11px] text-foreground">
                        {k}
                      </dt>
                      <dd className="truncate">{d}</dd>
                    </React.Fragment>
                  ))}
                </dl>
                <ul className="flex flex-col border-t border-hairline pt-2">
                  {ordered.map((item) => {
                    const k = keys[item.id] ?? "";
                    const isListening = listening === item.id;
                    return (
                      <li
                        key={item.id}
                        className="flex h-9 items-center gap-2 border-b border-hairline last:border-b-0"
                      >
                        <span className="min-w-0 flex-1 truncate text-[13px]">
                          {item.label}
                        </span>
                        {isListening ? (
                          <span className="shrink-0 font-mono text-[11px] text-[var(--lj-ink)]">
                            Press a letter
                          </span>
                        ) : (
                          <span
                            className={cn(
                              "flex h-5 min-w-5 shrink-0 items-center justify-center px-1 font-mono text-[10.5px] font-medium uppercase",
                              BADGE[badgeStyle] ?? BADGE.keycap,
                            )}
                          >
                            {k}
                          </span>
                        )}
                        <button
                          type="button"
                          aria-label={
                            isListening
                              ? `Cancel changing ${item.label}`
                              : `Change the key for ${item.label}, now ${k.toUpperCase()}`
                          }
                          onClick={() =>
                            setListening(isListening ? null : item.id)
                          }
                          className={cn(
                            "inline-flex h-7 shrink-0 items-center rounded-2 px-2 text-[12px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
                            FOCUS,
                          )}
                        >
                          {isListening ? "Cancel" : "Change"}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>

        <p className="sr-only">
          {`Hold ${lead.toUpperCase()} and press a letter to jump. ${twoLetter > 0 ? "Some items take two letters." : ""}`}
        </p>
        <p role="status" className="sr-only">
          <span key={said.n}>{said.text}</span>
        </p>
      </nav>
    </div>
  );
}
