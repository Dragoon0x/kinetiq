"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, exitFor, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type QrFoldProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The receiving address. Seeds the code and fills the chip. */
  address: string;
  /** Card heading. @default "Receive" */
  label?: React.ReactNode;
  /** Chain or rail the address belongs to; shown as a mono chip. */
  network?: string;
  /** Requested amount in major units. */
  amount?: number;
  /** Prints `amount`. */
  format?: (value: number) => string;
  /** Controlled fold state. */
  open?: boolean;
  /** Initial fold state for uncontrolled usage. @default false */
  defaultOpen?: boolean;
  /** Fires from the press or the Escape that changed it. */
  onOpenChange?: (open: boolean) => void;
  /** Grid size of the code; clamped to 21–33 and forced odd. @default 25 */
  modules?: number;
  /** Fires from the copy attempt with whether the clipboard took it. */
  onCopy?: (address: string, ok: boolean) => void;
  className?: string;
};

/**
 * An explicit locale, not the visitor's: a server that formats in one locale and
 * a client that formats in another produce different text for the same number,
 * which is a hydration mismatch on the amount being asked for.
 */
const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const defaultFormat = (value: number) => currency.format(value);

/** Height of the folded strip. The code lives behind it, squashed to its top. */
const STRIP = 14;
/** How long the copy result holds before the chip returns to rest. */
const COPY_HOLD_MS = 1600;

/** FNV-1a: one stable seed per address, so both render passes agree. */
const seedOf = (input: string): number => {
  let h = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    h ^= input.charCodeAt(index);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
};

/**
 * A procedural stand-in for a payment code — finders, timing lines, an
 * alignment block and hashed data, never a scannable code and never an asset.
 * The whole grid is emitted as one path: a 25-module code is 300-odd dark cells,
 * and 300 `<rect>` nodes is a layout cost for a picture that never reflows.
 */
const buildCode = (address: string, size: number): string => {
  const cells = new Array<boolean>(size * size).fill(false);
  const at = (x: number, y: number) => y * size + x;
  const alignAt = size - 9;

  const block = (ox: number, oy: number, span: number) => {
    for (let y = 0; y < span; y += 1) {
      for (let x = 0; x < span; x += 1) {
        const edge = x === 0 || x === span - 1 || y === 0 || y === span - 1;
        const half = (span - 1) / 2;
        const core =
          Math.abs(x - half) <= span / 6 && Math.abs(y - half) <= span / 6;
        cells[at(ox + x, oy + y)] = edge || core;
      }
    }
  };

  block(0, 0, 7);
  block(size - 7, 0, 7);
  block(0, size - 7, 7);
  block(alignAt, alignAt, 5);

  for (let i = 8; i < size - 8; i += 1) {
    cells[at(i, 6)] = i % 2 === 0;
    cells[at(6, i)] = i % 2 === 0;
  }

  const reserved = (x: number, y: number) =>
    (x < 8 && y < 8) ||
    (x >= size - 8 && y < 8) ||
    (x < 8 && y >= size - 8) ||
    x === 6 ||
    y === 6 ||
    // The alignment block keeps one module of quiet zone, not the whole
    // quadrant: reserving more leaves a blank corner no code would have.
    (x >= alignAt - 1 &&
      x <= alignAt + 5 &&
      y >= alignAt - 1 &&
      y <= alignAt + 5);

  let h = seedOf(address);
  let d = "";
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (!reserved(x, y)) {
        h = Math.imul(h ^ (x * 73856093) ^ (y * 19349663), 0x01000193) >>> 0;
        cells[at(x, y)] = ((h >>> 11) & 1) === 1;
      }
      if (cells[at(x, y)]) d += `M${x} ${y}h1v1h-1z`;
    }
  }
  return d;
};

const shorten = (address: string) =>
  address.length > 18 ? `${address.slice(0, 8)}…${address.slice(-6)}` : address;

