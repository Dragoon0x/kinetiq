"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, exitFor, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type FileKind = "doc" | "sheet" | "archive";

export type FileState = "offer" | "loading" | "ready" | "failed";

export type FileMessage = {
  id: string;
  /** Own files sit on the right. */
  from: "me" | "peer";
  name: string;
  bytes: number;
  /** Draws the type tile; falls back to the extension. */
  kind?: FileKind;
  /** How much has come down, 0..1. Read while the state is loading. */
  progress?: number;
  /** @default "offer" */
  state?: FileState;
  /** Printed under the card, already formatted. */
  time?: string;
};

export type FileCardProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The files in the thread, oldest first. */
  files: FileMessage[];
  /** Renders every size. @default a KB/MB formatter */
  format?: (bytes: number) => string;
  /** Fires from the round control while the file is on offer. */
  onDownload?: (id: string) => void;
  /** Fires from the same control while it is loading. */
  onCancel?: (id: string) => void;
  /** Fires from the Open pill. */
  onOpen?: (id: string) => void;
  /** Fires from the Retry pill after a failure. */
  onRetry?: (id: string) => void;
  /** Fires once, when a file first reaches "ready". */
  onSettle?: (id: string) => void;
  /** The other person; every sentence names them. @default "Them" */
  peerName?: string;
  /** Names the thread list for assistive technology. */
  label: string;
  className?: string;
};

const FADE = { duration: durations.fast, ease: easings.enter } as const;

const TICK = "M4 9.5 7 12.5 12.5 5.5";

