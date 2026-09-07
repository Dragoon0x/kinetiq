"use client";

import * as React from "react";

import {
  AnimatePresence,
  animate,
  motion,
  useMotionTemplate,
  useMotionValue,
  useTransform,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

const UNITS = ["B", "KB", "MB", "GB"] as const;

/** Deterministic, locale-free — the same string on the server and the client. */
export function formatSize(bytes: number): string {
  let size = bytes;
  let unit = 0;
  while (size >= 1024 && unit < UNITS.length - 1) {
    size /= 1024;
    unit += 1;
  }
  const rounded =
    unit > 0 && size < 10 ? size.toFixed(1) : String(Math.round(size));
  return `${rounded} ${UNITS[unit] ?? "B"}`;
}

/** Stable per file, and the key `progress` is read by. */
export const fileKey = (file: File): string =>
  `${file.name}:${file.size}:${file.lastModified}`;

function accepted(file: File, accept?: string): boolean {
  if (!accept) return true;
  const patterns = accept
    .split(",")
    .map((pattern) => pattern.trim().toLowerCase())
    .filter(Boolean);
  if (patterns.length === 0) return true;
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();
  return patterns.some((pattern) => {
    if (pattern.startsWith(".")) return name.endsWith(pattern);
    if (pattern.endsWith("/*")) return type.startsWith(pattern.slice(0, -1));
    return type === pattern;
  });
}

export type CatchZoneProps = {
  /** Accepted MIME types or extensions, comma separated. */
  accept?: string;
  /** Allow more than one file. @default true */
  multiple?: boolean;
  /** Bytes; larger files are rejected with a reason. */
  maxSize?: number;
  /** Fires with the full accepted list after every add or remove. */
  onFiles?: (files: File[]) => void;
  /** Zone caption. */
  label: string;
  /** Upload progress 0–1 per file, keyed by `fileKey(file)`. */
  progress?: Record<string, number>;
  className?: string;
};

/**
 * A drop zone that braces. Dragging files over it pulls the dashed frame tight
 * — the dash and its gap interpolate together, so the frame stitches rather
 * than blinks — and contracts the whole panel 1.5% on `flick`, the smallest
 * move that still reads as taking the weight. Leaving relaxes both.
 *
 * Accepted files land as rows on `glide`, arriving from `distances.step`, and
 * each size stamps itself down on `recoil`. A refused file gets no celebration:
 * the frame nudges 4px on a tween and an alert says why.
 *
 * A real `<input type="file">` sits behind the button, so the keyboard path is
 * the platform's own picker rather than a re-implementation. Reduced motion
 * keeps the colour, the border and the rows, and drops the travel.
 */
export function CatchZone({
  accept,
  multiple = true,
  maxSize,
  onFiles,
  label,
  progress,
  className,
}: CatchZoneProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const hintId = `${baseId}-hint`;
  const inputRef = React.useRef<HTMLInputElement>(null);
  const depth = React.useRef(0);

  const [over, setOver] = React.useState(false);
  const [files, setFiles] = React.useState<File[]>([]);
  const [rejection, setRejection] = React.useState<{
    id: number;
    reason: string;
  } | null>(null);

  // One value drives both halves of the dash, so the frame tightens as a
  // pattern instead of two numbers racing each other.
  const tension = useMotionValue(0);
  const dash = useTransform(tension, [0, 1], [10, 4]);
  const gap = useTransform(tension, [0, 1], [8, 4]);
  const dashPattern = useMotionTemplate`${dash} ${gap}`;

  React.useEffect(() => {
    const controls = animate(
      tension,
      over ? 1 : 0,
      motionSafe ? springs.flick : { duration: 0 },
    );
    return () => controls.stop();
  }, [over, motionSafe, tension]);

  const nudge = useMotionValue(0);
  const rejectionId = rejection?.id ?? 0;
  React.useEffect(() => {
    if (rejectionId === 0 || !motionSafe) return;
    const controls = animate(nudge, [0, -4, 4, -2, 0], {
      duration: durations.base,
      ease: easings.move,
    });
    return () => controls.stop();
  }, [rejectionId, motionSafe, nudge]);

  const publish = (next: File[]) => {
    setFiles(next);
    onFiles?.(next);
  };

  const ingest = (list: FileList | null) => {
    if (!list || list.length === 0) return;
    const held = new Set(files.map(fileKey));
    const taken: File[] = [];
    let reason = "";

    for (const file of Array.from(list)) {
      if (!accepted(file, accept)) {
        reason = `${file.name} is not an accepted type.`;
        continue;
      }
      if (maxSize !== undefined && file.size > maxSize) {
        reason = `${file.name} is over ${formatSize(maxSize)}.`;
        continue;
      }
      if (held.has(fileKey(file))) continue;
      taken.push(file);
      if (!multiple) break;
    }

    if (reason) {
      setRejection((prev) => ({ id: (prev?.id ?? 0) + 1, reason }));
    } else {
      setRejection(null);
    }
    if (taken.length === 0) return;
    publish(multiple ? [...files, ...taken] : taken.slice(0, 1));
  };

  const limits = [
    accept ? accept.split(",").join(", ") : null,
    maxSize !== undefined ? `up to ${formatSize(maxSize)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className={cn("flex w-full flex-col gap-3", className)}>
      <motion.div
        style={{ x: nudge }}
        animate={{ scale: over && motionSafe ? 0.985 : 1 }}
        transition={springs.flick}
        onDragEnter={(event) => {
          event.preventDefault();
          depth.current += 1;
          if (depth.current === 1) setOver(true);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          depth.current = Math.max(0, depth.current - 1);
          if (depth.current === 0) setOver(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          depth.current = 0;
          setOver(false);
          ingest(event.dataTransfer?.files ?? null);
        }}
        className={cn(
          "relative flex flex-col items-center gap-3 rounded-3 px-6 py-7 text-center transition-colors",
          over ? "bg-cobalt-wash" : "bg-surface-1",
        )}
      >
        <svg
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-0 size-full transition-colors",
            rejection
              ? "text-destructive"
              : over
                ? "text-cobalt-bright"
                : "text-hairline-strong",
          )}
        >
          <motion.rect
            x={1}
            y={1}
            rx={9}
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            style={{
              width: "calc(100% - 2px)",
              height: "calc(100% - 2px)",
              strokeDasharray: dashPattern,
            }}
          />
        </svg>

        <p className="text-sm font-medium text-foreground">{label}</p>
        {limits && (
          <p id={hintId} className="text-xs text-muted-foreground">
            {limits}
          </p>
        )}

        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple={multiple}
          tabIndex={-1}
          className="hidden"
          onChange={(event) => {
            ingest(event.target.files);
            // Let the same file be chosen twice in a row.
            event.target.value = "";
          }}
        />
        <button
          type="button"
          aria-describedby={limits ? hintId : undefined}
          onClick={() => inputRef.current?.click()}
          className={cn(
            "inline-flex h-8 items-center rounded-2 border border-hairline-strong bg-surface-0 px-3 text-sm font-medium text-foreground transition-colors outline-none hover:bg-accent",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          )}
        >
          Choose {multiple ? "files" : "a file"}
        </button>
      </motion.div>

      <AnimatePresence initial={false}>
        {rejection && (
          <motion.p
            key={rejection.id}
            role="alert"
            initial={{ opacity: 0, y: motionSafe ? -distances.nudge : 0 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            transition={{ duration: durations.fast, ease: easings.enter }}
            className="flex items-center gap-2 text-xs text-destructive"
          >
            <span aria-hidden className="h-px w-3 shrink-0 bg-destructive" />
            {rejection.reason}
          </motion.p>
        )}
      </AnimatePresence>

      {files.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          <AnimatePresence initial={false}>
            {files.map((file) => {
              const key = fileKey(file);
              const raw = progress?.[key];
              const pct =
                typeof raw === "number"
                  ? Math.max(0, Math.min(1, raw))
                  : undefined;
              const done = pct !== undefined && pct >= 1;
              return (
                <motion.li
                  key={key}
                  layout={motionSafe}
                  initial={
                    motionSafe
                      ? { opacity: 0, y: distances.step }
                      : { opacity: 0 }
                  }
                  animate={{ opacity: 1, y: 0 }}
                  exit={{
                    opacity: 0,
                    transition: exitFor(durations.base),
                  }}
                  transition={motionSafe ? springs.glide : { duration: 0 }}
                  className="relative flex h-11 items-center gap-2 overflow-hidden rounded-2 border border-hairline bg-surface-1 px-3"
                >
                  {pct !== undefined && (
                    <span
                      role="progressbar"
                      aria-label={`${file.name} upload`}
                      aria-valuenow={Math.round(pct * 100)}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      className="absolute inset-0 overflow-hidden"
                    >
                      <motion.span
                        aria-hidden
                        className="absolute inset-y-0 left-0 block w-full origin-left bg-cobalt-wash"
                        initial={{ scaleX: 0 }}
                        animate={{ scaleX: pct, opacity: done ? 0 : 1 }}
                        transition={{
                          scaleX: {
                            duration: durations.base,
                            ease: easings.linear,
                          },
                          opacity: { duration: durations.slow },
                        }}
                      />
                    </span>
                  )}

                  <span className="relative min-w-0 flex-1 truncate text-sm text-foreground">
                    {file.name}
                  </span>

                  {done && (
                    <svg
                      viewBox="0 0 16 16"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden
                      className="relative size-3.5 shrink-0 text-success"
                    >
                      <motion.path
                        d="M3.5 8.4 6.6 11.5 12.5 4.8"
                        initial={{ pathLength: 0 }}
                        animate={{ pathLength: 1 }}
                        transition={
                          motionSafe ? springs.flick : { duration: 0 }
                        }
                      />
                    </svg>
                  )}

                  <motion.span
                    initial={
                      motionSafe
                        ? { scale: 1.3, opacity: 0 }
                        : { scale: 1, opacity: 0 }
                    }
                    animate={{ scale: 1, opacity: 1 }}
                    transition={
                      motionSafe ? springs.recoil : { duration: durations.fast }
                    }
                    className="relative shrink-0 font-mono text-[10px] tracking-[0.06em] text-muted-foreground tabular-nums"
                  >
                    {formatSize(file.size)}
                  </motion.span>

                  <button
                    type="button"
                    aria-label={`Remove ${file.name}`}
                    onClick={() =>
                      publish(files.filter((held) => fileKey(held) !== key))
                    }
                    className={cn(
                      "relative flex size-7 shrink-0 items-center justify-center rounded-2 text-muted-foreground transition-colors outline-none hover:text-foreground",
                      "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                    )}
                  >
                    <svg
                      viewBox="0 0 16 16"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={1.5}
                      strokeLinecap="round"
                      aria-hidden
                      className="size-3.5 shrink-0"
                    >
                      <path d="M4 4 12 12M12 4 4 12" />
                    </svg>
                  </button>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      )}

      <span role="status" className="sr-only">
        {files.length === 0
          ? "No files"
          : `${files.length} ${files.length === 1 ? "file" : "files"} ready`}
      </span>
    </div>
  );
}
