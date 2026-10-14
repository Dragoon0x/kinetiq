"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";
import {
  Check,
  Copy,
  Download,
  Eye,
  EyeOff,
  KeyRound,
  LoaderCircle,
  Printer,
  RefreshCw,
  RotateCcw,
  TriangleAlert,
} from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade,
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

/** One recovery code on the ring. */
export type SpareKey = {
  id: string;
  /** Eight characters from an unambiguous alphabet, e.g. "k7mq29xd". */
  code: string;
};

export type SpareKeysCover = "slide" | "blur" | "none";
export type SpareKeysGrouping = "pairs" | "whole";
export type SpareKeysDensity = "compact" | "cozy" | "roomy";
export type SpareKeysStatus = "ready" | "loading" | "error";

/** Why the used set changed from inside the surface. */
export type SpareKeysChange = { kind: "regenerate" };

export type SpareKeysDone = {
  /** Codes still unused when Done was pressed. */
  remaining: number;
  total: number;
};

export type SpareKeysProps = {
  /** How the codes are hidden on first view: an opaque cover that slides away, a translucent one over blurred codes, or none. @default "slide" */
  coverStyle?: SpareKeysCover;
  /** How each code is written: split into its two halves with a gap, or as one run. @default "pairs" */
  grouping?: SpareKeysGrouping;
  /** Row heights and type size. @default "cozy" */
  density?: SpareKeysDensity;
  /** Controlled codes on the ring. */
  codes?: SpareKey[];
  /** Initial codes when uncontrolled. @default defaultSpareKeys */
  defaultCodes?: SpareKey[];
  /** Regenerate finished: the new codes have replaced the old ones. */
  onCodesChange?: (codes: SpareKey[]) => void;
  /** Controlled ids of the codes already used. Add one and its row is struck through. */
  used?: string[];
  /** Initial used ids when uncontrolled. @default defaultSpareUsed */
  defaultUsed?: string[];
  /** Fires when the surface changes the used set itself: it empties on regenerate. */
  onChange?: (used: string[], change: SpareKeysChange) => void;
  /** Controlled: whether the cover has been lifted. */
  revealed?: boolean;
  /** Initial cover state when uncontrolled. @default false */
  defaultRevealed?: boolean;
  /** Reveal was pressed. */
  onReveal?: () => void;
  /** Makes the new codes after the confirm. Reject to fail it. @default a simulator that waits regenerateDelay */
  onRegenerate?: () => Promise<SpareKey[]>;
  /** How long the built-in simulator takes, in ms. @default 900 */
  regenerateDelay?: number;
  /** Copies text (all codes, or one). Without one, the clipboard is written directly. */
  onCopy?: (text: string) => void;
  /** Saves the codes as a text file. Without one, the surface only pretends: the button ticks and the status says the file was saved. */
  onDownload?: (text: string, filename: string) => void;
  /** Prints the codes. Without one, the surface only pretends. */
  onPrint?: (text: string) => void;
  /** Done was pressed, which the "I've saved them" checkbox gates. */
  onDone?: (summary: SpareKeysDone) => void;
  /** Remaining count at or below which the amber note suggests regenerating. @default 2 */
  lowAt?: number;
  /** The product the codes belong to; names the text file. @default "Coldbrook" */
  product?: string;
  /** The account they sign into, under the heading. @default "mara.lind" */
  account?: string;
  /** Whether the codes have arrived. @default "ready" */
  status?: SpareKeysStatus;
  /** "Try again" was pressed after the codes failed to generate. */
  onRetry?: () => void;
  /** The heading. @default "Recovery codes" */
  title?: string;
  /** The surface's accessible name. @default the title */
  label?: string;
  /** Height of the surface in px; the ring scrolls inside it. @default 560 */
  height?: number;
  /** Read only: nothing can be revealed, copied, regenerated or marked. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                                 Defaults                                 */
/* ----------------------------------------------------------------------- */

function mulberry32(seed: number) {
  let s = seed;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** No i, l, o, 0 or 1: nothing a reader could mistake when typing one in. */
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
const CODE_LENGTH = 8;

/** Makes `count` seeded codes whose ids are `${prefix}-1` onwards. */
export function generateSpareKeys(
  seed: number,
  count = 10,
  prefix = "key",
): SpareKey[] {
  const rand = mulberry32(seed);
  return Array.from({ length: count }, (_, i) => {
    let code = "";
    for (let c = 0; c < CODE_LENGTH; c += 1) {
      code += ALPHABET[Math.floor(rand() * ALPHABET.length)] ?? "x";
    }
    return { id: `${prefix}-${i + 1}`, code };
  });
}

/** Ten codes for Mara Lind's Coldbrook account. */
export const defaultSpareKeys: SpareKey[] = generateSpareKeys(1711, 10, "key");

/** The third code was used once already. */
export const defaultSpareUsed: string[] = ["key-3"];

/* ----------------------------------------------------------------------- */
/*                                  Helpers                                 */
/* ----------------------------------------------------------------------- */

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring";

const BUTTON =
  "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-xs text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground";

const DENSITY: Record<
  SpareKeysDensity,
  { row: number; code: string; index: string }
> = {
  compact: { row: 32, code: "text-[12px]", index: "text-[9px]" },
  cozy: { row: 40, code: "text-[13px]", index: "text-[10px]" },
  roomy: { row: 48, code: "text-[15px]", index: "text-[10px]" },
};

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];
const DIGIT_H = 1.25;
const TICK_MS = 1400;
const BLUR = "blur(6px)";
const NO_BLUR = "blur(0px)";

const r3 = (v: number) => Number(v.toFixed(3));
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

const noopSubscribe = () => () => {};

/** "k7mq29xd" as ["k7mq", "29xd"] or ["k7mq29xd"]. */
export const splitSpareKey = (
  code: string,
  grouping: SpareKeysGrouping,
): string[] => {
  if (grouping === "whole" || code.length < 4) return [code];
  const half = Math.ceil(code.length / 2);
  return [code.slice(0, half), code.slice(half)];
};

const spoken = (code: string) => code.split("").join(" ");

/** The text the Copy, Download and Print actions hand over. */
export function spareKeysText(
  codes: SpareKey[],
  used: string[],
  product: string,
  account: string,
): string {
  const lines = [
    `${product} recovery codes`,
    `Account: ${account}`,
    "Each code signs you in once. Keep them somewhere safe.",
    "",
    ...codes.map((key, i) => {
      const parts = splitSpareKey(key.code, "pairs").join("-");
      const mark = used.includes(key.id) ? "  (used)" : "";
      return `${String(i + 1).padStart(2, " ")}. ${parts}${mark}`;
    }),
  ];
  return lines.join("\n");
}

const fileNameFor = (product: string) =>
  `${
    product
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "account"
  }-recovery-codes.txt`;

type Tool = "copy" | "download" | "print";
const TOOLS: Tool[] = ["copy", "download", "print"];

type RegenPhase = "idle" | "confirm" | "working" | "failed";

/* ----------------------------------------------------------------------- */
/*                               Rolling digits                             */
/* ----------------------------------------------------------------------- */

function Roll({
  value,
  motionSafe,
  className,
}: {
  value: number;
  motionSafe: boolean;
  className?: string;
}) {
  const digits = String(Math.max(0, Math.round(value))).split("");
  return (
    <span
      aria-hidden
      className={cn("inline-flex tabular-nums", className)}
      style={{ height: `${DIGIT_H}em`, lineHeight: `${DIGIT_H}em` }}
    >
      <span className="invisible w-0">0</span>
      {digits.map((d, i) => (
        <span
          key={digits.length - 1 - i}
          className="relative inline-block overflow-hidden"
          style={{ width: "1ch", height: `${DIGIT_H}em` }}
        >
          <motion.span
            className="absolute inset-x-0 top-0 flex flex-col items-center"
            initial={false}
            animate={{ y: `${-r3(Number(d) * DIGIT_H)}em` }}
            transition={motionSafe ? springs.snap : { duration: 0 }}
          >
            {DIGITS.map((n) => (
              <span key={n} style={{ height: `${DIGIT_H}em` }}>
                {n}
              </span>
            ))}
          </motion.span>
        </span>
      ))}
    </span>
  );
}

/* ----------------------------------------------------------------------- */
/*                                   Tick                                   */
/* ----------------------------------------------------------------------- */

/** A check that draws itself in on springs.flick. */
function Tick({
  motionSafe,
  className,
  draw = true,
}: {
  motionSafe: boolean;
  className?: string;
  draw?: boolean;
}) {
  return (
    <svg aria-hidden viewBox="0 0 14 14" className={cn("size-3.5", className)}>
      <motion.path
        d="M3 7.4 5.8 10 11 4.2"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={motionSafe && draw ? { pathLength: 0 } : false}
        animate={{ pathLength: 1 }}
        transition={motionSafe ? springs.flick : { duration: 0 }}
      />
    </svg>
  );
}

/** Swaps a button's icon for a tick while an action has just landed. */
function ActionIcon({
  icon,
  ticked,
  motionSafe,
}: {
  icon: React.ReactNode;
  ticked: boolean;
  motionSafe: boolean;
}) {
  return (
    <span className="relative flex size-3.5 shrink-0 items-center justify-center">
      <AnimatePresence initial={false} mode="wait">
        {ticked ? (
          <motion.span
            key="tick"
            className="absolute inset-0 flex items-center justify-center text-success"
            initial={motionSafe ? { scale: 0.6, opacity: 0 } : { opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            transition={
              motionSafe
                ? { ...springs.flick, opacity: { duration: durations.fast } }
                : { duration: durations.fast }
            }
          >
            <Tick motionSafe={motionSafe} />
          </motion.span>
        ) : (
          <motion.span
            key="icon"
            className="absolute inset-0 flex items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            transition={{ duration: durations.fast }}
          >
            {icon}
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}

/* ----------------------------------------------------------------------- */
/*                                    Row                                   */
/* ----------------------------------------------------------------------- */

type KeyRowProps = {
  item: SpareKey;
  index: number;
  count: number;
  used: boolean;
  copied: boolean;
  active: boolean;
  grouping: SpareKeysGrouping;
  density: SpareKeysDensity;
  /** Starts blurred, under a translucent cover, and sharpens on reveal. */
  blurred: boolean;
  coverStyle: SpareKeysCover;
  /** Animates in when it mounts: a code unspooling, not one already on the page. */
  enter: boolean;
  /** The strike draws itself: a code used while the ring is on the page. */
  live: boolean;
  motionSafe: boolean;
  inert: boolean;
  nodeRef: (node: HTMLLIElement | null) => void;
  onFocus: () => void;
  onCopy: () => void;
  onKeyDown: (event: React.KeyboardEvent) => void;
};

function KeyRow({
  item,
  index,
  count,
  used,
  copied,
  active,
  grouping,
  density,
  blurred,
  coverStyle,
  enter,
  live,
  motionSafe,
  inert,
  nodeRef,
  onFocus,
  onCopy,
  onKeyDown,
}: KeyRowProps) {
  const d = DENSITY[density];
  const parts = splitSpareKey(item.code, grouping);
  const step = cascade(count);
  const delay = r3(index * step);
  const blurs = coverStyle === "blur";

  return (
    <motion.li
      ref={nodeRef}
      role="option"
      aria-selected={active}
      aria-label={`Code ${index + 1}, ${spoken(item.code)}${used ? ", used" : ""}`}
      tabIndex={active ? 0 : -1}
      onFocus={onFocus}
      onClick={onCopy}
      onKeyDown={onKeyDown}
      initial={
        enter
          ? {
              opacity: 0,
              x: motionSafe ? -distances.step : 0,
              filter: blurs ? BLUR : NO_BLUR,
            }
          : false
      }
      animate={{
        opacity: 1,
        x: 0,
        filter: blurs && blurred ? BLUR : NO_BLUR,
      }}
      exit={
        motionSafe
          ? {
              opacity: 0,
              y: distances.shift,
              transition: {
                ...exitFor(durations.base),
                delay: r3(index * 0.03),
              },
            }
          : { opacity: 0, transition: exitFor(durations.fast) }
      }
      transition={
        motionSafe
          ? {
              x: { ...springs.snap, delay },
              opacity: {
                duration: durations.base,
                ease: easings.enter,
                delay,
              },
              filter: {
                duration: durations.slow,
                ease: easings.enter,
                delay: blurred ? 0 : delay,
              },
            }
          : {
              x: { duration: 0 },
              filter: { duration: 0 },
              opacity: { duration: durations.fast },
            }
      }
      className={cn(
        "relative flex cursor-pointer items-center gap-2 rounded-2 pr-3 pl-9 transition-colors select-none hover:bg-surface-1",
        inert && "cursor-default hover:bg-transparent",
        FOCUS_RING,
      )}
      style={{ height: d.row }}
    >
      {/* The rail the keys hang from: one hairline the rows share. */}
      <span
        aria-hidden
        className="absolute top-0 bottom-0 left-[15px] w-px bg-hairline"
      />
      <span
        aria-hidden
        className={cn(
          "absolute top-1/2 left-[8px] flex size-[15px] -translate-y-1/2 items-center justify-center rounded-full border bg-card transition-colors duration-200",
          used
            ? "border-hairline text-ink-3"
            : "border-hairline-strong text-ink-2",
        )}
      >
        <KeyRound className="size-2.5 -rotate-45" />
      </span>

      <span
        className={cn(
          "flex w-5 shrink-0 items-center font-mono text-ink-3 tabular-nums",
          d.index,
        )}
      >
        <AnimatePresence initial={false} mode="wait">
          {copied ? (
            <motion.span
              key="tick"
              className="text-success"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={{ duration: durations.fast }}
            >
              <Tick motionSafe={motionSafe} className="size-3" />
            </motion.span>
          ) : (
            <motion.span
              key="n"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={{ duration: durations.fast }}
            >
              {String(index + 1).padStart(2, "0")}
            </motion.span>
          )}
        </AnimatePresence>
      </span>

      <span
        className={cn(
          "relative inline-flex min-w-0 items-center font-mono tracking-[0.06em] transition-colors duration-200",
          grouping === "pairs" ? "gap-[0.5em]" : "gap-0",
          d.code,
          used ? "text-ink-3" : "text-foreground",
        )}
      >
        {parts.map((part, i) => (
          <span key={i}>{part}</span>
        ))}
        {used ? (
          <motion.span
            aria-hidden
            className="absolute inset-x-[-2px] top-1/2 h-px bg-ink-2"
            style={{ originX: 0 }}
            initial={live && motionSafe ? { scaleX: 0 } : false}
            animate={{ scaleX: 1 }}
            transition={motionSafe ? springs.flick : { duration: 0 }}
          />
        ) : null}
      </span>

      <AnimatePresence initial={false}>
        {used ? (
          <motion.span
            key="used"
            className="ml-auto shrink-0 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            transition={{
              duration: durations.base,
              delay: motionSafe ? durations.fast : 0,
            }}
          >
            used
          </motion.span>
        ) : null}
      </AnimatePresence>
    </motion.li>
  );
}

/* ----------------------------------------------------------------------- */
/*                                 Component                                */
/* ----------------------------------------------------------------------- */

/**
 * A recovery-codes screen: ten codes drawn as keys on a ring, a tall list of
 * mono codes each hanging from a shared rail. On first view they sit under a
 * cover that asks the reader to save them before they go; Reveal slides it
 * off on `springs.glide` (or fades it, over codes that sharpen from a blur)
 * and the codes unspool one by one on `springs.snap` with a quick cascade.
 * Copy all, Download and Print each tick on `springs.flick` when they land,
 * and Enter on a row copies that one code.
 *
 * A code the host marks used is struck through on `springs.flick`, dims, and
 * gains a "used" tag while the remaining count rolls down on `springs.snap`.
 * With two left an amber note suggests regenerating; Regenerate asks first,
 * in a small dialog on `springs.snap`, then the old keys drop off the ring
 * on the exit ease, a new set is made, and the new keys unspool. An "I've
 * saved them" checkbox gates Done, which lands an "All set" stamp on
 * `springs.recoil`.
 *
 * The ring is a listbox (Up/Down, Home/End, Enter or Space copies), the save
 * actions are one toolbar, the checkbox and Done are buttons, and the confirm
 * is a modal that traps Tab. Under reduced motion the cover cross-fades, the
 * codes appear at once and the strike lands without drawing; every state is
 * still announced.
 */
export function SpareKeys({
  coverStyle = "slide",
  grouping = "pairs",
  density = "cozy",
  codes,
  defaultCodes = defaultSpareKeys,
  onCodesChange,
  used,
  defaultUsed = defaultSpareUsed,
  onChange,
  revealed: revealedProp,
  defaultRevealed = false,
  onReveal,
  onRegenerate,
  regenerateDelay = 900,
  onCopy,
  onDownload,
  onPrint,
  onDone,
  lowAt = 2,
  product = "Coldbrook",
  account = "mara.lind",
  status = "ready",
  onRetry,
  title = "Recovery codes",
  label,
  height = 560,
  disabled = false,
  className,
}: SpareKeysProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const hintId = `${uid}-hint`;
  const dialogTitleId = `${uid}-dialog-title`;
  const dialogDescId = `${uid}-dialog-desc`;

  const [ownCodes, setOwnCodes] = React.useState<SpareKey[]>(defaultCodes);
  const [ownUsed, setOwnUsed] = React.useState<string[]>(defaultUsed);
  const [ownRevealed, setOwnRevealed] = React.useState(defaultRevealed);
  const list = codes ?? ownCodes;
  const usedList = used ?? ownUsed;
  const revealed = coverStyle === "none" ? true : (revealedProp ?? ownRevealed);

  // The cover stays mounted while it glides off; once it has gone it leaves.
  const [coverSettled, setCoverSettled] = React.useState(revealed);
  const [saved, setSaved] = React.useState(false);
  const [doneStamp, setDoneStamp] = React.useState(false);
  const [ticked, setTicked] = React.useState<Tool | null>(null);
  const [copiedRow, setCopiedRow] = React.useState<string | null>(null);
  const [regen, setRegen] = React.useState<RegenPhase>("idle");
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [toolIdx, setToolIdx] = React.useState(0);
  const [announcement, setAnnouncement] = React.useState("");
  // False for the server render and hydration, so codes already on the page
  // never unspool and strikes already there never draw; true for what mounts
  // or changes later.
  const live = React.useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );

  const rowNodes = React.useRef(new Map<string, HTMLLIElement>());
  const toolNodes = React.useRef(new Map<Tool, HTMLButtonElement>());
  const regenButton = React.useRef<HTMLButtonElement | null>(null);
  const cancelButton = React.useRef<HTMLButtonElement | null>(null);
  const confirmButton = React.useRef<HTMLButtonElement | null>(null);
  const tickTimer = React.useRef<number | null>(null);
  const rowTimer = React.useRef<number | null>(null);
  const simTimer = React.useRef<number | null>(null);
  const regenSeq = React.useRef(0);
  const alive = React.useRef(true);

  React.useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (tickTimer.current !== null) window.clearTimeout(tickTimer.current);
      if (rowTimer.current !== null) window.clearTimeout(rowTimer.current);
      if (simTimer.current !== null) window.clearTimeout(simTimer.current);
    };
  }, []);

  /* -------------------------------- data ------------------------------- */

  const usedSet = new Set(usedList);
  const total = list.length;
  const remaining = list.filter((k) => !usedSet.has(k.id)).length;
  const ready = status === "ready";
  const inert = disabled || !ready;
  const busy = regen === "working";
  const low = total > 0 && remaining <= lowAt;

  // A code the host marked used while the ring is on the page is announced
  // once, with the count that is left.
  const usedKey = usedList.join("|");
  const [prevUsedKey, setPrevUsedKey] = React.useState(usedKey);
  if (prevUsedKey !== usedKey) {
    setPrevUsedKey(usedKey);
    const before = new Set(prevUsedKey ? prevUsedKey.split("|") : []);
    const fresh = list
      .map((k, i) => ({ k, i }))
      .filter(({ k }) => usedSet.has(k.id) && !before.has(k.id));
    if (fresh.length > 0) {
      const n = remaining;
      setAnnouncement(
        `${fresh.map(({ i }) => `Code ${i + 1}`).join(", ")} used. ${n} ${
          n === 1 ? "code" : "codes"
        } left.`,
      );
    }
  }

  const activeKey =
    activeId && list.some((k) => k.id === activeId)
      ? activeId
      : (list[0]?.id ?? null);

  const text = spareKeysText(list, usedList, product, account);
  const filename = fileNameFor(product);

  /* ------------------------------- actions ----------------------------- */

  const tick = (tool: Tool) => {
    if (tickTimer.current !== null) window.clearTimeout(tickTimer.current);
    setTicked(tool);
    tickTimer.current = window.setTimeout(() => {
      tickTimer.current = null;
      setTicked(null);
    }, TICK_MS);
  };

  const writeClipboard = async (value: string) => {
    if (onCopy) {
      onCopy(value);
      return true;
    }
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      return false;
    }
  };

  const reveal = () => {
    if (inert || revealed) return;
    if (revealedProp === undefined) setOwnRevealed(true);
    setCoverSettled(false);
    onReveal?.();
    setAnnouncement(
      `Codes revealed. ${remaining} of ${total} ${total === 1 ? "code" : "codes"} left.`,
    );
  };

  const copyAll = async () => {
    if (inert || busy || total === 0) return;
    const ok = await writeClipboard(text);
    if (!alive.current) return;
    if (ok) {
      tick("copy");
      setAnnouncement(`All ${total} codes copied.`);
    } else {
      setAnnouncement("Copy failed. Select the codes instead.");
    }
  };

  const copyOne = async (key: SpareKey, index: number) => {
    if (inert || busy) return;
    const ok = await writeClipboard(splitSpareKey(key.code, "pairs").join("-"));
    if (!alive.current) return;
    if (!ok) {
      setAnnouncement("Copy failed. Select the code instead.");
      return;
    }
    if (rowTimer.current !== null) window.clearTimeout(rowTimer.current);
    setCopiedRow(key.id);
    rowTimer.current = window.setTimeout(() => {
      rowTimer.current = null;
      setCopiedRow(null);
    }, TICK_MS);
    setAnnouncement(`Code ${index + 1} copied.`);
  };

  const download = () => {
    if (inert || busy || total === 0) return;
    onDownload?.(text, filename);
    tick("download");
    setAnnouncement(`Saved ${filename}.`);
  };

  const print = () => {
    if (inert || busy || total === 0) return;
    onPrint?.(text);
    tick("print");
    setAnnouncement("Sent to the printer.");
  };

  const simulate = () =>
    new Promise<SpareKey[]>((resolve) => {
      if (simTimer.current !== null) window.clearTimeout(simTimer.current);
      const seed = Date.now() % 1_000_000;
      simTimer.current = window.setTimeout(() => {
        simTimer.current = null;
        resolve(
          generateSpareKeys(
            seed,
            Math.max(total, 10),
            `key-${seed.toString(36)}`,
          ),
        );
      }, regenerateDelay);
    });

  const regenerate = async () => {
    if (inert) return;
    const seq = (regenSeq.current += 1);
    setRegen("working");
    setAnnouncement("Generating new codes.");
    try {
      const next = await (onRegenerate ? onRegenerate() : simulate());
      if (!alive.current || seq !== regenSeq.current) return;
      if (codes === undefined) setOwnCodes(next);
      onCodesChange?.(next);
      if (used === undefined) setOwnUsed([]);
      onChange?.([], { kind: "regenerate" });
      setSaved(false);
      setDoneStamp(false);
      setActiveId(null);
      setRegen("idle");
      setAnnouncement(
        `${next.length} new ${next.length === 1 ? "code" : "codes"}. None used. Save them again.`,
      );
    } catch {
      if (!alive.current || seq !== regenSeq.current) return;
      setRegen("failed");
      setAnnouncement("New codes could not be generated.");
    }
  };

  const askRegenerate = () => {
    if (inert || busy) return;
    if (total === 0) {
      void regenerate();
      return;
    }
    setRegen("confirm");
  };

  const cancelRegenerate = () => {
    setRegen("idle");
    regenButton.current?.focus({ preventScroll: true });
  };

  const toggleSaved = () => {
    if (inert || busy || total === 0) return;
    setSaved((s) => {
      setAnnouncement(s ? "Unmarked as saved." : "Marked as saved.");
      return !s;
    });
  };

  const done = () => {
    if (inert || busy || !saved) return;
    onDone?.({ remaining, total });
    setDoneStamp(true);
    setAnnouncement(
      `Done. ${remaining} of ${total} ${total === 1 ? "code" : "codes"} left.`,
    );
  };

  /* ------------------------------ keyboard ----------------------------- */

  const onRowKey = (event: React.KeyboardEvent, key: SpareKey, i: number) => {
    let to = -1;
    if (event.key === "ArrowDown" || event.key === "ArrowRight") to = i + 1;
    else if (event.key === "ArrowUp" || event.key === "ArrowLeft") to = i - 1;
    else if (event.key === "Home") to = 0;
    else if (event.key === "End") to = list.length - 1;
    else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      void copyOne(key, i);
      return;
    } else return;
    event.preventDefault();
    const target = list[clamp(to, 0, list.length - 1)];
    if (target) rowNodes.current.get(target.id)?.focus({ preventScroll: true });
  };

  const onToolKey = (event: React.KeyboardEvent, tool: Tool) => {
    const i = TOOLS.indexOf(tool);
    let to = -1;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") to = i + 1;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") to = i - 1;
    else if (event.key === "Home") to = 0;
    else if (event.key === "End") to = TOOLS.length - 1;
    else return;
    event.preventDefault();
    const target = TOOLS[clamp(to, 0, TOOLS.length - 1)];
    if (target) toolNodes.current.get(target)?.focus();
  };

  const onDialogKey = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      cancelRegenerate();
      return;
    }
    if (event.key !== "Tab") return;
    const first = cancelButton.current;
    const last = confirmButton.current;
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  // The confirm takes focus when it opens.
  const confirming = regen === "confirm";
  React.useLayoutEffect(() => {
    if (confirming) cancelButton.current?.focus({ preventScroll: true });
  }, [confirming]);

  /* ------------------------------- render ------------------------------ */

  const d = DENSITY[density];
  const rowsVisible =
    ready && !busy && total > 0 && (revealed || coverStyle === "blur");
  const showCover = coverStyle !== "none" && !(revealed && coverSettled);
  const skeletonRows = Math.max(4, Math.min(10, Math.floor(height / 56)));

  const toolsInert = inert || busy || total === 0;
  const tools: { which: Tool; icon: React.ReactNode; word: string }[] = [
    {
      which: "copy",
      icon: <Copy aria-hidden className="size-3.5" />,
      word: "Copy all",
    },
    {
      which: "download",
      icon: <Download aria-hidden className="size-3.5" />,
      word: "Download",
    },
    {
      which: "print",
      icon: <Printer aria-hidden className="size-3.5" />,
      word: "Print",
    },
  ];

  return (
    <div
      role="region"
      aria-labelledby={label ? undefined : titleId}
      aria-label={label}
      className={cn(
        "@container relative flex w-full flex-col overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        disabled && "opacity-70",
        className,
      )}
      style={{ height }}
    >
      <p id={hintId} className="sr-only">
        Up and Down move between codes. Enter copies one.
      </p>

      <header className="flex shrink-0 items-start justify-between gap-3 border-b border-hairline px-4 pt-3 pb-2.5">
        <div className="min-w-0">
          <p id={titleId} className="truncate text-sm font-semibold">
            {title}
          </p>
          <p className="truncate text-[11px] text-ink-3">
            {product} · {account}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <AnimatePresence>
            {doneStamp ? (
              <motion.span
                key="stamp"
                className="inline-flex h-6 items-center gap-1 rounded-full border border-[color-mix(in_oklab,var(--success)_40%,transparent)] bg-[color-mix(in_oklab,var(--success)_12%,transparent)] px-2 font-mono text-[10px] tracking-[0.08em] text-success uppercase"
                initial={
                  motionSafe ? { scale: 0.6, opacity: 0 } : { opacity: 0 }
                }
                animate={{ scale: 1, opacity: 1 }}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                transition={
                  motionSafe
                    ? {
                        ...springs.recoil,
                        opacity: { duration: durations.fast },
                      }
                    : { duration: durations.fast }
                }
              >
                <Tick motionSafe={motionSafe} className="size-3" />
                All set
              </motion.span>
            ) : null}
          </AnimatePresence>
          {ready && total > 0 ? (
            <p className="flex items-baseline gap-1 text-[12px] text-ink-2">
              <span className="sr-only">
                {remaining} of {total} codes left
              </span>
              <Roll
                value={remaining}
                motionSafe={motionSafe}
                className={cn(
                  "font-mono text-[13px] transition-colors duration-200",
                  remaining === 0
                    ? "text-danger"
                    : low
                      ? "text-warn"
                      : "text-foreground",
                )}
              />
              <span aria-hidden>of {total}</span>
              <span aria-hidden className="hidden @min-[24rem]:inline">
                left
              </span>
            </p>
          ) : null}
        </div>
      </header>

      {/* ------------------------------ ring ----------------------------- */}

      <div className="relative min-h-0 flex-1">
        {status === "error" ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 py-8 text-center">
            <TriangleAlert aria-hidden className="size-5 text-danger" />
            <p className="text-sm text-foreground">
              The codes failed to generate.
            </p>
            <p className="text-xs text-ink-3">
              Nothing was changed. Your current codes still work.
            </p>
            {onRetry ? (
              <button
                type="button"
                onClick={onRetry}
                className={cn(BUTTON, "text-foreground", FOCUS_RING)}
              >
                <RotateCcw aria-hidden className="size-3.5" />
                Try again
              </button>
            ) : null}
          </div>
        ) : status === "loading" ? (
          <div aria-hidden className="flex flex-col px-3 py-3">
            {Array.from({ length: skeletonRows }, (_, i) => (
              <div
                key={i}
                className="flex items-center gap-3 pl-9"
                style={{ height: d.row }}
              >
                <span
                  className="h-3 rounded-1 bg-surface-2 motion-safe:animate-pulse"
                  style={{
                    width: 88 + ((i * 17) % 24),
                    animationDelay: `${i * 90}ms`,
                  }}
                />
              </div>
            ))}
          </div>
        ) : total === 0 && !busy ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 py-8 text-center">
            <KeyRound aria-hidden className="size-5 -rotate-45 text-ink-3" />
            <p className="text-sm text-ink-2">No codes on the ring.</p>
            <p className="text-xs text-ink-3">
              Generate a set and save it before you need one.
            </p>
            <button
              type="button"
              onClick={() => void regenerate()}
              aria-disabled={inert || undefined}
              className={cn(BUTTON, "text-foreground", FOCUS_RING)}
            >
              <RefreshCw aria-hidden className="size-3.5" />
              Generate codes
            </button>
          </div>
        ) : (
          <div
            className="flex h-full flex-col"
            inert={!revealed || undefined}
            aria-hidden={!revealed || undefined}
          >
            <div className="flex shrink-0 items-center justify-between gap-2 px-3 pt-2.5 pb-1">
              <p className="relative flex items-center gap-2 pl-6 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
                <span
                  aria-hidden
                  className="absolute top-1/2 left-[5px] size-[15px] -translate-y-1/2 rounded-full border-2 border-ink-3"
                />
                {busy
                  ? "New keys"
                  : `${total} ${total === 1 ? "key" : "keys"} on the ring`}
              </p>
              <button
                ref={regenButton}
                type="button"
                onClick={askRegenerate}
                aria-disabled={inert || busy || undefined}
                aria-haspopup="dialog"
                aria-expanded={confirming}
                className={cn(
                  "inline-flex h-6 shrink-0 items-center gap-1 rounded-2 px-1.5 text-[11px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
                  (inert || busy) &&
                    "cursor-default text-ink-3 hover:bg-transparent hover:text-ink-3",
                  FOCUS_RING,
                )}
              >
                <RefreshCw
                  aria-hidden
                  className={cn("size-3", busy && "motion-safe:animate-spin")}
                />
                Regenerate
              </button>
            </div>

            <ul
              role="listbox"
              aria-label={`${title}, ${total} codes`}
              aria-describedby={hintId}
              className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-2 @min-[40rem]:grid @min-[40rem]:grid-cols-2 @min-[40rem]:content-start @min-[40rem]:gap-x-3"
            >
              <AnimatePresence initial={false}>
                {rowsVisible
                  ? list.map((key, i) => (
                      <KeyRow
                        key={key.id}
                        item={key}
                        index={i}
                        count={total}
                        used={usedSet.has(key.id)}
                        copied={copiedRow === key.id}
                        active={activeKey === key.id}
                        grouping={grouping}
                        density={density}
                        blurred={!revealed}
                        coverStyle={coverStyle}
                        enter={live}
                        live={live}
                        motionSafe={motionSafe}
                        inert={inert || busy}
                        nodeRef={(node) => {
                          if (node) rowNodes.current.set(key.id, node);
                          else rowNodes.current.delete(key.id);
                        }}
                        onFocus={() => setActiveId(key.id)}
                        onCopy={() => void copyOne(key, i)}
                        onKeyDown={(event) => onRowKey(event, key, i)}
                      />
                    ))
                  : null}
              </AnimatePresence>
            </ul>

            <AnimatePresence initial={false}>
              {busy ? (
                <motion.div
                  key="working"
                  className="pointer-events-none absolute inset-x-0 top-1/2 flex -translate-y-1/2 items-center justify-center gap-2 text-xs text-ink-2"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                  transition={{
                    duration: durations.base,
                    delay: motionSafe ? durations.slow : 0,
                  }}
                >
                  <LoaderCircle
                    aria-hidden
                    className="size-3.5 motion-safe:animate-spin"
                  />
                  Cutting new keys
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        )}

        {/* ----------------------------- cover ---------------------------- */}

        {ready && total > 0 && showCover ? (
          <motion.div
            className={cn(
              "absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 px-6 text-center",
              coverStyle === "slide"
                ? "bg-card"
                : "bg-[color-mix(in_oklab,var(--bg-0)_72%,transparent)]",
            )}
            inert={revealed || undefined}
            aria-hidden={revealed || undefined}
            initial={false}
            animate={
              coverStyle === "slide" && motionSafe
                ? { y: revealed ? "-104%" : "0%", opacity: 1 }
                : { y: "0%", opacity: revealed ? 0 : 1 }
            }
            transition={
              coverStyle === "slide" && motionSafe
                ? springs.glide
                : { duration: durations.base, ease: easings.enter }
            }
            onAnimationComplete={() => {
              if (revealed) setCoverSettled(true);
            }}
            style={{ pointerEvents: revealed ? "none" : undefined }}
          >
            <span className="flex size-10 items-center justify-center rounded-full border border-hairline-strong bg-surface-1 text-ink-2">
              <EyeOff aria-hidden className="size-4" />
            </span>
            <p className="text-sm font-semibold">Save these before you go</p>
            <p className="max-w-[24rem] text-xs leading-relaxed text-ink-2">
              Each code signs you into {product} once if you lose your
              authenticator. Keep them where you would keep a spare key.
            </p>
            <button
              type="button"
              onClick={reveal}
              aria-disabled={inert || undefined}
              className={cn(
                "mt-1 inline-flex h-8 items-center gap-1.5 rounded-2 bg-primary px-3 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90",
                inert && "cursor-default opacity-60 hover:opacity-60",
                FOCUS_RING,
              )}
            >
              <Eye aria-hidden className="size-3.5" />
              Reveal codes
            </button>
          </motion.div>
        ) : null}

        {/* ---------------------------- confirm --------------------------- */}

        <AnimatePresence>
          {confirming ? (
            <motion.div
              key="confirm"
              className="absolute inset-0 z-20 flex items-end justify-center bg-[color-mix(in_oklab,var(--bg-0)_55%,transparent)] p-3 @min-[40rem]:items-center"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={{ duration: durations.fast }}
              onPointerDown={(event) => {
                if (event.target === event.currentTarget) cancelRegenerate();
              }}
            >
              <motion.div
                role="dialog"
                aria-modal="true"
                aria-labelledby={dialogTitleId}
                aria-describedby={dialogDescId}
                onKeyDown={onDialogKey}
                initial={{ opacity: 0, y: motionSafe ? distances.step : 0 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                transition={
                  motionSafe
                    ? { ...springs.snap, opacity: { duration: durations.fast } }
                    : { duration: durations.fast }
                }
                className="flex w-full max-w-[20rem] flex-col gap-3 rounded-3 border border-hairline-strong bg-popover p-4 shadow-[0_14px_34px_-14px_color-mix(in_oklab,black_45%,transparent)]"
              >
                <p id={dialogTitleId} className="text-sm font-semibold">
                  Regenerate codes?
                </p>
                <p
                  id={dialogDescId}
                  className="text-xs leading-relaxed text-ink-2"
                >
                  The {total} {total === 1 ? "code" : "codes"} on the ring stop
                  working, including the {remaining} unused. Anywhere you saved
                  them goes out of date.
                </p>
                <div className="flex justify-end gap-2">
                  <button
                    ref={cancelButton}
                    type="button"
                    onClick={cancelRegenerate}
                    className={cn(BUTTON, FOCUS_RING)}
                  >
                    Keep these
                  </button>
                  <button
                    ref={confirmButton}
                    type="button"
                    onClick={() => void regenerate()}
                    className={cn(
                      "inline-flex h-8 items-center gap-1.5 rounded-2 bg-primary px-3 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90",
                      FOCUS_RING,
                    )}
                  >
                    <RefreshCw aria-hidden className="size-3.5" />
                    Regenerate
                  </button>
                </div>
              </motion.div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      {/* ------------------------------ note ----------------------------- */}

      <AnimatePresence initial={false}>
        {ready && !busy && (regen === "failed" || (low && revealed)) ? (
          <motion.div
            key={regen === "failed" ? "failed" : "low"}
            className="shrink-0 overflow-hidden"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{
              opacity: 0,
              height: 0,
              transition: exitFor(durations.base),
            }}
            transition={
              motionSafe
                ? {
                    height: springs.snap,
                    opacity: { duration: durations.base },
                  }
                : { duration: durations.fast }
            }
          >
            <div
              className={cn(
                "mx-3 mb-2 flex items-center gap-2 rounded-2 border px-2.5 py-2 text-xs",
                regen === "failed" || remaining === 0
                  ? "border-[color-mix(in_oklab,var(--danger)_35%,transparent)] bg-[color-mix(in_oklab,var(--danger)_10%,transparent)] text-danger"
                  : "border-[color-mix(in_oklab,var(--warn)_40%,transparent)] bg-[color-mix(in_oklab,var(--warn)_12%,transparent)] text-warn",
              )}
            >
              <TriangleAlert aria-hidden className="size-3.5 shrink-0" />
              <p className="min-w-0 flex-1 text-foreground">
                {regen === "failed"
                  ? "New codes could not be generated."
                  : remaining === 0
                    ? "No codes left."
                    : `Only ${remaining} ${remaining === 1 ? "code" : "codes"} left.`}{" "}
                <span className="text-ink-2">
                  {regen === "failed"
                    ? "Your current codes still work."
                    : "Regenerate before you run out."}
                </span>
              </p>
              <button
                type="button"
                onClick={
                  regen === "failed" ? () => void regenerate() : askRegenerate
                }
                className={cn(
                  "inline-flex h-6 shrink-0 items-center gap-1 rounded-2 px-1.5 text-[11px] font-medium text-foreground transition-colors hover:bg-[color-mix(in_oklab,currentColor_10%,transparent)]",
                  FOCUS_RING,
                )}
              >
                {regen === "failed" ? "Retry" : "Regenerate"}
              </button>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* ----------------------------- footer ---------------------------- */}

      <footer className="flex shrink-0 flex-col gap-2.5 border-t border-hairline px-3 py-2.5">
        <div
          role="toolbar"
          aria-label="Save the codes"
          className="flex flex-wrap items-center gap-1.5"
        >
          {tools.map(({ which, icon, word }) => (
            <button
              key={which}
              ref={(node) => {
                if (node) toolNodes.current.set(which, node);
                else toolNodes.current.delete(which);
              }}
              type="button"
              tabIndex={TOOLS[toolIdx] === which ? 0 : -1}
              aria-label={word}
              aria-disabled={toolsInert || undefined}
              onFocus={() => setToolIdx(TOOLS.indexOf(which))}
              onClick={
                which === "copy"
                  ? () => void copyAll()
                  : which === "download"
                    ? download
                    : print
              }
              onKeyDown={(event) => onToolKey(event, which)}
              className={cn(
                BUTTON,
                "h-7 px-2",
                toolsInert &&
                  "cursor-default text-ink-3 hover:bg-transparent hover:text-ink-3",
                FOCUS_RING,
              )}
            >
              <ActionIcon
                icon={icon}
                ticked={ticked === which}
                motionSafe={motionSafe}
              />
              <span aria-hidden className="hidden @min-[18rem]:inline">
                {word}
              </span>
            </button>
          ))}
        </div>
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            role="checkbox"
            aria-checked={saved}
            aria-disabled={inert || busy || total === 0 || undefined}
            onClick={toggleSaved}
            className={cn(
              "flex min-w-0 items-center gap-2 rounded-2 py-1 pr-1 text-left text-xs text-foreground",
              (inert || busy || total === 0) && "cursor-default text-ink-3",
              FOCUS_RING,
            )}
          >
            <span
              aria-hidden
              className={cn(
                "flex size-4 shrink-0 items-center justify-center rounded-1 border transition-colors duration-150",
                saved
                  ? "border-transparent bg-primary text-primary-foreground"
                  : "border-hairline-strong bg-surface-0",
              )}
            >
              {saved ? (
                <Tick motionSafe={motionSafe} className="size-3" />
              ) : null}
            </span>
            <span className="truncate">I&apos;ve saved them</span>
          </button>
          <button
            type="button"
            onClick={done}
            aria-disabled={inert || busy || !saved || undefined}
            className={cn(
              "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-2 px-3 text-xs font-medium transition-colors",
              saved && !inert && !busy
                ? "bg-primary text-primary-foreground hover:opacity-90"
                : "cursor-default border border-hairline text-ink-3",
              FOCUS_RING,
            )}
          >
            {doneStamp ? <Check aria-hidden className="size-3.5" /> : null}
            Done
          </button>
        </div>
      </footer>

      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
