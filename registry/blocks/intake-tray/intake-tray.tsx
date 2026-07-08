"use client";

import * as React from "react";

import { FileText, Upload } from "lucide-react";
import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useTransform,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, exitFor, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type IntakeTrayHandle = {
  /** Programmatically drop files into the tray (same path as drag/browse). */
  addFiles: (files: File[]) => void;
};

export type IntakeTrayProps = {
  /** Receives every accepted batch — wire real uploads here. */
  onFiles?: (files: File[]) => void;
  /** Passed to the hidden file input and echoed in the drop-zone hint. */
  accept?: string;
  /** Maximum chips in the tray at once; extra files in a batch are ignored. */
  maxFiles?: number;
  /**
   * When true (default) each file runs a simulated 1.5–3s upload whose
   * duration — and pass/fail outcome — derive from a hash of its name. Set
   * false to only visualize arrival and drive real uploads yourself via
   * `onFiles`, marking completion in your own UI.
   */
  simulate?: boolean;
  className?: string;
  /** Imperative handle exposing `addFiles` for toolbar/demo triggers. */
  ref?: React.Ref<IntakeTrayHandle>;
};

type TrayFile = {
  id: number;
  name: string;
  /** ±3°, derived from the name hash so server and client agree. */
  rotation: number;
  /** Simulated upload duration in seconds (1.5–3). */
  duration: number;
  fails: boolean;
  status: "processing" | "ejecting" | "done";
};

/** djb2 — deterministic per name, so landings replay identically on SSR. */
const hashName = (name: string): number => {
  let hash = 5381;
  for (let i = 0; i < name.length; i += 1) {
    hash = (Math.imul(hash, 33) + name.charCodeAt(i)) | 0;
  }
  return hash >>> 0;
};

type TrayChipProps = {
  item: TrayFile;
  index: number;
  simulate: boolean;
  motionSafe: boolean;
  onSettled: (item: TrayFile) => void;
};

