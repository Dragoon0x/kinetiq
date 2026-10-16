"use client";

import * as React from "react";

import { animate, AnimatePresence, motion } from "motion/react";
import {
  Check,
  Copy,
  Download,
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
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

/* ----------------------------------------------------------------------- */
/*                                  Types                                   */
/* ----------------------------------------------------------------------- */

export type SpareKeysCellStyle = "ticket" | "plain" | "slip";
export type SpareKeysDeal = "inView" | "mount" | "none";
export type SpareKeysStatus = "ready" | "loading" | "error";

export type SpareKeysProps = {
  /** The backup codes, in order. @default defaultSpareKeysCodes */
  codes?: string[];
  /** Codes already spent: struck through and left out of Copy all. @default [] */
  used?: string[];
  /** Whose codes these are. @default "mara@fieldline.io" */
  account?: string;
  /** The service they unlock, used in the file and the print. @default "Fieldline" */
  issuer?: string;
  /** When the set was made, epoch ms. @default defaultSpareKeysGeneratedAt */
  generatedAt?: number;
  /** The clock "made today" is read against, epoch ms. @default defaultSpareKeysNow */
  now?: number;
  /** Controlled "I've saved these" box. */
  confirmed?: boolean;
  /** Initial state of the box when uncontrolled. @default false */
  defaultConfirmed?: boolean;
  /** Fires from the tick, or from Regenerate clearing it. */
  onConfirmedChange?: (confirmed: boolean) => void;
  /** Codes were written to the clipboard: all unused ones, or the one pressed. */
  onCopy?: (codes: string[]) => void;
  /** Download was pressed; the sheet saves a .txt itself, then this fires. */
  onDownload?: (codes: string[]) => void;
  /** Print was pressed. Omit it and the sheet prints the codes alone through a hidden frame. */
  onPrint?: (codes: string[]) => void;
  /** New codes were confirmed. Return a promise while they are made; pass the new set back through `codes`. */
  onRegenerate?: () => void | Promise<void>;
  /** Continue was pressed after the box was ticked. */
  onConfirm?: () => void;
  /** The downloaded file's name. @default "fieldline-backup-codes.txt" */
  fileName?: string;
  /** Whether the codes are ready. @default "ready" */
  status?: SpareKeysStatus;
  /** "Try again" was pressed after making codes failed. */
  onRetry?: () => void;
  /** How a code is drawn: a notched ticket, a plain cell, or a slip with a tear-off stub. @default "ticket" */
  cellStyle?: SpareKeysCellStyle;
  /** Columns where the sheet is wide enough, 2 to 5; two at 20rem and under, three at most under 34rem. @default 2 */
  columns?: number;
  /** The copy flash, the key glyph, the box and Continue's fill, any CSS colour. @default "var(--accent-bright)" */
  accent?: string;
  /** When the codes are dealt onto the sheet. @default "inView" */
  deal?: SpareKeysDeal;
  /** Every action is unavailable. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                              Seeded defaults                             */
/* ----------------------------------------------------------------------- */

export const defaultSpareKeysCodes: string[] = [
  "4f7k-92qx",
  "m3tr-8vda",
  "q9zc-41np",
  "h2wy-7ke6",
  "b8ld-3xr5",
  "v6jq-5tm9",
  "n1pe-5cw8",
  "x7ga-2hu4",
  "r5sk-9bf3",
  "c4yv-6dj2",
];

/** Monday 12 October 2026, 09:30 UTC. */
export const defaultSpareKeysNow = Date.UTC(2026, 9, 12, 9, 30);
/** Eighteen minutes before `defaultSpareKeysNow`. */
export const defaultSpareKeysGeneratedAt = defaultSpareKeysNow - 18 * 60_000;

const NONE: string[] = [];

/* ----------------------------------------------------------------------- */
/*                                 Helpers                                  */
/* ----------------------------------------------------------------------- */

const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring focus-visible:outline-offset-2";

/** Continue's fill: the accent, deep enough for white, with ink that adapts. */
const FILL = "color-mix(in oklab, var(--sk-accent) 86%, black)";
const ON_FILL = `oklch(from ${FILL} clamp(0.18, (0.7 - l) * 100, 0.99) 0.02 h)`;

const r2 = (v: number) => Math.round(v * 100) / 100;

const hash = (text: string) => {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
};

/** Two groups with a gap, the way the codes are read aloud. */
const spaced = (code: string) => code.replace(/[-\s]+/g, " ").trim();

const clock = (at: number) => {
  const d = new Date(at);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(
    d.getUTCMinutes(),
  ).padStart(2, "0")}`;
};

const madeLine = (at: number, now: number) => {
  const a = new Date(at);
  const n = new Date(now);
  const sameDay =
    a.getUTCFullYear() === n.getUTCFullYear() &&
    a.getUTCMonth() === n.getUTCMonth() &&
    a.getUTCDate() === n.getUTCDate();
  if (sameDay) return `made today ${clock(at)}`;
  return `made ${a.getUTCFullYear()}-${String(a.getUTCMonth() + 1).padStart(2, "0")}-${String(a.getUTCDate()).padStart(2, "0")}`;
};

const escapeHtml = (text: string) =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const sheetText = (
  codes: string[],
  used: Set<string>,
  issuer: string,
  account: string,
  generatedAt: number,
) => {
  const d = new Date(generatedAt);
  const stamp = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")} ${clock(generatedAt)} UTC`;
  const lines = codes.map(
    (c, i) =>
      `${String(i + 1).padStart(2, " ")}. ${c}${used.has(c) ? "  (used)" : ""}`,
  );
  return [
    `${issuer} backup codes`,
    account,
    `Made ${stamp}`,
    "",
    ...lines,
    "",
    "Each code works once. Keep this somewhere other than your phone.",
    "",
  ].join("\n");
};

/** A notch bitten out of each side, as a mask: the card shows through. */
const NOTCH_MASK =
  "radial-gradient(circle 5px at 0 50%, transparent 4.5px, black 5px), radial-gradient(circle 5px at 100% 50%, transparent 4.5px, black 5px)";

/* ----------------------------------------------------------------------- */
/*                                 The lock                                 */
/* ----------------------------------------------------------------------- */

/**
 * A padlock whose shackle lifts and swings about its right leg when it
 * opens — a small turn on snap. Motion writes an SVG element's transform as
 * CSS, so the turn is carried by its own rotate and y, about the right leg's
 * foot as a fraction of the shackle's own box.
 */
function Lock({ open, motionSafe }: { open: boolean; motionSafe: boolean }) {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden
      className="size-4 shrink-0 overflow-visible"
    >
      <motion.path
        d="M5 7.5 V5.2 a3 3 0 0 1 6 0 V7.5"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinecap="round"
        initial={false}
        animate={{ rotate: open ? -32 : 0, y: open ? -1.6 : 0 }}
        transition={motionSafe ? springs.snap : { duration: 0 }}
        style={{ originX: 1, originY: 1 }}
      />
      <rect x={3} y={7.2} width={10} height={7} rx={1.6} fill="currentColor" />
      <circle
        cx={8}
        cy={10.7}
        r={1}
        className="fill-[color:var(--sk-lock-hole)]"
      />
    </svg>
  );
}

