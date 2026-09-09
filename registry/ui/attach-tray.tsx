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

export type AttachKind = "image" | "doc" | "sheet" | "code" | "file";

export type AttachFile = {
  id: string;
  name: string;
  /** Bytes. */
  size: number;
  /** Upload progress 0..1; at 1 the ring becomes a check. */
  progress: number;
  /** Picks the glyph; inferred from the extension when omitted. */
  kind?: AttachKind;
};

export type AttachTrayProps = {
  ref?: React.Ref<HTMLDivElement>;
  files: AttachFile[];
  /** Fires from a drop or the file picker with the names and sizes chosen. */
  onAdd?: (files: { name: string; size: number }[]) => void;
  /** Fires from a chip's remove button. */
  onRemove?: (id: string) => void;
  /** Formats every size. @default KB / MB with one decimal */
  format?: (bytes: number) => string;
  /** Names the tray. */
  label: string;
  className?: string;
};

export const formatBytes = (bytes: number): string =>
  bytes >= 1048576
    ? `${(bytes / 1048576).toFixed(1)} MB`
    : bytes >= 1024
      ? `${Math.round(bytes / 1024)} KB`
      : `${Math.max(0, Math.round(bytes))} B`;

const IMAGE = ["png", "jpg", "jpeg", "gif", "svg", "webp"];
const SHEET = ["xlsx", "xls", "csv", "numbers"];
const CODE = ["ts", "tsx", "js", "jsx", "py", "rs", "go", "json", "css"];
const DOC = ["pdf", "doc", "docx", "md", "txt", "rtf"];

const kindOf = (name: string): AttachKind => {
  const ext = name.slice(name.lastIndexOf(".") + 1).toLowerCase();
  if (IMAGE.includes(ext)) return "image";
  if (SHEET.includes(ext)) return "sheet";
  if (CODE.includes(ext)) return "code";
  if (DOC.includes(ext)) return "doc";
  return "file";
};

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/** One path per kind, so a glyph is a lookup rather than a component tree. */
const GLYPHS: Record<AttachKind, string> = {
  image:
    "M3 3.5h10v9H3zM7 6.5a1 1 0 1 1-2 0 1 1 0 0 1 2 0M3 12l3.5-3.5 2.5 2.5 2-2 2.5 2.5",
  sheet: "M3 3h10v10H3zM3 6.5h10M3 10h10M7 3v10",
  code: "m5.5 5-3 3 3 3M10.5 5l3 3-3 3M9 3.5l-2 9",
  doc: "M4 2.5h5l3.5 3.5v7.5H4zM9 2.5V6h3.5M6 9h4M6 11.5h4",
  file: "M4 2.5h5l3.5 3.5v7.5H4zM9 2.5V6h3.5",
};

/**
 * Files that dock beside the prompt. The whole tray is a drop target for the
 * OS, and an Add files button opens a real file input, so the keyboard reaches
 * the same door. Each file becomes a chip that slides in from `distances.step`
 * on `snap` with a progress ring whose dash offset follows `progress` on
 * `glide` — an upload settles, it does not jump — and at 1 the ring gives way
 * to a check drawn on `flick`.
 *
 * Removing a chip runs its exit on the exit ease, and the row beneath is
 * measured by a ResizeObserver so the tray's height glides to the new row
 * count — to zero when the last chip goes — with nothing reserved. Rings are
 * progress bars with a value text, remove buttons are named by file, and a
 * status line announces each file as it attaches. Under reduced motion chips
 * fade in without travel, the ring still fills on a tween, and the height
 * swaps on a tween.
 */