function TrayChip({ item, index, simulate, motionSafe, onSettled }: TrayChipProps) {
  const progress = useMotionValue(0);
  const dashOffset = useTransform(progress, [0, 1], [1, 0]);
  const [percent, setPercent] = React.useState(0);

  useMotionValueEvent(progress, "change", (value) => {
    const rounded = Math.round(value * 20) * 5;
    setPercent((prev) => (prev === rounded ? prev : rounded));
  });

  // Progress is feedback, not flourish — it fills under reduced motion too.
  React.useEffect(() => {
    if (!simulate || item.status !== "processing") return;
    const controls = animate(progress, 1, {
      duration: item.duration,
      ease: "linear",
      onComplete: () => onSettled(item),
    });
    return () => controls.stop();
  }, [simulate, item, progress, onSettled]);

  const ejectRotate = item.rotation >= 0 ? 8 : -8;
  const shingleX = index * 8;

  return (
    <motion.li
      layoutId={motionSafe ? `intake-chip-${item.id}` : undefined}
      style={motionSafe ? { zIndex: index + 1 } : undefined}
      className={cn(
        "border-border bg-card flex items-center gap-2 rounded-2 border px-2.5 py-2",
        motionSafe && "absolute top-0 left-0 w-56 max-w-full",
      )}
      initial={
        motionSafe
          ? { opacity: 0, x: shingleX, y: -32, rotate: 0 }
          : { opacity: 0 }
      }
      animate={
        !motionSafe
          ? { opacity: 1 }
          : item.status === "ejecting"
            ? { opacity: 1, x: shingleX, y: -20, rotate: ejectRotate }
            : {
                opacity: 1,
                x: shingleX,
                y: 0,
                rotate: item.rotation,
                scaleY: [0.94, 1],
              }
      }
      exit={
        !motionSafe
          ? { opacity: 0, transition: exitFor(durations.base) }
          : item.status === "ejecting"
            ? {
                opacity: 0,
                y: 32,
                rotate: ejectRotate * 1.5,
                transition: exitFor(durations.base),
              }
            : { opacity: 0, transition: exitFor(durations.fast) }
      }
      transition={
        item.status === "ejecting"
          ? {
              ...springs.snap,
              opacity: { duration: durations.fast, ease: easings.enter },
            }
          : {
              x: springs.glide,
              y: springs.recoil,
              rotate: springs.recoil,
              scaleY: { ...springs.flick, delay: 0.16 },
              opacity: { duration: durations.fast, ease: easings.enter },
            }
      }
    >
      <FileText aria-hidden className="text-muted-foreground size-3.5 shrink-0" />
      <span className="min-w-0 flex-1 truncate font-mono text-xs">
        {item.name}
      </span>
      {item.status === "ejecting" ? (
        <span className="text-destructive shrink-0 font-mono text-[9px] font-medium tracking-[0.08em] uppercase">
          Rejected · Format
        </span>
      ) : (
        <span
          role="progressbar"
          aria-label={`${item.name} upload progress`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          className="shrink-0"
        >
          <svg viewBox="0 0 16 16" aria-hidden className="size-4 -rotate-90">
            <circle
              cx="8"
              cy="8"
              r="6.5"
              fill="none"
              stroke="currentColor"
              strokeOpacity="0.2"
              strokeWidth="2"
            />
            <motion.circle
              cx="8"
              cy="8"
              r="6.5"
              fill="none"
              stroke="var(--signal, var(--primary))"
              strokeWidth="2"
              strokeLinecap="round"
              pathLength={1}
              strokeDasharray="1 1"
              style={{ strokeDashoffset: dashOffset }}
            />
          </svg>
        </span>
      )}
    </motion.li>
  );
}

/**
 * Files land, physically. Dropped or browsed files fall into the tray on
 * `recoil` with an impact squash, landing slightly rotated and shingled 8px
 * apart. Each chip's gauge ring fills over a simulated upload; completions
 * un-rotate and glide down to the PROCESSED rail (shared `layoutId`), while
 * failures eject upward on `snap` and fall away with `exitFor`. Reduced
 * motion stacks chips neatly with fades — rings still fill.
 */
export function IntakeTray({
  onFiles,
  accept,
  maxFiles = 6,
  simulate = true,
  className,
  ref,
}: IntakeTrayProps) {
  const motionSafe = useMotionSafe();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const idRef = React.useRef(0);
  const ejectTimers = React.useRef(new Map<number, number>());
  const [items, setItems] = React.useState<TrayFile[]>([]);
  const [dragging, setDragging] = React.useState(false);
  const [announcement, setAnnouncement] = React.useState("");
  const hintId = React.useId();
  const railLabelId = React.useId();

  React.useEffect(() => {
    const timers = ejectTimers.current;
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, []);

  const addFiles = React.useCallback(
    (files: File[]) => {
      if (files.length === 0) return;
      onFiles?.(files);
      const stamped = files.map((file) => {
        idRef.current += 1;
        return { name: file.name, id: idRef.current };
      });
      setItems((prev) => {
        const room = Math.max(
          0,
          maxFiles - prev.filter((it) => it.status !== "done").length,
        );
        return [
          ...prev,
          ...stamped.slice(0, room).map(({ name, id }) => {
            const hash = hashName(name);
            return {
              id,
              name,
              rotation: (hash % 61) / 10 - 3,
              duration: 1.5 + (hash % 1501) / 1000,
              fails: hash % 5 === 0,
              status: "processing" as const,
            };
          }),
        ];
      });
    },
    [maxFiles, onFiles],
  );

  React.useImperativeHandle(ref, () => ({ addFiles }), [addFiles]);

  const handleSettled = React.useCallback((item: TrayFile) => {
    if (item.fails) {
      setItems((prev) =>
        prev.map((it) =>
          it.id === item.id ? { ...it, status: "ejecting" as const } : it,
        ),
      );
      setAnnouncement(`${item.name} rejected — unsupported format.`);
      const timer = window.setTimeout(() => {
        setItems((prev) => prev.filter((it) => it.id !== item.id));
        ejectTimers.current.delete(item.id);
      }, 900);
      ejectTimers.current.set(item.id, timer);
    } else {
      setItems((prev) =>
        prev.map((it) =>
          it.id === item.id ? { ...it, status: "done" as const } : it,
        ),
      );
      setAnnouncement(`${item.name} processed.`);
    }
  }, []);

  const pending = items.filter((item) => item.status !== "done");
  const done = items.filter((item) => item.status === "done");

  return (
    <div className={cn("w-full max-w-md", className)}>
      <motion.div
        animate={motionSafe ? { scale: dragging ? 1.01 : 1 } : undefined}
        transition={springs.drift}
        className="rounded-3"
      >
        <button
          type="button"
          aria-describedby={hintId}
          onClick={() => inputRef.current?.click()}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragEnter={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
              setDragging(false);
            }
          }}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            addFiles(Array.from(event.dataTransfer.files));
          }}
          className={cn(
            "relative flex min-h-32 w-full flex-col items-center justify-center gap-2 overflow-hidden rounded-3 border border-dashed transition-colors",
            dragging ? "border-primary bg-primary/5" : "border-input hover:bg-accent",
          )}
        >
          {dragging && motionSafe && (
            <motion.span
              aria-hidden
              className="pointer-events-none absolute inset-0"
              style={{
                backgroundImage:
                  "repeating-linear-gradient(90deg, color-mix(in oklab, var(--primary) 8%, transparent) 0px, color-mix(in oklab, var(--primary) 8%, transparent) 8px, transparent 8px, transparent 16px)",
              }}
              animate={{ backgroundPosition: ["0px 0px", "32px 0px"] }}
              transition={{ duration: 0.8, ease: easings.linear, repeat: Infinity }}
            />
          )}
          <Upload aria-hidden className="text-muted-foreground size-4" />
          <span className="text-muted-foreground font-mono text-[11px] font-medium tracking-[0.08em] uppercase">
            Drop samples · or click to browse
          </span>
          <span
            id={hintId}
            className="text-muted-foreground/70 font-mono text-[10px]"
          >
            Accepts {accept ?? "any file type"} · up to {maxFiles} at a time
          </span>
        </button>
      </motion.div>

      <input
        ref={inputRef}
        type="file"
        multiple
        accept={accept}
        tabIndex={-1}
        aria-label="Choose files to upload"
        className="sr-only"
        onChange={(event) => {
          addFiles(Array.from(event.target.files ?? []));
          event.target.value = "";
        }}
      />

      <ul
        aria-label="Incoming files"
        className={
          motionSafe ? "relative mt-4 h-12" : "mt-4 flex min-h-12 flex-col gap-1.5"
        }
      >
        <AnimatePresence>
          {pending.map((item, index) => (
            <TrayChip
              key={item.id}
              item={item}
              index={index}
              simulate={simulate}
              motionSafe={motionSafe}
              onSettled={handleSettled}
            />
          ))}
        </AnimatePresence>
      </ul>

      <div className="border-border mt-4 border-t pt-2">
        <p
          id={railLabelId}
          className="text-muted-foreground font-mono text-[10px] font-medium tracking-[0.08em] uppercase"
        >
          Processed
        </p>
        <ul
          aria-labelledby={railLabelId}
          className="mt-1.5 flex min-h-7 flex-wrap gap-1.5"
        >
          {done.map((item) => (
            <motion.li
              key={item.id}
              layoutId={motionSafe ? `intake-chip-${item.id}` : undefined}
              initial={motionSafe ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={
                motionSafe
                  ? springs.glide
                  : { duration: durations.fast, ease: easings.enter }
              }
              className="border-success/40 bg-success/10 text-success flex items-center gap-1.5 rounded-2 border px-2 py-1"
            >
              <svg viewBox="0 0 12 12" aria-hidden className="size-3 shrink-0">
                <motion.path
                  d="M2.5 6.5 L5 9 L9.5 3.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  initial={motionSafe ? { pathLength: 0 } : false}
                  animate={{ pathLength: 1 }}
                  transition={
                    motionSafe ? { ...springs.flick, delay: 0.25 } : { duration: 0 }
                  }
                />
              </svg>
              <span className="font-mono text-[11px]">{item.name}</span>
            </motion.li>
          ))}
        </ul>
      </div>

      <span role="status" className="sr-only">
        {announcement}
      </span>
    </div>
  );
}