/**
 * A receive card whose code lives folded into a strip until you ask for it.
 * Pressing unfolds it: the wrapper's height glides from the strip to the
 * square's measured height — a `ResizeObserver` supplies that number, so no
 * space is held for a state that is not showing — while the code scales up from
 * its top edge, which is what makes it read as paper opening downwards rather
 * than a box growing. Folding away never springs; Escape runs it back on the
 * exit ease and hands focus to the toggle.
 *
 * The code is procedural and fake: an FNV-1a hash of the address seeds the
 * grid, and the whole grid is one SVG path. Beneath it the address chip copies
 * — the tick draws on `flick`, because a confirmation flicks — and a clipboard
 * that refuses says so rather than pretending.
 *
 * Under reduced motion the height and the fold set at once and the code
 * cross-fades in; whether the code is showing is the point of the control, so
 * it still shows.
 */
export function QrFold({
  ref,
  address,
  label = "Receive",
  network,
  amount,
  format = defaultFormat,
  open,
  defaultOpen = false,
  onOpenChange,
  modules = 25,
  onCopy,
  className,
}: QrFoldProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const panelId = `${baseId}-panel`;
  const labelId = `${baseId}-label`;

  const [uncontrolled, setUncontrolled] = React.useState(defaultOpen);
  const isControlled = open !== undefined;
  const isOpen = isControlled ? open : uncontrolled;

  const toggleRef = React.useRef<HTMLButtonElement | null>(null);
  const codeRef = React.useRef<HTMLDivElement | null>(null);
  const [measured, setMeasured] = React.useState(STRIP);

  const setOpen = (next: boolean) => {
    if (next === isOpen) return;
    if (!isControlled) setUncontrolled(next);
    onOpenChange?.(next);
  };

  // The square's height is its own width, so measuring it cannot loop: the
  // wrapper's animated height never feeds back into the code's layout.
  React.useEffect(() => {
    const node = codeRef.current;
    if (!node) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const height =
        entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height;
      if (height > 0) setMeasured(Math.round(height));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const [copied, setCopied] = React.useState<"ok" | "failed" | null>(null);
  React.useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(null), COPY_HOLD_MS);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const copy = async () => {
    let ok = false;
    try {
      await navigator.clipboard.writeText(address);
      ok = true;
    } catch {
      // A denied or missing clipboard is a state to show, not a crash.
      ok = false;
    }
    setCopied(ok ? "ok" : "failed");
    onCopy?.(address, ok);
  };

  const size = Math.max(21, Math.min(33, Math.round(modules) | 1));
  const path = React.useMemo(() => buildCode(address, size), [address, size]);

  const fade = { duration: durations.fast, ease: easings.enter } as const;
  const foldTransition = motionSafe
    ? isOpen
      ? springs.glide
      : exitFor(durations.slow)
    : { duration: 0 };

  return (
    <div
      ref={ref}
      role="group"
      aria-labelledby={labelId}
      onKeyDown={(event) => {
        if (event.key !== "Escape" || !isOpen) return;
        event.stopPropagation();
        setOpen(false);
        toggleRef.current?.focus();
      }}
      className={cn(
        "flex w-full flex-col gap-3 rounded-3 border border-hairline bg-surface-1 p-4",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span id={labelId} className="min-w-0 truncate text-sm font-semibold">
          {label}
        </span>
        {network ? (
          <span className="flex h-6 shrink-0 items-center rounded-full border border-hairline bg-surface-2 px-2 font-mono text-[10px] tracking-[0.08em] text-ink-2 uppercase">
            {network}
          </span>
        ) : null}
      </div>

      {amount === undefined ? null : (
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[11px] text-ink-3">Requesting</span>
          <span className="text-lg leading-none font-semibold text-ink tabular-nums">
            {format(amount)}
          </span>
        </div>
      )}

      <button
        ref={toggleRef}
        type="button"
        aria-expanded={isOpen}
        aria-controls={panelId}
        onClick={() => setOpen(!isOpen)}
        className={cn(
          "flex h-9 w-full items-center justify-between gap-2 rounded-2 border border-hairline bg-surface-0 px-3 text-xs font-medium transition-colors outline-none",
          "hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        )}
      >
        <span>{isOpen ? "Hide payment code" : "Show payment code"}</span>
        {/* The turn lives on an HTML wrapper, not the <svg> itself: motion
            rewrites transform-origin for SVG nodes from its own values, and a
            plain span keeps the chevron turning about its own centre. */}
        <motion.span
          aria-hidden
          className="grid size-3.5 shrink-0 place-items-center text-ink-3"
          initial={false}
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={motionSafe ? springs.snap : { duration: 0 }}
        >
          <svg
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-3.5"
          >
            <path d="m4 6 4 4 4-4" />
          </svg>
        </motion.span>
      </button>

      {/* The code is capped and centred rather than full-bleed: a payment code
          is read at a comfortable size, and an unfolded card that grows with
          the column would outrun the viewport it lives in. */}
      <motion.div
        id={panelId}
        className="relative mx-auto w-full max-w-48 overflow-hidden rounded-2 border border-hairline bg-surface-0"
        initial={false}
        animate={{ height: isOpen ? measured : STRIP }}
        transition={foldTransition}
      >
        <div ref={codeRef} aria-hidden={!isOpen} className="w-full">
          <motion.div
            className="w-full origin-top"
            initial={false}
            animate={
              motionSafe
                ? { scaleY: isOpen ? 1 : 0.04, opacity: isOpen ? 1 : 0.45 }
                : { scaleY: 1, opacity: isOpen ? 1 : 0 }
            }
            transition={
              motionSafe
                ? isOpen
                  ? { ...springs.glide, opacity: fade }
                  : exitFor(durations.slow)
                : fade
            }
          >
            <div className="p-3">
              <svg
                viewBox={`-1 -1 ${size + 2} ${size + 2}`}
                role="img"
                aria-label={`Payment code for ${network ? `${network} address ` : "address "}${address}`}
                shapeRendering="crispEdges"
                className="block w-full"
              >
                <rect
                  x={-1}
                  y={-1}
                  width={size + 2}
                  height={size + 2}
                  fill="var(--bg-1)"
                />
                <path d={path} fill="var(--ink)" />
              </svg>
            </div>
          </motion.div>
        </div>
      </motion.div>

      <button
        type="button"
        aria-label={`Copy address ${address}`}
        onClick={() => {
          void copy();
        }}
        className={cn(
          "flex h-9 w-full items-center justify-between gap-2 rounded-2 border border-hairline bg-surface-0 px-3 transition-colors outline-none",
          "hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        )}
      >
        <span
          aria-hidden
          className="min-w-0 truncate font-mono text-[11px] text-ink-2"
        >
          {shorten(address)}
        </span>
        {/* All three marks share one grid cell, so the result can never change
            the chip's width and shove the address into a different truncation. */}
        <span aria-hidden className="grid size-4 shrink-0 place-items-center">
          <motion.svg
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="col-start-1 row-start-1 size-4 text-ink-3"
            initial={false}
            animate={{ opacity: copied === null ? 1 : 0 }}
            transition={fade}
          >
            <rect x="5.5" y="5.5" width="8" height="8" rx="1.6" />
            <path d="M10.5 5.5v-2a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2" />
          </motion.svg>
          <motion.svg
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="col-start-1 row-start-1 size-4 text-success"
            initial={false}
            animate={{ opacity: copied === "ok" ? 1 : 0 }}
            transition={fade}
          >
            <motion.path
              d="M3.5 8.5 6.5 11.5 12.5 4.5"
              pathLength={1}
              initial={false}
              animate={{ pathLength: copied === "ok" ? 1 : 0 }}
              transition={motionSafe ? springs.flick : { duration: 0 }}
            />
          </motion.svg>
          <motion.svg
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            className="col-start-1 row-start-1 size-4 text-danger"
            initial={false}
            animate={{ opacity: copied === "failed" ? 1 : 0 }}
            transition={fade}
          >
            <path d="M8 3.5v5.5M8 12.2v.3" />
          </motion.svg>
        </span>
      </button>

      <span role="status" className="sr-only">
        {copied === "ok"
          ? "Address copied"
          : copied === "failed"
            ? "Clipboard unavailable"
            : ""}
      </span>
    </div>
  );
}