/** Six decimals: a raw float in a dash offset never hydrates cleanly. */
const r6 = (value: number) => Number(value.toFixed(6));

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/** Integer ops only, so the server and the browser draw the same tile. */
function stream(seed: number) {
  let state = (Math.floor(seed) * 0x9e3779b1) >>> 0 || 1;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const defaultFormat = (bytes: number): string => {
  if (bytes < 1000) return `${Math.round(bytes)} B`;
  if (bytes < 1_000_000) return `${(bytes / 1000).toFixed(0)} KB`;
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
};

const extensionOf = (name: string) => {
  const parts = name.split(".");
  const last = parts.length > 1 ? parts[parts.length - 1] : undefined;
  return last ? last.toUpperCase() : "FILE";
};

const kindOf = (file: FileMessage): FileKind => {
  if (file.kind) return file.kind;
  const extension = extensionOf(file.name);
  if (extension === "CSV" || extension === "XLSX") return "sheet";
  if (extension === "ZIP" || extension === "TAR") return "archive";
  return "doc";
};

const KIND_WORD: Record<FileKind, string> = {
  doc: "document",
  sheet: "sheet",
  archive: "archive",
};

const stateOf = (file: FileMessage): FileState => file.state ?? "offer";

/**
 * The type tile is drawn from the name's own characters, so the same file
 * always looks the same: a folded page of lines, a page of bars, or a stack
 * of slabs.
 */
function TypeTile({ kind, seed }: { kind: FileKind; seed: number }) {
  const next = stream(seed);

  if (kind === "sheet") {
    const bars = [0, 1, 2].map((index) => {
      const height = Number((10 + next() * 14).toFixed(3));
      return { x: 11 + index * 7, y: Number((34 - height).toFixed(3)), height };
    });
    return (
      <svg viewBox="0 0 40 48" aria-hidden className="size-full">
        <path d="M7 6h26v36H7z" className="fill-success" opacity="0.16" />
        <path d="M7 6h26v6H7z" className="fill-success" opacity="0.4" />
        {bars.map((bar, index) => (
          <rect
            key={`bar-${index}`}
            x={bar.x}
            y={bar.y}
            width="5"
            height={bar.height}
            className="fill-success"
            opacity="0.55"
          />
        ))}
        <path
          d="M9 36h22"
          className="stroke-success"
          strokeWidth="1.5"
          opacity="0.5"
        />
      </svg>
    );
  }

  if (kind === "archive") {
    return (
      <svg viewBox="0 0 40 48" aria-hidden className="size-full">
        {[0, 1, 2].map((slab) => (
          <rect
            key={`slab-${slab}`}
            x="7"
            y={10 + slab * 10}
            width="26"
            height="8"
            rx="2"
            className="fill-ink"
            opacity={0.14 + slab * 0.08}
          />
        ))}
        <circle cx="20" cy="14" r="2.5" className="fill-warn" />
      </svg>
    );
  }

  const lines = [0, 1, 2, 3].map((row) => ({
    y: 20 + row * 6,
    width: Number((8 + next() * 15).toFixed(3)),
  }));
  return (
    <svg viewBox="0 0 40 48" aria-hidden className="size-full">
      <path d="M8 6h17l7 7v29H8z" className="fill-cobalt" opacity="0.16" />
      <path d="M25 6v7h7" className="fill-cobalt" opacity="0.4" />
      <g className="stroke-cobalt" strokeWidth="1.75" strokeLinecap="round">
        {lines.map((line, index) => (
          <path
            key={`line-${index}`}
            d={`M12 ${line.y}h${line.width}`}
            opacity="0.55"
          />
        ))}
      </g>
    </svg>
  );
}

type ControlProps = {
  state: FileState;
  fraction: number;
  label: string;
  motionSafe: boolean;
  onPress: () => void;
};

/**
 * One control for the whole journey. The ring's dash offset follows progress
 * on `glide` — a transfer settles, it does not jump — and at 1 the round
 * button widens into a pill with `layout` rather than one control leaving and
 * another arriving in its place.
 */
function TransferControl({
  state,
  fraction,
  label,
  motionSafe,
  onPress,
}: ControlProps) {
  const round = state === "offer" || state === "loading";
  const failed = state === "failed";

  return (
    <motion.button
      type="button"
      layout={motionSafe}
      transition={springs.glide}
      onClick={onPress}
      aria-label={label}
      className={cn(
        "relative flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-full border text-xs font-medium transition-colors outline-none",
        "hover:bg-accent active:bg-cobalt-wash",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        round ? "w-9" : "px-3",
        failed
          ? "border-danger text-danger"
          : "border-hairline-strong text-foreground",
      )}
    >
      <AnimatePresence initial={false}>
        {round ? (
          <motion.svg
            key="ring"
            viewBox="0 0 36 36"
            aria-hidden
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            transition={FADE}
            className="pointer-events-none absolute inset-0 size-full"
          >
            <circle
              cx="18"
              cy="18"
              r="15"
              fill="none"
              stroke="currentColor"
              strokeOpacity="0.14"
              strokeWidth="2"
            />
            <motion.circle
              cx="18"
              cy="18"
              r="15"
              fill="none"
              className="text-cobalt-bright"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              pathLength={1}
              strokeDasharray="1 1"
              transform="rotate(-90 18 18)"
              initial={false}
              animate={{ strokeDashoffset: r6(1 - fraction) }}
              transition={
                motionSafe
                  ? springs.glide
                  : { duration: durations.base, ease: easings.move }
              }
            />
          </motion.svg>
        ) : null}
      </AnimatePresence>

      {round ? (
        <span aria-hidden className="grid size-4 place-items-center">
          <motion.svg
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="col-start-1 row-start-1 size-4"
            initial={false}
            animate={{ opacity: state === "offer" ? 1 : 0 }}
            transition={FADE}
          >
            <path d="M8 3v8M4.5 7.5 8 11l3.5-3.5" />
          </motion.svg>
          <motion.svg
            viewBox="0 0 16 16"
            className="col-start-1 row-start-1 size-4"
            initial={false}
            animate={{ opacity: state === "loading" ? 1 : 0 }}
            transition={FADE}
          >
            <rect
              x="5.5"
              y="5.5"
              width="5"
              height="5"
              rx="1"
              fill="currentColor"
            />
          </motion.svg>
        </span>
      ) : (
        <>
          <svg
            viewBox="0 0 16 16"
            aria-hidden
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-3.5 shrink-0"
          >
            {failed ? (
              <path d="M12.5 6.5A5 5 0 1 0 13 9M12.5 3v3.5H9" />
            ) : (
              <motion.path
                d={TICK}
                pathLength={1}
                strokeDasharray="1 1"
                initial={{ strokeDashoffset: 1 }}
                animate={{ strokeDashoffset: 0 }}
                transition={
                  motionSafe ? springs.flick : { duration: durations.fast }
                }
              />
            )}
          </svg>
          <motion.span layout={motionSafe ? "position" : false}>
            {failed ? "Retry" : "Open"}
          </motion.span>
        </>
      )}
    </motion.button>
  );
}

/**
 * A file, and how far it has come. One control carries the whole journey: a
 * round button with a down arrow on offer, a ring that fills on `glide` as
 * `progress` climbs with the arrow cross-faded to a stop square so the same
 * press cancels, and at 1 a pill that widens in place with `layout` while a
 * tick draws on `flick`. Failure freezes the ring where it stopped and hands
 * its place to a Retry pill, states "Failed" in words beside the name and
 * tints the card's edge danger — nothing bounces, because a failure does not
 * celebrate.
 *
 * The type tile is drawn from the file's own name, never loaded, and the mono
 * readout changes register with the state — the size, then the bytes so far,
 * then the size again — in `tabular-nums` so a climbing percentage never
 * shifts the name beside it. A status region speaks each settle once. Under
 * reduced motion the ring still fills and the tick still appears, on tweens,
 * because progress is information rather than flourish.
 */
export function FileCard({
  ref,
  files,
  format = defaultFormat,
  onDownload,
  onCancel,
  onOpen,
  onRetry,
  onSettle,
  peerName = "Them",
  label,
  className,
}: FileCardProps) {
  const motionSafe = useMotionSafe();

  const stateKey = files.map((file) => `${file.id}:${stateOf(file)}`).join(" ");

  // The sentence is frozen at the hop that produced it, so the region speaks
  // what happened rather than what a later re-render recomputes.
  const [spoken, setSpoken] = React.useState({ key: stateKey, message: "" });
  if (spoken.key !== stateKey) {
    const before = new Map(
      (spoken.key === "" ? [] : spoken.key.split(" ")).map((pair) => {
        const [id, state] = pair.split(":");
        return [id ?? "", state ?? ""] as const;
      }),
    );
    const changed = files.filter((file) => {
      const next = stateOf(file);
      return (
        before.get(file.id) !== next && (next === "ready" || next === "failed")
      );
    });
    const last = changed[changed.length - 1];
    setSpoken({
      key: stateKey,
      message: last
        ? stateOf(last) === "ready"
          ? `${last.name} downloaded`
          : `${last.name} failed, retry available`
        : spoken.message,
    });
  }

  // Settles are reported from an effect: a callback fired during render would
  // run again for every parent re-render, and once per file is the point.
  const onSettleRef = React.useRef(onSettle);
  React.useEffect(() => {
    onSettleRef.current = onSettle;
  });
  const [settled] = React.useState(
    () =>
      new Set<string>(
        files
          .filter((file) => stateOf(file) === "ready")
          .map((file) => file.id),
      ),
  );
  const readyKey = files
    .filter((file) => stateOf(file) === "ready")
    .map((file) => file.id)
    .join(" ");
  React.useEffect(() => {
    const ids = readyKey === "" ? [] : readyKey.split(" ");
    for (const id of ids) {
      if (settled.has(id)) continue;
      settled.add(id);
      onSettleRef.current?.(id);
    }
  }, [readyKey, settled]);

  return (
    <div ref={ref} className={cn("flex w-full flex-col gap-2", className)}>
      <ol
        role="list"
        aria-label={label}
        className="flex flex-col gap-3 px-0.5 pb-0.5"
      >
        {files.map((file) => {
          const state = stateOf(file);
          const fraction = clamp01(file.progress ?? 0);
          const percent = Math.round(fraction * 100);
          const kind = kindOf(file);
          const sender = file.from === "me" ? "You" : peerName;
          const size = format(file.bytes);
          const control =
            state === "offer"
              ? `Download ${file.name}, ${size}`
              : state === "loading"
                ? `Cancel download of ${file.name}, ${percent} percent`
                : state === "ready"
                  ? `Open ${file.name}`
                  : `Retry download of ${file.name}`;

          return (
            <li
              key={file.id}
              className={cn(
                "flex flex-col gap-1",
                file.from === "me" ? "items-end" : "items-start",
              )}
            >
              <div
                className={cn(
                  "flex w-[92%] max-w-72 items-center gap-3 rounded-3 border bg-surface-1 p-2.5 transition-colors",
                  state === "failed" ? "border-danger" : "border-hairline",
                )}
              >
                <span className="grid h-12 w-10 shrink-0 place-items-center rounded-2 bg-surface-2">
                  <TypeTile
                    kind={kind}
                    seed={file.name.length * 977 + file.bytes}
                  />
                </span>

                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span
                    className="truncate text-sm font-medium text-foreground"
                    title={file.name}
                  >
                    {file.name}
                  </span>
                  <span className="font-mono text-[11px] text-ink-3 tabular-nums">
                    {state === "loading"
                      ? `${format(file.bytes * fraction)} / ${size}`
                      : `${extensionOf(file.name)} · ${size}`}
                    {state === "ready" ? " · Downloaded" : null}
                    {state === "failed" ? (
                      <span className="text-danger"> · Failed</span>
                    ) : null}
                  </span>
                </span>

                {/* The bar is its own element: a button cannot also be a
                    progressbar, and the ring is what the eye reads. */}
                {state === "loading" ? (
                  <span
                    role="progressbar"
                    aria-valuenow={percent}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuetext={`${percent} percent, ${format(
                      file.bytes * fraction,
                    )} of ${size}`}
                    className="sr-only"
                  />
                ) : null}

                <TransferControl
                  state={state}
                  fraction={fraction}
                  label={control}
                  motionSafe={motionSafe}
                  onPress={() => {
                    if (state === "offer") onDownload?.(file.id);
                    else if (state === "loading") onCancel?.(file.id);
                    else if (state === "ready") onOpen?.(file.id);
                    else onRetry?.(file.id);
                  }}
                />
              </div>

              <span className="flex items-center gap-1.5 px-1 text-[11px] text-ink-3">
                <span>
                  {sender} · {KIND_WORD[kind]}
                </span>
                {file.time ? (
                  <span className="tabular-nums">{file.time}</span>
                ) : null}
              </span>
            </li>
          );
        })}
      </ol>

      <span role="status" aria-live="polite" className="sr-only">
        {spoken.message}
      </span>
    </div>
  );
}