/* ----------------------------------------------------------------------- */
/*                               The surface                                */
/* ----------------------------------------------------------------------- */

/**
 * A backup codes sheet: the step after turning on two-step sign-in, where
 * the codes must be kept before you go on. The codes are dealt onto the
 * sheet when it comes into view — each leaves a tilted deck above the grid
 * and flies to its cell on `springs.glide`, its tilt settling on
 * `springs.snap`, staggered by `cascade` — and every code is a button that
 * copies itself.
 *
 * Copy all writes every unused code to the clipboard and then flashes each
 * ticket in turn, as if it were landing there. Download saves a .txt, Print
 * prints the codes alone, and Regenerate first warns, in place of the
 * actions, that the old set stops working; confirming strikes every ticket
 * before the new set is dealt. Continue carries a padlock and stays locked
 * until "I've saved these codes" is ticked — then its shackle lifts and
 * turns open on `springs.snap` and the button takes the accent.
 *
 * Under reduced motion nothing is dealt or turns: the copy marks every
 * ticket at once and the lock simply shows open.
 */
export function SpareKeys({
  codes = defaultSpareKeysCodes,
  used = NONE,
  account = "mara@fieldline.io",
  issuer = "Fieldline",
  generatedAt = defaultSpareKeysGeneratedAt,
  now = defaultSpareKeysNow,
  confirmed,
  defaultConfirmed = false,
  onConfirmedChange,
  onCopy,
  onDownload,
  onPrint,
  onRegenerate,
  onConfirm,
  fileName = "fieldline-backup-codes.txt",
  status = "ready",
  onRetry,
  cellStyle = "ticket",
  columns = 2,
  accent = "var(--accent-bright)",
  deal = "inView",
  disabled = false,
  className,
}: SpareKeysProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const cols = Math.min(5, Math.max(2, Math.round(columns)));
  const spent = React.useMemo(() => new Set(used), [used]);
  const live = codes.filter((c) => !spent.has(c));
  const setKey = codes.join("|");

  const [ownConfirmed, setOwnConfirmed] = React.useState(defaultConfirmed);
  const isConfirmed = confirmed ?? ownConfirmed;
  const [copied, setCopied] = React.useState(false);
  const [warning, setWarning] = React.useState(false);
  const [voidedKey, setVoidedKey] = React.useState<string | null>(null);
  const voided = voidedKey === setKey;
  const [making, setMaking] = React.useState(false);
  const [announcement, setAnnouncement] = React.useState("");
  const [seen, setSeen] = React.useState(deal === "mount");
  const [keepNode, setKeepNode] = React.useState<HTMLButtonElement | null>(
    null,
  );

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const gridRef = React.useRef<HTMLUListElement | null>(null);
  const regenRef = React.useRef<HTMLButtonElement | null>(null);
  const confirmRef = React.useRef<HTMLLabelElement | null>(null);
  const cellRefs = React.useRef(new Map<string, HTMLLIElement>());
  const flashRefs = React.useRef(new Map<string, HTMLSpanElement>());
  const timers = React.useRef<number[]>([]);
  const flashes = React.useRef<{ stop: () => void }[]>([]);

  React.useEffect(
    () => () => {
      for (const t of timers.current) window.clearTimeout(t);
      for (const f of flashes.current) f.stop();
    },
    [],
  );

  // Dealt only once the sheet is actually on screen.
  React.useEffect(() => {
    if (deal !== "inView" || seen) return;
    const root = rootRef.current;
    if (!root) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        setSeen(true);
        io.disconnect();
      }
    });
    io.observe(root);
    return () => io.disconnect();
  }, [deal, seen]);

  // The deal: every ticket leaves a tilted deck above the grid's centre and
  // flies to its cell. An interrupted deal is finished in place, so a re-run
  // deals again from a clean sheet rather than freezing a ticket mid-air.
  React.useEffect(() => {
    if (deal === "none" || !seen || status !== "ready" || !motionSafe) return;
    const grid = gridRef.current;
    if (!grid) return;
    const step = cascade(codes.length);
    const deckX = grid.clientWidth / 2;
    const deckY = -18;
    const running: { stop: () => void; el: HTMLLIElement }[] = [];
    codes.forEach((code, i) => {
      const el = cellRefs.current.get(code);
      if (!el) return;
      const dx = r2(deckX - (el.offsetLeft + el.offsetWidth / 2));
      const dy = r2(deckY - (el.offsetTop + el.offsetHeight / 2));
      const tilt = r2(((hash(code) % 1400) / 100 - 7) * 1);
      const delay = i * step;
      const flight = animate(
        el,
        { x: [dx, 0], y: [dy, 0], rotate: [tilt, 0], opacity: [0, 1] },
        {
          x: { ...springs.glide, delay },
          y: { ...springs.glide, delay },
          rotate: { ...springs.snap, delay: delay + 0.08 },
          opacity: { duration: durations.fast, ease: easings.enter, delay },
        },
      );
      running.push({ stop: () => flight.stop(), el });
    });
    return () => {
      for (const r of running) {
        r.stop();
        animate(r.el, { x: 0, y: 0, rotate: 0, opacity: 1 }, { duration: 0 });
      }
    };
    // The deal belongs to a set of codes, not to every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setKey, seen, status, deal, motionSafe]);

  // The warning's safer button takes focus when it arrives.
  // Keyed on the warning too: reopened mid-exit, it is the same node.
  React.useEffect(() => {
    if (warning) keepNode?.focus({ preventScroll: true });
  }, [keepNode, warning]);

  const later = (fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms));
  };

  const writeClipboard = (text: string) => {
    try {
      void navigator.clipboard?.writeText(text).catch(() => undefined);
    } catch {
      // No clipboard here (an insecure page); the flash still says what was meant.
    }
  };

  /**
   * Each ticket lights in turn, as its code lands on the clipboard. Only
   * opacity moves, so it runs on the platform's own animations.
   */
  const flash = (list: string[]) => {
    for (const f of flashes.current) f.stop();
    flashes.current = [];
    const step = cascade(list.length);
    list.forEach((code, i) => {
      const el = flashRefs.current.get(code);
      if (!el || typeof el.animate !== "function") return;
      const run = el.animate(
        [
          { opacity: 0 },
          { opacity: 1, offset: 0.18 },
          { opacity: 1, offset: 0.7 },
          { opacity: 0 },
        ],
        {
          duration: motionSafe ? 900 : 1200,
          delay: motionSafe ? Math.round(i * step * 1000) : 0,
          easing: "ease-out",
        },
      );
      flashes.current.push({ stop: () => run.cancel() });
    });
  };

  const copyAll = () => {
    if (disabled || status !== "ready" || voided) return;
    writeClipboard(live.join("\n"));
    flash(live);
    setCopied(true);
    later(() => setCopied(false), 2200);
    setAnnouncement(
      `Copied ${live.length} ${live.length === 1 ? "code" : "codes"} to the clipboard.`,
    );
    onCopy?.(live);
  };

  const copyOne = (code: string, index: number) => {
    if (disabled || status !== "ready" || voided || spent.has(code)) return;
    writeClipboard(code);
    flash([code]);
    setAnnouncement(`Copied code ${index + 1}.`);
    onCopy?.([code]);
  };

  const download = () => {
    if (disabled || status !== "ready" || voided) return;
    try {
      const blob = new Blob(
        [sheetText(codes, spent, issuer, account, generatedAt)],
        { type: "text/plain" },
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Not tied to this component: the URL is freed even if it unmounts.
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      // A sandbox without downloads: the host still hears about it.
    }
    setAnnouncement(`Downloaded ${fileName}.`);
    onDownload?.(codes);
  };

  const print = () => {
    if (disabled || status !== "ready" || voided) return;
    setAnnouncement("Printing your codes.");
    if (onPrint) {
      onPrint(codes);
      return;
    }
    // Only the codes are printed: a hidden frame holding a plain sheet.
    const frame = document.createElement("iframe");
    frame.setAttribute("aria-hidden", "true");
    frame.tabIndex = -1;
    frame.style.position = "absolute";
    frame.style.width = "0";
    frame.style.height = "0";
    frame.style.borderWidth = "0";
    frame.style.visibility = "hidden";
    const rows = codes
      .map(
        (c, i) =>
          `<li${spent.has(c) ? ' class="used"' : ""}><b>${i + 1}.</b> ${escapeHtml(c)}</li>`,
      )
      .join("");
    frame.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(issuer)} backup codes</title><style>body{font:14px/1.5 ui-monospace,monospace;margin:32px}h1{font:600 18px system-ui,sans-serif;margin:0 0 4px}p{font:13px system-ui,sans-serif;margin:0 0 16px}ol{list-style:none;padding:0;columns:2;gap:24px}li{padding:6px 0;border-bottom:1px dashed}b{display:inline-block;width:2.2em;font-weight:400}.used{text-decoration:line-through;opacity:.5}</style></head><body><h1>${escapeHtml(issuer)} backup codes</h1><p>${escapeHtml(account)} · each code works once</p><ol>${rows}</ol></body></html>`;
    frame.onload = () => {
      try {
        frame.contentWindow?.focus();
        frame.contentWindow?.print();
      } catch {
        // Printing can be blocked; nothing to undo.
      }
      window.setTimeout(() => frame.remove(), 1000);
    };
    document.body.appendChild(frame);
  };

  const setConfirmed = (next: boolean) => {
    if (confirmed === undefined) setOwnConfirmed(next);
    onConfirmedChange?.(next);
  };

  const regenerate = () => {
    if (disabled || making) return;
    setWarning(false);
    setVoidedKey(setKey);
    setCopied(false);
    if (isConfirmed) setConfirmed(false);
    setAnnouncement("Making new codes. The old set no longer works.");
    const result = onRegenerate?.();
    if (result && typeof (result as Promise<void>).then === "function") {
      setMaking(true);
      (result as Promise<void>).then(
        () => {
          setMaking(false);
          setAnnouncement(
            "New codes are ready. Save them before you continue.",
          );
        },
        () => {
          setMaking(false);
          setVoidedKey(null);
          setAnnouncement("Couldn’t make new codes. The old set still works.");
        },
      );
    }
    window.requestAnimationFrame(() => regenRef.current?.focus());
  };

  const closeWarning = () => {
    setWarning(false);
    window.requestAnimationFrame(() => regenRef.current?.focus());
  };

  const proceed = () => {
    if (disabled) return;
    if (!isConfirmed) {
      // Points at what is missing: the box's row lights and fades.
      const row = confirmRef.current;
      if (row && typeof row.animate === "function") {
        row.animate(
          [
            {
              backgroundColor:
                "color-mix(in oklab, var(--sk-accent) 16%, transparent)",
            },
            {
              backgroundColor:
                "color-mix(in oklab, var(--sk-accent) 0%, transparent)",
            },
          ],
          {
            duration: durations.page * 1000,
            easing: "cubic-bezier(0.22, 1, 0.36, 1)",
          },
        );
      }
      setAnnouncement("Tick the box to say you’ve saved the codes.");
      return;
    }
    setAnnouncement("Two-step sign-in is ready.");
    onConfirm?.();
  };

  const busy = disabled || status !== "ready" || voided;
  const action = cn(
    "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline bg-card px-2.5 text-[12px] font-medium text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
    FOCUS,
    busy && "cursor-default opacity-60 hover:bg-card hover:text-ink-2",
  );
  const gridColumns =
    "grid-cols-2 @min-[19rem]:grid-cols-[repeat(var(--sk-c3),minmax(0,1fr))] @min-[34rem]:grid-cols-[repeat(var(--sk-c),minmax(0,1fr))]";
  const spentCount = codes.filter((c) => spent.has(c)).length;

  return (
    <div
      ref={rootRef}
      className={cn("@container relative w-full text-foreground", className)}
      style={
        {
          "--sk-accent": accent,
          "--sk-c": cols,
          "--sk-c3": Math.min(cols, 3),
          "--sk-lock-hole": isConfirmed ? FILL : "var(--secondary)",
        } as React.CSSProperties
      }
    >
      <div className="mx-auto flex w-full max-w-[40rem] flex-col gap-3 rounded-4 border border-hairline bg-card p-4 @min-[19rem]:p-5">
        <header className="flex items-start gap-3">
          <span
            aria-hidden
            className="flex size-8 shrink-0 items-center justify-center rounded-2 bg-[color-mix(in_oklab,var(--sk-accent)_15%,transparent)] text-[color:var(--sk-accent)]"
          >
            <KeyRound className="size-4" />
          </span>
          <div className="flex min-w-0 flex-col">
            <h2
              id={`${uid}-title`}
              className="text-[15px] leading-5 font-semibold"
            >
              Backup codes
            </h2>
            <p className="text-[11.5px] leading-4 break-words text-ink-3">
              {account} · {madeLine(generatedAt, now)}
              {spentCount > 0 ? ` · ${spentCount} used` : ""}
            </p>
          </div>
          <button
            ref={regenRef}
            type="button"
            onClick={() => {
              if (disabled || making || status !== "ready") return;
              setWarning(true);
            }}
            aria-disabled={
              disabled || making || status !== "ready" || undefined
            }
            aria-label={making ? "Making new codes" : "Regenerate codes"}
            title="Regenerate codes"
            className={cn(action, "ml-auto w-8 shrink-0 justify-center px-0")}
          >
            {making ? (
              <LoaderCircle
                aria-hidden
                className={cn("size-3.5", motionSafe && "animate-spin")}
              />
            ) : (
              <RefreshCw aria-hidden className="size-3.5" />
            )}
          </button>
        </header>
        <p className="text-[12.5px] leading-5 text-ink-2">
          Each code works once. Keep them somewhere other than this device.
        </p>

        {status === "error" ? (
          <div
            role="alert"
            className="flex flex-col items-start gap-3 rounded-3 border border-hairline bg-surface-1 p-4"
          >
            <span className="flex items-center gap-2 text-[13px] text-danger">
              <TriangleAlert aria-hidden className="size-4 shrink-0" />
              Couldn’t make your codes.
            </span>
            <button
              type="button"
              onClick={() => onRetry?.()}
              className={action}
            >
              <RotateCcw aria-hidden className="size-3.5" />
              Try again
            </button>
          </div>
        ) : (
          <ul
            ref={gridRef}
            role="list"
            aria-labelledby={`${uid}-title`}
            aria-busy={status === "loading" || making || undefined}
            className={cn("relative grid gap-2", gridColumns)}
          >
            {status === "loading"
              ? Array.from({ length: 10 }, (_, i) => (
                  <li key={i} className="@container">
                    <span className="block h-9 rounded-2 bg-surface-2" />
                  </li>
                ))
              : codes.map((code, i) => {
                  const isUsed = spent.has(code);
                  const struck = isUsed || voided;
                  return (
                    <li
                      key={code}
                      ref={(node) => {
                        if (node) cellRefs.current.set(code, node);
                        else cellRefs.current.delete(code);
                      }}
                      className="@container relative"
                    >
                      <button
                        type="button"
                        onClick={() => copyOne(code, i)}
                        aria-disabled={busy || isUsed || undefined}
                        aria-label={`Code ${i + 1}, ${spaced(code)}${isUsed ? ", used" : voided ? ", no longer works" : ", copy"}`}
                        className={cn(
                          "relative flex h-9 w-full items-stretch overflow-hidden text-left transition-[background-color,border-color] duration-150",
                          FOCUS,
                          cellStyle === "ticket" &&
                            "rounded-[7px] bg-surface-2 hover:bg-[color-mix(in_oklab,var(--sk-accent)_7%,var(--secondary))]",
                          cellStyle === "plain" &&
                            "rounded-2 border border-hairline bg-surface-1 hover:border-hairline-strong",
                          cellStyle === "slip" &&
                            "rounded-2 border border-hairline-strong bg-card hover:bg-surface-1",
                          (busy || isUsed) && "cursor-default",
                        )}
                        style={
                          cellStyle === "ticket"
                            ? {
                                maskImage: NOTCH_MASK,
                                WebkitMaskImage: NOTCH_MASK,
                                maskComposite: "intersect",
                                WebkitMaskComposite: "source-in",
                              }
                            : undefined
                        }
                      >
                        {/* The flash: a wash and the code inked in the accent,
                            lit in turn as Copy all lands each code. */}
                        <span
                          ref={(node) => {
                            if (node) flashRefs.current.set(code, node);
                            else flashRefs.current.delete(code);
                          }}
                          aria-hidden
                          className="pointer-events-none absolute inset-0 z-10 bg-[color-mix(in_oklab,var(--sk-accent)_20%,transparent)] opacity-0"
                        >
                          <Check className="absolute top-1 right-2 size-2.5 text-[color:var(--sk-accent)]" />
                        </span>
                        <span
                          aria-hidden
                          className={cn(
                            "hidden shrink-0 items-center justify-center font-mono text-[9.5px] text-ink-3 tabular-nums @min-[8rem]:flex",
                            cellStyle === "slip"
                              ? "w-8 border-r border-dashed border-hairline-strong bg-surface-1"
                              : "w-7",
                            cellStyle === "ticket" &&
                              "border-r border-dashed border-hairline-strong",
                          )}
                        >
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        <span
                          aria-hidden
                          className={cn(
                            "relative flex flex-1 items-center justify-center px-2 font-mono text-[12.5px] tracking-[0.04em] whitespace-nowrap tabular-nums transition-colors duration-300",
                            struck ? "text-ink-3" : "text-foreground",
                          )}
                        >
                          <span className="relative">
                            {spaced(code)}
                            <motion.span
                              className="absolute inset-x-[-2px] top-1/2 h-px bg-current"
                              initial={false}
                              animate={{ scaleX: struck ? 1 : 0 }}
                              transition={
                                motionSafe
                                  ? {
                                      ...springs.glide,
                                      delay: voided
                                        ? i * cascade(codes.length)
                                        : 0,
                                    }
                                  : { duration: 0 }
                              }
                              style={{ originX: 0 }}
                            />
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
          </ul>
        )}

        <div className="relative flex flex-col">
          <AnimatePresence initial={false} mode="popLayout">
            {warning ? (
              <motion.div
                key="warning"
                role="group"
                aria-labelledby={`${uid}-warn`}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    event.preventDefault();
                    closeWarning();
                  }
                }}
                initial={{ opacity: 0, y: motionSafe ? 4 : 0 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                transition={
                  motionSafe
                    ? {
                        y: springs.glide,
                        opacity: { duration: durations.fast },
                      }
                    : { duration: durations.fast }
                }
                className="flex flex-col gap-2.5 rounded-3 border border-[color-mix(in_oklab,var(--danger)_35%,transparent)] bg-[color-mix(in_oklab,var(--danger)_7%,transparent)] p-3"
              >
                <p
                  id={`${uid}-warn`}
                  role="alert"
                  className="flex items-start gap-2 text-[12px] leading-4 text-foreground"
                >
                  <TriangleAlert
                    aria-hidden
                    className="mt-px size-3.5 shrink-0 text-danger"
                  />
                  New codes replace these {codes.length}. The old set stops
                  working right away.
                </p>
                <span className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={regenerate}
                    className={cn(
                      "inline-flex h-8 items-center gap-1.5 rounded-2 bg-destructive px-3 text-[12px] font-medium text-destructive-foreground transition-[filter] hover:brightness-110",
                      FOCUS,
                    )}
                  >
                    <RefreshCw aria-hidden className="size-3.5" />
                    Regenerate codes
                  </button>
                  <button
                    ref={setKeepNode}
                    type="button"
                    onClick={closeWarning}
                    className={cn(action, "opacity-100")}
                  >
                    Keep these
                  </button>
                </span>
              </motion.div>
            ) : (
              <motion.div
                key="actions"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                transition={{ duration: durations.fast }}
                role="toolbar"
                aria-label="Save your codes"
                className="flex flex-wrap items-center gap-1.5"
              >
                <button
                  type="button"
                  onClick={copyAll}
                  aria-disabled={busy || undefined}
                  className={action}
                >
                  {copied ? (
                    <svg
                      viewBox="0 0 16 16"
                      aria-hidden
                      className="size-3.5 text-success"
                    >
                      <motion.path
                        d="M3.5 8.5l3 3 6-7"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        initial={{ pathLength: motionSafe ? 0 : 1 }}
                        animate={{ pathLength: 1 }}
                        transition={
                          motionSafe ? springs.flick : { duration: 0 }
                        }
                      />
                    </svg>
                  ) : (
                    <Copy
                      aria-hidden
                      className="hidden size-3.5 @min-[18rem]:block"
                    />
                  )}
                  {copied ? "Copied" : "Copy all"}
                </button>
                <button
                  type="button"
                  onClick={download}
                  aria-disabled={busy || undefined}
                  className={action}
                >
                  <Download
                    aria-hidden
                    className="hidden size-3.5 @min-[18rem]:block"
                  />
                  Download
                </button>
                <button
                  type="button"
                  onClick={print}
                  aria-disabled={busy || undefined}
                  className={action}
                >
                  <Printer
                    aria-hidden
                    className="hidden size-3.5 @min-[18rem]:block"
                  />
                  Print
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="flex flex-col gap-2.5 border-t border-hairline pt-3">
          <label
            ref={confirmRef}
            className="-mx-1.5 flex cursor-pointer items-start gap-2.5 rounded-2 px-1.5 py-1 text-[12.5px] leading-5 text-foreground"
          >
            <span className="relative mt-0.5 flex size-4 shrink-0">
              <input
                type="checkbox"
                checked={isConfirmed}
                disabled={disabled}
                aria-describedby={`${uid}-why`}
                onChange={(event) => {
                  const next = event.currentTarget.checked;
                  setConfirmed(next);
                  setAnnouncement(
                    next
                      ? "Saved. Continue is unlocked."
                      : "Continue is locked again.",
                  );
                }}
                className="peer absolute inset-0 z-10 cursor-pointer opacity-0 disabled:cursor-not-allowed"
              />
              <span
                aria-hidden
                className={cn(
                  "flex size-4 items-center justify-center rounded-1 border transition-colors duration-150",
                  "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring peer-focus-visible:outline-solid",
                  isConfirmed
                    ? "border-transparent bg-[var(--sk-accent)]"
                    : "border-hairline-strong bg-surface-0",
                )}
              >
                {isConfirmed ? (
                  <svg
                    viewBox="0 0 16 16"
                    className="size-3"
                    style={{ color: ON_FILL }}
                  >
                    <motion.path
                      d="M3.5 8.5l3 3 6-7"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2.4}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      initial={{ pathLength: motionSafe ? 0 : 1 }}
                      animate={{ pathLength: 1 }}
                      transition={motionSafe ? springs.flick : { duration: 0 }}
                    />
                  </svg>
                ) : null}
              </span>
            </span>
            <span>
              I’ve saved these codes somewhere safe
              <span id={`${uid}-why`} className="sr-only">
                Without them, a lost phone means a support review.
              </span>
            </span>
          </label>

          <button
            type="button"
            onClick={proceed}
            aria-disabled={!isConfirmed || disabled || undefined}
            aria-describedby={!isConfirmed ? `${uid}-locked` : undefined}
            className={cn(
              "inline-flex h-10 w-full items-center justify-center gap-2 rounded-2 text-[13.5px] font-medium transition-[background-color,color,filter] duration-200",
              FOCUS,
              isConfirmed
                ? "hover:brightness-110"
                : "cursor-default bg-surface-2 text-ink-3",
            )}
            style={
              isConfirmed
                ? { backgroundColor: FILL, color: ON_FILL }
                : undefined
            }
          >
            <Lock open={isConfirmed} motionSafe={motionSafe} />
            Continue
          </button>
          <span id={`${uid}-locked`} className="sr-only">
            Tick the box to continue.
          </span>
        </div>
      </div>
      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