export function AttachTray({
  ref,
  files,
  onAdd,
  onRemove,
  format = formatBytes,
  label,
  className,
}: AttachTrayProps) {
  const motionSafe = useMotionSafe();
  const labelId = React.useId();
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const [dragging, setDragging] = React.useState(false);

  const innerRef = React.useRef<HTMLDivElement | null>(null);
  const [height, setHeight] = React.useState<number | null>(null);
  React.useEffect(() => {
    const node = innerRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() =>
      setHeight(Math.round(node.offsetHeight)),
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // Announce an attachment once, when its progress first reaches 1. The seen
  // set is adjusted during render so the message belongs to that settle, not
  // to the parent's next re-render.
  const [seen, setSeen] = React.useState<{
    doneIds: string[];
    message: string;
  }>({ doneIds: [], message: "" });
  const doneNow = files.filter((file) => file.progress >= 1);
  const newlyDone = doneNow.filter((file) => !seen.doneIds.includes(file.id));
  if (newlyDone.length > 0) {
    setSeen({
      doneIds: doneNow.map((file) => file.id),
      message: `${newlyDone.map((file) => file.name).join(", ")} attached`,
    });
  }

  const uploading = files.length - doneNow.length;
  const total = files.reduce((sum, file) => sum + file.size, 0);
  const summary =
    files.length === 0
      ? "Nothing attached"
      : uploading > 0
        ? `${uploading} uploading`
        : `${files.length} file${files.length === 1 ? "" : "s"} · ${format(total)}`;

  const take = (list: ArrayLike<File> | null | undefined) => {
    const picked = Array.from(list ?? []).map((file) => ({
      name: file.name,
      size: file.size,
    }));
    if (picked.length > 0) onAdd?.(picked);
  };

  const remove = (file: AttachFile) => {
    setSeen((prev) => ({ ...prev, message: `Removed ${file.name}` }));
    onRemove?.(file.id);
  };

  const fade = { duration: durations.fast, ease: easings.enter } as const;
  const heightTransition = motionSafe
    ? springs.glide
    : { duration: durations.fast, ease: easings.move };

  return (
    <div
      ref={ref}
      role="group"
      aria-labelledby={labelId}
      onDragOver={(event) => {
        event.preventDefault();
        if (!dragging) setDragging(true);
      }}
      onDragLeave={(event) => {
        const next = event.relatedTarget as Node | null;
        if (!next || !event.currentTarget.contains(next)) setDragging(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        take(event.dataTransfer?.files);
      }}
      className={cn(
        "flex w-full flex-col rounded-3 border bg-surface-1 transition-colors",
        dragging ? "border-cobalt-bright bg-cobalt-wash" : "border-hairline",
        className,
      )}
    >
      <div className="flex h-10 items-center justify-between gap-3 px-3">
        <span id={labelId} className="min-w-0 truncate text-sm font-semibold">
          {label}
        </span>
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={summary}
            className="shrink-0 font-mono text-[11px] text-ink-3 tabular-nums"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            transition={fade}
          >
            {summary}
          </motion.span>
        </AnimatePresence>
      </div>

      <motion.div
        initial={false}
        animate={{ height: height ?? "auto" }}
        transition={heightTransition}
        className="overflow-hidden"
      >
        <div ref={innerRef}>
          {/* `empty:hidden` drops the padding only once the last exiting chip
              has truly gone, so the tray folds after the chip, not before. */}
          <ul className="flex flex-wrap gap-1.5 px-3 pb-2.5 empty:hidden">
            <AnimatePresence initial={false}>
              {files.map((file) => {
                const progress = clamp01(file.progress);
                const done = progress >= 1;
                const percent = Math.round(progress * 100);
                const offset = Number((1 - progress).toFixed(3));
                return (
                  <motion.li
                    key={file.id}
                    layout={motionSafe ? "position" : false}
                    initial={
                      motionSafe
                        ? { x: -distances.step, opacity: 0 }
                        : { opacity: 0 }
                    }
                    animate={{ x: 0, opacity: 1 }}
                    exit={{
                      opacity: 0,
                      scale: motionSafe ? 0.92 : 1,
                      transition: exitFor(durations.fast),
                    }}
                    transition={
                      motionSafe ? { ...springs.snap, opacity: fade } : fade
                    }
                    className="flex h-8 max-w-full items-center gap-1.5 rounded-2 border border-hairline-strong bg-surface-2 pr-0.5 pl-2"
                  >
                    <svg
                      viewBox="0 0 16 16"
                      aria-hidden
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="size-3.5 shrink-0 text-ink-3"
                    >
                      <path d={GLYPHS[file.kind ?? kindOf(file.name)]} />
                    </svg>
                    <span
                      title={file.name}
                      className="min-w-0 truncate text-xs font-medium text-foreground"
                    >
                      {file.name}
                    </span>
                    <span className="shrink-0 font-mono text-[10px] text-ink-3 tabular-nums">
                      {format(file.size)}
                    </span>
                    <span
                      role="progressbar"
                      aria-label={`${file.name} upload`}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={percent}
                      aria-valuetext={
                        done ? "Attached" : `Uploading ${percent} percent`
                      }
                      className="grid size-4 shrink-0 place-items-center"
                    >
                      <motion.svg
                        viewBox="0 0 16 16"
                        aria-hidden
                        className="col-start-1 row-start-1 size-4"
                        initial={false}
                        animate={{ opacity: done ? 0 : 1 }}
                        transition={fade}
                      >
                        <circle
                          cx="8"
                          cy="8"
                          r="6"
                          fill="none"
                          stroke="currentColor"
                          strokeOpacity="0.2"
                          strokeWidth="2"
                        />
                        <motion.circle
                          cx="8"
                          cy="8"
                          r="6"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          pathLength={1}
                          strokeDasharray="1 1"
                          transform="rotate(-90 8 8)"
                          className="text-cobalt-bright"
                          initial={false}
                          animate={{ strokeDashoffset: offset }}
                          // Progress is information: it still fills under
                          // reduced motion, on a tween instead of a spring.
                          transition={
                            motionSafe
                              ? springs.glide
                              : {
                                  duration: durations.base,
                                  ease: easings.enter,
                                }
                          }
                        />
                      </motion.svg>
                      <svg
                        viewBox="0 0 16 16"
                        aria-hidden
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="col-start-1 row-start-1 size-3.5 text-success"
                      >
                        <motion.path
                          d="M3.5 8.5 6.5 11.5 12.5 4.5"
                          pathLength={1}
                          initial={false}
                          animate={{
                            pathLength: done ? 1 : 0,
                            opacity: done ? 1 : 0,
                          }}
                          transition={
                            motionSafe
                              ? { ...springs.flick, opacity: { duration: 0 } }
                              : { duration: 0 }
                          }
                        />
                      </svg>
                    </span>
                    <button
                      type="button"
                      aria-label={`Remove ${file.name}`}
                      onClick={() => remove(file)}
                      className="grid size-6 shrink-0 place-items-center rounded-1 text-ink-3 transition-colors outline-none hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
                    >
                      <svg
                        viewBox="0 0 16 16"
                        aria-hidden
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.75"
                        strokeLinecap="round"
                        className="size-3"
                      >
                        <path d="m4.5 4.5 7 7M11.5 4.5l-7 7" />
                      </svg>
                    </button>
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </ul>
        </div>
      </motion.div>

      <div className="flex items-center justify-between gap-3 border-t border-hairline py-2 pr-2 pl-3">
        <span className="min-w-0 truncate text-xs text-ink-3">
          {dragging ? "Drop to attach" : "Drop files here"}
        </span>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex h-8 shrink-0 items-center gap-1.5 rounded-2 border border-hairline-strong bg-surface-2 px-2.5 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <svg
            viewBox="0 0 16 16"
            aria-hidden
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            className="size-3.5 shrink-0"
          >
            <path d="M8 3.5v9M3.5 8h9" />
          </svg>
          Add files
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          tabIndex={-1}
          aria-hidden
          className="sr-only"
          onChange={(event) => {
            take(event.target.files);
            // Cleared so the same file can be chosen again after a removal.
            event.target.value = "";
          }}
        />
      </div>

      <span role="status" className="sr-only">
        {seen.message}
      </span>
    </div>
  );
}
