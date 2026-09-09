"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type DiffLine = { kind: "add" | "del" | "ctx"; text: string };

export type TouchedFile = {
  id: string;
  path: string;
  /** @default "modified" */
  kind?: "created" | "modified" | "deleted";
  added: number;
  removed: number;
  diff?: DiffLine[];
};

export type FileTouchProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The touched files so far, append-only; counts may keep rising. */
  files: TouchedFile[];
  /** The tool is still writing: the header dot breathes. @default false */
  writing?: boolean;
  /** Controlled id of the open diff. */
  openId?: string | null;
  /** Initial open diff for uncontrolled usage. @default null */
  defaultOpenId?: string | null;
  /** Fires from a row press or Escape. */
  onOpenChange?: (id: string | null) => void;
  /** Names the list. */
  label: string;
  className?: string;
};

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

/**
 * Digits that roll to their new value on `snap`. Hidden from assistive
 * technology: the row's accessible text already carries the number.
 */
function RollingNumber({
  value,
  motionSafe,
}: {
  value: number;
  motionSafe: boolean;
}) {
  const text = String(Math.max(0, Math.round(value)));
  return (
    <span aria-hidden className="inline-flex tabular-nums">
      {text.split("").map((char, index) => {
        const digit = DIGITS.indexOf(char as (typeof DIGITS)[number]);
        return (
          <span
            // Keyed from the right so the units column keeps its identity
            // when the number gains a digit.
            key={text.length - index}
            className="relative inline-block h-[1.25em] w-[1ch] overflow-hidden"
          >
            <motion.span
              className="absolute inset-x-0 top-0 flex flex-col"
              initial={false}
              animate={{ y: `${Math.max(0, digit) * -10}%` }}
              transition={motionSafe ? springs.snap : { duration: 0 }}
            >
              {DIGITS.map((face) => (
                <span key={face} className="flex h-[1.25em] justify-center">
                  {face}
                </span>
              ))}
            </motion.span>
          </span>
        );
      })}
    </span>
  );
}

const KIND_TONE = {
  created: "border-success/40 text-success",
  modified: "border-hairline-strong text-ink-2",
  deleted: "border-danger/40 text-danger",
} as const;

const NO_DIFF: DiffLine[] = [];

/** The added and removed counts, rolling; the sr-only copy reads them whole. */
function Counts({
  added,
  removed,
  motionSafe,
}: {
  added: number;
  removed: number;
  motionSafe: boolean;
}) {
  return (
    <span className="flex shrink-0 items-center gap-1.5 font-mono text-[11px] tabular-nums">
      <span className="text-success">
        +<RollingNumber value={added} motionSafe={motionSafe} />
      </span>
      <span className="text-danger">
        −<RollingNumber value={removed} motionSafe={motionSafe} />
      </span>
      <span className="sr-only">
        {added} added, {removed} removed
      </span>
    </span>
  );
}

/** The inline diff, its height measured so a diff that grows while the tool writes glides with it. */
function DiffPanel({
  id,
  label,
  lines,
  motionSafe,
}: {
  id: string;
  label: string;
  lines: DiffLine[];
  motionSafe: boolean;
}) {
  const innerRef = React.useRef<HTMLDivElement | null>(null);
  const [height, setHeight] = React.useState<number | null>(null);

  React.useEffect(() => {
    const node = innerRef.current;
    if (!node) return;
    const observer = new ResizeObserver(() =>
      setHeight(node.getBoundingClientRect().height),
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <motion.div
      id={id}
      role="region"
      aria-label={label}
      className="overflow-hidden"
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: height ?? "auto", opacity: 1 }}
      exit={{ height: 0, opacity: 0, transition: exitFor() }}
      transition={
        motionSafe
          ? { ...springs.glide, opacity: { duration: durations.fast } }
          : { duration: durations.fast, ease: easings.move }
      }
    >
      <div ref={innerRef} className="border-t border-hairline bg-surface-0">
        <div className="overflow-x-auto">
          <pre className="px-3 py-2 font-mono text-[11px] leading-5">
            {lines.length === 0 ? (
              <span className="block text-ink-3">No diff recorded.</span>
            ) : (
              lines.map((line, index) => (
                <span
                  // Diff lines are append-only, so the index is the identity.
                  key={index}
                  className={cn(
                    "block px-1",
                    line.kind === "add"
                      ? "bg-success/10 text-success"
                      : line.kind === "del"
                        ? "bg-danger/10 text-danger"
                        : "text-ink-2",
                  )}
                >
                  {line.kind === "add" ? "+" : line.kind === "del" ? "−" : " "}{" "}
                  {line.text}
                </span>
              ))
            )}
          </pre>
        </div>
      </div>
    </motion.div>
  );
}

/**
 * The files a tool has touched. Each row slides in from 8px left on `glide`
 * with a `durations.fast` fade, so a write reads as the file arriving in the
 * list rather than blinking on; its `+added −removed` counts roll on `snap`
 * as the tool keeps writing, and a two-tone bar keeps the proportion beside
 * them. Pressing a row opens its diff beneath it: the panel's height is
 * measured by a ResizeObserver and glides open on `glide`, and it keeps
 * gliding if the diff grows while the tool is still writing. One diff is open
 * at a time, so opening another folds the first.
 *
 * Every row is a real button with `aria-expanded`; Tab reaches each, Enter and
 * Space toggle, ArrowUp and ArrowDown walk the rows, Home and End jump, and
 * Escape closes an open diff without moving focus. The status region speaks
 * on state change only — writing, then the totals — never per file. Under
 * reduced motion rows fade in place, digits swap, and the panel tweens.
 */
export function FileTouch({
  ref,
  files,
  writing = false,
  openId,
  defaultOpenId = null,
  onOpenChange,
  label,
  className,
}: FileTouchProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const labelId = `${baseId}-label`;

  const [uncontrolled, setUncontrolled] = React.useState<string | null>(
    defaultOpenId,
  );
  const isControlled = openId !== undefined;
  const open = isControlled ? openId : uncontrolled;

  // Files present at mount are history, not arrivals: they must not slide in.
  const [baseline] = React.useState(files.length);
  const rowRefs = React.useRef(new Map<string, HTMLButtonElement | null>());

  const setOpen = (next: string | null) => {
    if (next === open) return;
    if (!isControlled) setUncontrolled(next);
    onOpenChange?.(next);
  };

  const focusRow = (index: number) => {
    const target = files[Math.min(files.length - 1, Math.max(0, index))];
    if (target) rowRefs.current.get(target.id)?.focus();
  };

  const handleKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    index: number,
    id: string,
  ) => {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        focusRow(index + 1);
        break;
      case "ArrowUp":
        event.preventDefault();
        focusRow(index - 1);
        break;
      case "Home":
        event.preventDefault();
        focusRow(0);
        break;
      case "End":
        event.preventDefault();
        focusRow(files.length - 1);
        break;
      case "Escape":
        if (open === id) {
          event.preventDefault();
          setOpen(null);
        }
        break;
      default:
        break;
    }
  };

  const added = files.reduce((sum, file) => sum + file.added, 0);
  const removed = files.reduce((sum, file) => sum + file.removed, 0);
  const announcement = writing
    ? "Writing"
    : files.length > 0
      ? `Wrote ${files.length} ${files.length === 1 ? "file" : "files"}, ${added} added, ${removed} removed`
      : "";

  const fade = { duration: durations.fast, ease: easings.enter } as const;

  return (
    <div
      ref={ref}
      className={cn(
        "flex w-full flex-col overflow-hidden rounded-3 border border-hairline bg-surface-1",
        className,
      )}
    >
      <div className="flex h-9 items-center justify-between gap-3 border-b border-hairline px-3">
        <span className="flex min-w-0 items-center gap-2">
          <span id={labelId} className="truncate text-sm font-semibold">
            {label}
          </span>
          <AnimatePresence initial={false}>
            {writing ? (
              <motion.span
                key="writing"
                aria-hidden
                className="size-1.5 shrink-0 rounded-full bg-cobalt-bright"
                initial={{ opacity: 0 }}
                animate={{ opacity: motionSafe ? [1, 0.35] : 0.6 }}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                // The breath keeps drift's ambient tempo; a dot is not a spinner.
                transition={
                  motionSafe
                    ? {
                        duration: 0.8,
                        ease: "easeInOut",
                        repeat: Infinity,
                        repeatType: "reverse",
                      }
                    : fade
                }
              />
            ) : null}
          </AnimatePresence>
        </span>
        <span className="flex shrink-0 items-center gap-1.5 font-mono text-[11px] tabular-nums">
          <span className="text-ink-3">
            <RollingNumber value={files.length} motionSafe={motionSafe} />
            <span className="sr-only">{files.length}</span>{" "}
            {files.length === 1 ? "file" : "files"}
          </span>
          <Counts added={added} removed={removed} motionSafe={motionSafe} />
        </span>
      </div>

      {files.length === 0 ? (
        <p className="px-3 py-3 text-xs text-ink-3">
          {writing ? "Waiting for the first write." : "No files touched."}
        </p>
      ) : (
        <ul aria-labelledby={labelId} className="flex flex-col">
          {files.map((file, index) => {
            const kind = file.kind ?? "modified";
            const isOpen = open === file.id;
            const rowId = `${baseId}-row-${file.id}`;
            const panelId = `${baseId}-panel-${file.id}`;
            const slash = file.path.lastIndexOf("/");
            const dir = slash >= 0 ? file.path.slice(0, slash + 1) : "";
            const base = slash >= 0 ? file.path.slice(slash + 1) : file.path;
            const total = file.added + file.removed;
            const share =
              total > 0 ? Number(((file.added / total) * 100).toFixed(3)) : 0;
            return (
              <motion.li
                key={file.id}
                className="border-b border-hairline last:border-b-0"
                initial={
                  index < baseline
                    ? false
                    : motionSafe
                      ? { opacity: 0, x: -distances.step }
                      : { opacity: 0 }
                }
                animate={{ opacity: 1, x: 0 }}
                transition={
                  motionSafe ? { ...springs.glide, opacity: fade } : fade
                }
              >
                <button
                  type="button"
                  id={rowId}
                  ref={(node) => {
                    rowRefs.current.set(file.id, node);
                  }}
                  aria-expanded={isOpen}
                  aria-controls={isOpen ? panelId : undefined}
                  onClick={() => setOpen(isOpen ? null : file.id)}
                  onKeyDown={(event) => handleKeyDown(event, index, file.id)}
                  className={cn(
                    "flex h-10 w-full items-center gap-2.5 px-3 text-left transition-colors outline-none hover:bg-accent",
                    "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
                  )}
                >
                  <span
                    className={cn(
                      "inline-flex h-5 shrink-0 items-center rounded-full border px-1.5 font-mono text-[10px] tracking-[0.08em] uppercase",
                      KIND_TONE[kind],
                    )}
                  >
                    {kind}
                  </span>
                  <span
                    className="min-w-0 flex-1 truncate font-mono text-xs"
                    title={file.path}
                  >
                    <span className="text-ink-3">{dir}</span>
                    <span className="text-foreground">{base}</span>
                  </span>
                  <Counts
                    added={file.added}
                    removed={file.removed}
                    motionSafe={motionSafe}
                  />
                  <span
                    aria-hidden
                    className="flex h-1 w-8 shrink-0 overflow-hidden rounded-full bg-hairline-strong"
                  >
                    <motion.span
                      className="h-full bg-success"
                      initial={false}
                      animate={{ width: `${share}%` }}
                      transition={
                        motionSafe
                          ? springs.glide
                          : { duration: durations.fast }
                      }
                    />
                    {total > 0 ? (
                      <span className="h-full flex-1 bg-danger" />
                    ) : null}
                  </span>
                  <motion.svg
                    viewBox="0 0 16 16"
                    aria-hidden
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="size-3.5 shrink-0 text-ink-3"
                    animate={{ rotate: isOpen ? 90 : 0 }}
                    transition={motionSafe ? springs.snap : { duration: 0 }}
                  >
                    <path d="m6 4 4 4-4 4" />
                  </motion.svg>
                </button>

                <AnimatePresence initial={false}>
                  {isOpen ? (
                    <DiffPanel
                      key="panel"
                      id={panelId}
                      label={`Diff of ${file.path}`}
                      lines={file.diff ?? NO_DIFF}
                      motionSafe={motionSafe}
                    />
                  ) : null}
                </AnimatePresence>
              </motion.li>
            );
          })}
        </ul>
      )}

      <span role="status" className="sr-only">
        {announcement}
      </span>
    </div>
  );
}
