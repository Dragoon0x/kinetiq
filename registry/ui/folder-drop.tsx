"use client";

import * as React from "react";

import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
  type Easing,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade,
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type FolderDropAccept = "images" | "docs" | "any";
export type FolderDropColor = "manila" | "blue" | "kraft";

export type FolderDropItem = {
  id: string;
  name: string;
  /** Size in bytes. */
  size: number;
  /** MIME type, when known. */
  type?: string;
  /** Upload progress the host reports, 0 to 1. Leave it out when nothing uploads. */
  progress?: number;
  /** The file itself, when it came from the visitor. */
  file?: File;
};

export type FolderDropRejection = { name: string; reason: string };

export type FolderDropProps = {
  /** Controlled list of files in the folder. */
  value?: FolderDropItem[];
  /** Initial files when uncontrolled. @default [] */
  defaultValue?: FolderDropItem[];
  /** Fires from the drop, pick or removal that changed the list. */
  onValueChange?: (items: FolderDropItem[]) => void;
  /** Files that bounced off, with the reason for each. */
  onReject?: (rejections: FolderDropRejection[]) => void;
  /** The field's visible label. */
  label: string;
  /** Form field name for the real file input. */
  name?: string;
  /** Guidance under the folder. @default what it takes and how large */
  hint?: string;
  /** An error from the host; shown and announced once. */
  error?: string;
  /** The form needs at least one file. @default false */
  required?: boolean;
  disabled?: boolean;
  /** The largest file it takes, in MB. @default 10 */
  maxSize?: number;
  /** Which files it takes. @default "any" */
  accept?: FolderDropAccept;
  /** The folder's colour. @default "manila" */
  folder?: FolderDropColor;
  /** How many files the folder holds. @default 8 */
  maxFiles?: number;
  /** Play the folder. Off unless asked for. @default false */
  sound?: boolean;
  className?: string;
};

type SheetKind = "in" | "up" | "bounce";
type Sheet = {
  id: string;
  kind: SheetKind;
  x: number;
  rot: number;
  dir: number;
  delay: number;
  picture: boolean;
};
type Bounced = { id: string; name: string; reason: string };
type Flags = {
  hover: boolean;
  focus: boolean;
  drag: boolean;
  receiving: boolean;
};

/** The drawing's box, in px; every sheet falls and tumbles inside it. */
const W = 132;
const H = 120;
const FRONT_TOP = 50;
const FRONT_DROP = 18;
const SPREAD = 5;
const SHEET_W = 34;
const FALL = 0.44;
const BOUNCE = 0.85;
const MB = 1024 * 1024;
/** A bounce: down onto the edge, up off it, down and away. */
const BOUNCE_EASE: Easing[] = ["easeIn", "easeOut", "easeIn"];

const r2 = (v: number) => Math.round(v * 100) / 100;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

/** Folders are paper: fixed pigments, the same in either theme. */
const FOLDERS: Record<FolderDropColor, string> = {
  manila: "oklch(0.86 0.075 85)",
  blue: "oklch(0.68 0.1 245)",
  kraft: "oklch(0.67 0.075 62)",
};
const PAPER = "oklch(0.985 0.004 95)";
const PAPER_EDGE = "oklch(0.78 0.012 90)";
const PAPER_LINE = "oklch(0.84 0.01 90)";
const PLATE_INK = "oklch(0.34 0.02 70)";

const DOC_EXT =
  /\.(pdf|docx?|odt|rtf|txt|md|csv|xlsx?|ods|pptx?|odp|pages|numbers|key)$/i;
const IMAGE_EXT = /\.(jpe?g|png|gif|webp|avif|heic|heif|svg|tiff?|bmp)$/i;

const RULES: Record<
  FolderDropAccept,
  { input?: string; noun: string; hint: string; test: (f: File) => boolean }
> = {
  images: {
    input: "image/*",
    noun: "an image",
    hint: "Images",
    test: (f) => f.type.startsWith("image/") || IMAGE_EXT.test(f.name),
  },
  docs: {
    input:
      ".pdf,.doc,.docx,.odt,.rtf,.txt,.md,.csv,.xls,.xlsx,.ods,.ppt,.pptx,.odp",
    noun: "a document",
    hint: "PDFs and documents",
    test: (f) =>
      DOC_EXT.test(f.name) ||
      f.type === "application/pdf" ||
      f.type.startsWith("text/"),
  },
  any: { noun: "a file", hint: "Any file", test: () => true },
};

const formatSize = (bytes: number) =>
  bytes < 1024
    ? `${bytes} B`
    : bytes < MB
      ? `${Math.round(bytes / 1024)} KB`
      : `${(bytes / MB).toFixed(1)} MB`;

const extOf = (item: { name: string; type?: string }) => {
  const m = /\.([a-z0-9]{1,5})$/i.exec(item.name);
  return (m?.[1] ?? item.type?.split("/")[1] ?? "file")
    .slice(0, 4)
    .toUpperCase();
};

const isPicture = (item: { name: string; type?: string }) =>
  Boolean(item.type?.startsWith("image/")) || IMAGE_EXT.test(item.name);

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}

/** The front flap at an opening: its top edge drops and spreads toward you. */
function frontPath(o: number): string {
  const k = clamp(o, -0.15, 1.15);
  const top = r2(FRONT_TOP + FRONT_DROP * k);
  const left = r2(8 - SPREAD * k);
  const right = r2(124 + SPREAD * k);
  return [
    `M ${left} ${r2(top + 4)}`,
    `Q ${left} ${top} ${r2(left + 4)} ${top}`,
    `H ${r2(right - 4)}`,
    `Q ${right} ${top} ${right} ${r2(top + 4)}`,
    "L 124 110 Q 124 116 118 116 H 14 Q 8 116 8 110 Z",
  ].join(" ");
}

const BACK =
  "M 8 110 V 28 Q 8 22 14 22 H 48 Q 52 22 54.5 25 L 59 30 H 118 Q 124 30 124 36 V 110 Q 124 116 118 116 H 14 Q 8 116 8 110 Z";

function SheetArt({ picture, bad }: { picture: boolean; bad?: boolean }) {
  return (
    <>
      <path
        d="M 0 2 Q 0 0 2 0 H 24 L 34 10 V 40 Q 34 42 32 42 H 2 Q 0 42 0 40 Z"
        strokeWidth={0.75}
        style={{ fill: PAPER, stroke: PAPER_EDGE }}
      />
      <path
        d="M 24 0 V 8 Q 24 10 26 10 H 34"
        fill="none"
        strokeWidth={0.75}
        style={{ stroke: PAPER_EDGE }}
      />
      {picture ? (
        <>
          <rect
            x={5}
            y={14}
            width={24}
            height={18}
            rx={1}
            style={{ fill: "oklch(0.86 0.04 230)" }}
          />
          <path
            d="M 5 32 L 13 22 L 19 28 L 23 24 L 29 32 Z"
            style={{ fill: "oklch(0.62 0.07 160)" }}
          />
          <circle cx={23} cy={18} r={2} style={{ fill: "oklch(0.9 0.1 90)" }} />
        </>
      ) : (
        <path
          d="M 5 16 H 26 M 5 21 H 29 M 5 26 H 22 M 5 31 H 27"
          strokeWidth={1.5}
          strokeLinecap="round"
          style={{ stroke: PAPER_LINE }}
        />
      )}
      {bad ? (
        <path
          d="M 23 29 L 30 36 M 30 29 L 23 36"
          strokeWidth={2}
          strokeLinecap="round"
          className="stroke-danger"
        />
      ) : null}
    </>
  );
}

/** One sheet on its way in, out, or off the folder's edge. */
function FallingSheet({
  sheet,
  onDone,
}: {
  sheet: Sheet;
  onDone: (id: string) => void;
}) {
  const { x, rot, dir, delay, kind } = sheet;
  const frames =
    kind === "in"
      ? {
          initial: { x, y: -2, rotate: rot, opacity: 0 },
          animate: {
            x,
            y: [-2, 72],
            rotate: [rot, r2(rot * 0.3)],
            opacity: [0, 1, 1],
          },
          transition: {
            delay,
            duration: FALL,
            y: { delay, duration: FALL, ease: [0.5, 0, 0.9, 0.55] as const },
            rotate: { delay, duration: FALL, ease: easings.move },
            opacity: { delay, duration: FALL, times: [0, 0.22, 1] },
          },
        }
      : kind === "up"
        ? {
            initial: { x, y: 64, rotate: rot, opacity: 1 },
            animate: { x, y: -4, rotate: -rot, opacity: [1, 1, 0] },
            transition: {
              delay,
              duration: durations.slow,
              ease: easings.enter,
              opacity: {
                delay,
                duration: durations.slow,
                times: [0, 0.6, 1],
              },
            },
          }
        : {
            initial: { x, y: -2, rotate: rot, opacity: 0 },
            animate: {
              x: [x, x, r2(x + 12 * dir), r2(x + 26 * dir)],
              y: [-2, 8, -6, 40],
              rotate: [rot, rot, rot + 14 * dir, rot + 34 * dir],
              opacity: [0, 1, 1, 0],
            },
            transition: {
              delay,
              duration: BOUNCE,
              times: [0, 0.34, 0.55, 1],
              ease: BOUNCE_EASE,
            },
          };
  return (
    <motion.g
      initial={frames.initial}
      animate={frames.animate}
      transition={frames.transition}
      onAnimationComplete={() => onDone(sheet.id)}
      style={{ originX: 0.5, originY: 0.5 }}
    >
      <SheetArt picture={sheet.picture} bad={kind === "bounce"} />
    </motion.g>
  );
}

/** A 5px ribbon with a swallowtail end: the upload, settling on glide. */
function Ribbon({
  progress,
  motionSafe,
}: {
  progress: number;
  motionSafe: boolean;
}) {
  const p = clamp(progress, 0, 1);
  return (
    <span
      aria-hidden
      className="mt-1 block h-[5px] w-full overflow-clip rounded-full bg-hairline"
    >
      <motion.span
        className={cn(
          "block h-full transition-colors",
          p >= 1 ? "bg-success" : "bg-cobalt-bright",
        )}
        initial={false}
        animate={{ width: `${r2(p * 100)}%` }}
        transition={
          motionSafe
            ? springs.glide
            : { duration: durations.fast, ease: easings.enter }
        }
        style={{
          clipPath:
            "polygon(0 0, 100% 0, calc(100% - 3px) 50%, 100% 100%, 0 100%)",
        }}
      />
    </span>
  );
}

const CROSS = (
  <svg aria-hidden viewBox="0 0 16 16" className="size-3.5">
    <path
      d="M 4.5 4.5 L 11.5 11.5 M 11.5 4.5 L 4.5 11.5"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
    />
  </svg>
);

/**
 * A file field drawn as a paper folder. Dragging files over it opens the
 * folder's mouth — the front flap tips toward you on the snap spring, its top
 * edge dropping and spreading, the sheets inside lifting — and letting go
 * sends each accepted file in as a sheet of paper that falls into the mouth
 * behind the flap, one after another on `cascade`. When the last is in, the
 * flap shuts with a thud and the folder lands on the recoil spring. A file it
 * will not take (the wrong type, over `maxSize`, a duplicate, or one too many)
 * falls onto the shut edge, jumps and tumbles away, and is listed with the
 * reason.
 *
 * Beside the folder every file is a row with its size, its state and a
 * progress ribbon whose fill follows the host's `progress` on the glide
 * spring. A real file input sits behind the folder, which is a button: click,
 * Enter or Space open the system picker, and what is picked goes through the
 * same checks and the same fall. The input's files are rebuilt from the list
 * after every change, so a form submits what is shown. Under reduced motion
 * the flap swaps between shut and open and nothing falls; the rows and the
 * reasons still arrive and the ribbons still fill.
 */
export function FolderDrop({
  value,
  defaultValue,
  onValueChange,
  onReject,
  label,
  name,
  hint,
  error,
  required = false,
  disabled = false,
  maxSize = 10,
  accept = "any",
  folder = "manila",
  maxFiles = 8,
  sound = false,
  className,
}: FolderDropProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const labelId = `${uid}-label`;
  const actionId = `${uid}-action`;
  const hintId = `${uid}-hint`;
  const errorId = `${uid}-error`;
  const rule = RULES[accept] ?? RULES.any;
  const limitMb = Math.max(0.1, maxSize);
  const capacity = Math.max(1, Math.round(maxFiles));
  const base = FOLDERS[folder] ?? FOLDERS.manila;

  const [own, setOwn] = React.useState<FolderDropItem[]>(
    () => defaultValue ?? [],
  );
  const controlled = value !== undefined;
  const items = value ?? own;

  const [bounced, setBounced] = React.useState<Bounced[]>([]);
  const [sheets, setSheets] = React.useState<Sheet[]>([]);
  const [dragOver, setDragOver] = React.useState(false);
  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const [filed, setFiled] = React.useState<ReadonlySet<string>>(
    () => new Set(items.filter((i) => (i.progress ?? 0) >= 1).map((i) => i.id)),
  );
  const [shown] = React.useState(() => new Set(items.map((i) => i.id)));

  // An upload the host has finished is said once, in the render it lands.
  const landed = items.filter(
    (i) => i.progress !== undefined && i.progress >= 1 && !filed.has(i.id),
  );
  if (landed.length) {
    setFiled(new Set([...filed, ...landed.map((i) => i.id)]));
    setSaid((s) => ({
      n: s.n + 1,
      text: `${landed.map((i) => i.name).join(", ")} filed.`,
    }));
  }

  // A host error is said once, in the render it appears.
  const [voiced, setVoiced] = React.useState(error);
  if (voiced !== error) {
    setVoiced(error);
    if (error) setSaid((v) => ({ n: v.n + 1, text: error }));
  }

  const open = useMotionValue(0);
  const squash = useMotionValue(1);

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const buttonRef = React.useRef<HTMLButtonElement | null>(null);
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const removers = React.useRef(new Map<string, HTMLButtonElement>());
  const flags = React.useRef<Flags>({
    hover: false,
    focus: false,
    drag: false,
    receiving: false,
  });
  const depth = React.useRef(0);
  const counter = React.useRef(0);
  const anims = React.useRef(new Map<string, AnimationPlaybackControls>());
  const timers = React.useRef<number[]>([]);
  const api = React.useRef<{
    play: (
      accepted: FolderDropItem[],
      rejected: Bounced[],
      clientX: number | undefined,
      silent: boolean,
    ) => void;
  } | null>(null);

  const run = (key: string, controls: AnimationPlaybackControls) => {
    anims.current.get(key)?.stop();
    anims.current.set(key, controls);
  };
  const later = (ms: number, fn: () => void) => {
    timers.current.push(window.setTimeout(fn, Math.round(ms)));
  };

  /** Where the flap should be, from what is going on around it. */
  const aim = () => {
    const f = flags.current;
    const target = f.receiving || f.drag ? 1 : f.hover || f.focus ? 0.18 : 0;
    if (!motionSafe) {
      anims.current.get("open")?.stop();
      open.set(target === 0.18 ? 0 : target);
      return;
    }
    run("open", animate(open, target, springs.snap));
  };

  const pan = () => {
    const b = buttonRef.current?.getBoundingClientRect();
    return b ? panFrom(b.left + b.width / 2, null) : 0;
  };

  const syncInput = (list: readonly FolderDropItem[]) => {
    const input = inputRef.current;
    if (!input) return;
    try {
      const dt = new DataTransfer();
      for (const it of list) if (it.file) dt.items.add(it.file);
      input.files = dt.files;
    } catch {
      // No DataTransfer constructor: the list is still reported to the host.
    }
  };

  /** Sheets fall in (and bounce off); the flap opens for them, then shuts. */
  const play = (
    accepted: FolderDropItem[],
    rejected: Bounced[],
    clientX: number | undefined,
    silent: boolean,
  ) => {
    const b = buttonRef.current?.getBoundingClientRect();
    const aimX =
      clientX !== undefined && b && b.width > 0
        ? ((clientX - b.left) / b.width) * W - SHEET_W / 2
        : W / 2 - SHEET_W / 2 - 4;
    if (!motionSafe) {
      // Nothing falls: the flap simply shuts, and the voices still answer.
      aim();
      if (!silent && accepted.length)
        audio.play("thud", { gain: 0.5, pan: pan() });
      if (!silent && rejected.length)
        audio.play("shrug", { gain: 0.45, pan: pan() });
      return;
    }
    const step = cascade(Math.max(2, accepted.length));
    const ins = accepted.slice(0, 6).map((a, j): Sheet => {
      const h = hash(a.id);
      return {
        id: `${a.id}-in`,
        kind: "in",
        x: r2(clamp(aimX + ((h % 17) - 8), 22, W - 22 - SHEET_W)),
        rot: ((h >>> 5) % 13) - 6,
        dir: 1,
        delay: r2(j * step),
        picture: isPicture(a),
      };
    });
    const lastLand = ins.length ? (ins.length - 1) * step + FALL : 0;
    const outs = rejected.slice(0, 3).map((r, k): Sheet => {
      const h = hash(r.id);
      const x = r2(clamp(aimX + ((h % 13) - 6), 22, W - 22 - SHEET_W));
      return {
        id: `${r.id}-bounce`,
        kind: "bounce",
        x,
        rot: ((h >>> 5) % 9) - 4,
        dir: x < W / 2 - SHEET_W / 2 ? 1 : -1,
        delay: r2(Math.max(0, lastLand - 0.12) + k * 0.14),
        picture: IMAGE_EXT.test(r.name),
      };
    });
    setSheets((s) => [...s, ...ins, ...outs]);
    if (ins.length) {
      flags.current.receiving = true;
      aim();
      if (!silent)
        later(120, () => audio.play("swish", { gain: 0.4, pan: pan() }));
      later(lastLand * 1000, () => {
        flags.current.receiving = false;
        aim();
        squash.set(0.96);
        run("squash", animate(squash, 1, springs.recoil));
        if (!silent) audio.play("thud", { gain: 0.55, pan: pan() });
      });
    } else {
      aim();
    }
    if (!silent) {
      for (const o of outs) {
        later((o.delay + BOUNCE * 0.34) * 1000, () =>
          audio.play("shrug", { gain: 0.45, pan: pan() }),
        );
      }
    }
  };

  const same = (item: FolderDropItem, f: File) =>
    item.name === f.name &&
    item.size === f.size &&
    (!item.file || item.file.lastModified === f.lastModified);

  /** Every file the visitor hands over, checked, filed or bounced. */
  const ingest = (files: File[], clientX?: number) => {
    if (disabled || files.length === 0) {
      aim();
      return;
    }
    const accepted: FolderDropItem[] = [];
    const rejected: Bounced[] = [];
    let room = capacity - items.length;
    for (const f of files) {
      counter.current += 1;
      const id = `${uid}-${counter.current}`;
      let reason = "";
      if (!rule.test(f)) reason = `Not ${rule.noun}.`;
      else if (f.size > limitMb * MB)
        reason = `${formatSize(f.size)}, over the ${limitMb} MB limit.`;
      else if (
        items.some((i) => same(i, f)) ||
        accepted.some((i) => same(i, f))
      )
        reason = "Already in the folder.";
      else if (room <= 0)
        reason = `The folder holds ${plural(capacity, "file", "files")}.`;
      if (reason) {
        rejected.push({ id, name: f.name, reason });
      } else {
        accepted.push({
          id,
          name: f.name,
          size: f.size,
          type: f.type || undefined,
          file: f,
        });
        room -= 1;
      }
    }
    const next = accepted.length ? [...items, ...accepted] : items;
    for (const a of accepted) shown.add(a.id);
    setBounced(rejected);
    if (accepted.length) {
      if (!controlled) setOwn(next);
      onValueChange?.(next);
    }
    if (rejected.length)
      onReject?.(rejected.map(({ name: n, reason }) => ({ name: n, reason })));
    syncInput(next);
    const parts = [
      accepted.length
        ? `${plural(accepted.length, "file", "files")} added.`
        : "",
      ...rejected.map(
        (r) =>
          `${r.name} bounced: ${r.reason.charAt(0).toLowerCase()}${r.reason.slice(1)}`,
      ),
    ].filter(Boolean);
    setSaid((s) => ({ n: s.n + 1, text: parts.join(" ") }));
    play(accepted, rejected, clientX, false);
  };

  const focusAfter = (list: readonly { id: string }[], index: number) => {
    const next = list[index] ?? list[index - 1];
    const node = next ? removers.current.get(next.id) : undefined;
    if (node) node.focus();
    else buttonRef.current?.focus();
  };

  const remove = (id: string) => {
    const index = items.findIndex((i) => i.id === id);
    const item = items[index];
    if (!item || disabled) return;
    const next = items.filter((i) => i.id !== id);
    shown.delete(id);
    if (!controlled) setOwn(next);
    onValueChange?.(next);
    syncInput(next);
    setSaid((s) => ({ n: s.n + 1, text: `${item.name} removed.` }));
    audio.play("swish", { pitch: 0.8, gain: 0.3, pan: pan() });
    if (motionSafe) {
      setSheets((s) => [
        ...s,
        {
          id: `${id}-up`,
          kind: "up",
          x: 49,
          rot: 3,
          dir: 1,
          delay: 0,
          picture: isPicture(item),
        },
      ]);
    }
    focusAfter([...next, ...bounced], index);
  };

  const dismiss = (id: string) => {
    const index = bounced.findIndex((b) => b.id === id);
    const rest = bounced.filter((b) => b.id !== id);
    setBounced(rest);
    focusAfter([...items, ...rest], items.length + index);
  };

  const sheetDone = React.useCallback((id: string) => {
    setSheets((s) => s.filter((x) => x.id !== id));
  }, []);

  React.useEffect(() => {
    api.current = { play };
  });

  // Files the host adds on its own fall in the same way, silently; the
  // input follows whatever the list now is.
  React.useEffect(() => {
    const fresh = items.filter((i) => !shown.has(i.id));
    for (const i of items) shown.add(i.id);
    for (const id of [...shown]) {
      if (!items.some((i) => i.id === id)) shown.delete(id);
    }
    if (fresh.length) api.current?.play(fresh, [], undefined, true);
    const input = inputRef.current;
    if (!input) return;
    try {
      const dt = new DataTransfer();
      for (const it of items) if (it.file) dt.items.add(it.file);
      input.files = dt.files;
    } catch {
      // No DataTransfer constructor: nothing to mirror.
    }
  }, [items, shown]);

  React.useEffect(() => {
    if (!disabled) return;
    flags.current = {
      hover: false,
      focus: false,
      drag: false,
      receiving: false,
    };
    depth.current = 0;
    open.set(0);
  }, [disabled, open]);

  React.useEffect(() => {
    const running = anims.current;
    const pending = timers.current;
    return () => {
      for (const c of running.values()) c.stop();
      running.clear();
      for (const t of pending) window.clearTimeout(t);
      pending.length = 0;
    };
  }, []);

  const front = useTransform(open, frontPath);
  const frontTop = useTransform(open, (o) =>
    r2(FRONT_TOP + FRONT_DROP * clamp(o, -0.15, 1.15)),
  );
  const edgeLine = useTransform(open, (o) => {
    const k = clamp(o, -0.15, 1.15);
    const top = r2(FRONT_TOP + FRONT_DROP * k + 1.2);
    return `M ${r2(12 - SPREAD * k)} ${top} H ${r2(120 + SPREAD * k)}`;
  });
  const plateY = useTransform(frontTop, (t) => r2(t + 13));
  const plateH = useTransform(open, (o) =>
    r2(16 * (1 - 0.22 * clamp(o, 0, 1))),
  );
  const plateText = useTransform(
    [plateY, plateH] as MotionValue<number>[],
    ([y, h]: number[]) => r2((y ?? 0) + (h ?? 0) / 2 + 3),
  );
  const papersY = useTransform(open, (o) => r2(-4 * clamp(o, 0, 1.1)));

  const inFlight = sheets.filter((s) => s.kind === "in").length;
  const papers = Math.min(3, Math.max(0, items.length - inFlight));
  const shownHint = hint ?? `${rule.hint} up to ${limitMb} MB.`;
  const hasRows = items.length > 0 || bounced.length > 0;

  return (
    <div
      ref={rootRef}
      onDragEnter={(event) => {
        if (disabled || !event.dataTransfer.types.includes("Files")) return;
        event.preventDefault();
        depth.current += 1;
        if (depth.current === 1) {
          flags.current.drag = true;
          setDragOver(true);
          aim();
        }
      }}
      onDragOver={(event) => {
        if (disabled || !event.dataTransfer.types.includes("Files")) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
      }}
      onDragLeave={(event) => {
        if (!event.dataTransfer.types.includes("Files")) return;
        depth.current = Math.max(0, depth.current - 1);
        if (depth.current === 0) {
          flags.current.drag = false;
          setDragOver(false);
          aim();
        }
      }}
      onDrop={(event) => {
        if (!event.dataTransfer.types.includes("Files")) return;
        event.preventDefault();
        depth.current = 0;
        flags.current.drag = false;
        setDragOver(false);
        if (disabled) {
          aim();
          return;
        }
        ingest(Array.from(event.dataTransfer.files), event.clientX);
      }}
      className={cn(
        "flex w-full max-w-sm flex-col gap-2",
        disabled && "opacity-50",
        className,
      )}
    >
      <div className="flex h-5 items-center justify-between gap-3">
        <span
          id={labelId}
          className="truncate text-sm font-medium text-foreground"
        >
          {label}
          {required ? (
            <span className="font-normal text-ink-3"> (required)</span>
          ) : null}
        </span>
        <span className="shrink-0 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase tabular-nums">
          {plural(items.length, "file", "files")}
        </span>
      </div>
      <span id={actionId} className="sr-only">
        Choose files
      </span>

      <div className="flex items-start gap-3">
        <div className="relative shrink-0">
          <button
            ref={buttonRef}
            type="button"
            disabled={disabled}
            aria-labelledby={`${labelId} ${actionId}`}
            aria-describedby={
              [hintId, error ? errorId : null].filter(Boolean).join(" ") ||
              undefined
            }
            onClick={() => inputRef.current?.click()}
            onPointerEnter={(event) => {
              if (event.pointerType !== "mouse") return;
              flags.current.hover = true;
              aim();
            }}
            onPointerLeave={(event) => {
              if (event.pointerType !== "mouse") return;
              flags.current.hover = false;
              aim();
            }}
            onFocus={(event) => {
              flags.current.focus =
                event.currentTarget.matches(":focus-visible");
              aim();
            }}
            onBlur={() => {
              flags.current.focus = false;
              aim();
            }}
            className={cn(
              "block rounded-3 outline-none",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
              disabled ? "cursor-not-allowed" : "cursor-pointer",
            )}
          >
            <svg
              aria-hidden
              width={W}
              height={H}
              viewBox={`0 0 ${W} ${H}`}
              className="block"
              // Colours live on the plain svg as variables: motion keeps an
              // SVG element's first style, so a new folder would not reach it.
              style={
                {
                  "--folder": base,
                  "--folder-back": `color-mix(in oklab, ${base} 84%, black)`,
                  "--folder-inside": `color-mix(in oklab, ${base} 50%, black)`,
                  "--folder-edge": `color-mix(in oklab, ${base} 60%, black)`,
                  "--folder-light": `color-mix(in oklab, ${base} 55%, white)`,
                } as React.CSSProperties
              }
            >
              <motion.g style={{ scaleY: squash, originX: 0.5, originY: 1 }}>
                <rect width={W} height={H} fill="none" />
                <path
                  d={BACK}
                  strokeWidth={1}
                  style={{
                    fill: "var(--folder-back)",
                    stroke: "var(--folder-edge)",
                  }}
                />
                <rect
                  x={12}
                  y={34}
                  width={108}
                  height={78}
                  rx={3}
                  style={{ fill: "var(--folder-inside)" }}
                />
                <motion.g style={{ y: papersY }}>
                  {Array.from({ length: papers }, (_, k) => (
                    <rect
                      key={k}
                      x={18 + k * 4}
                      y={36 + k * 3}
                      width={92 - k * 6}
                      height={70}
                      rx={2}
                      strokeWidth={0.75}
                      transform={`rotate(${[-1.5, 1.2, -0.6][k] ?? 0} 66 70)`}
                      style={{ fill: PAPER, stroke: PAPER_EDGE }}
                    />
                  ))}
                </motion.g>
                {sheets
                  .filter((s) => s.kind !== "bounce")
                  .map((s) => (
                    <FallingSheet key={s.id} sheet={s} onDone={sheetDone} />
                  ))}
                <motion.path
                  d={front}
                  strokeWidth={1}
                  style={{
                    fill: "var(--folder)",
                    stroke: "var(--folder-edge)",
                  }}
                />
                <motion.path
                  d={edgeLine}
                  fill="none"
                  strokeWidth={1}
                  strokeLinecap="round"
                  style={{ stroke: "var(--folder-light)" }}
                />
                <motion.rect
                  x={46}
                  y={plateY}
                  width={40}
                  height={plateH}
                  rx={2}
                  strokeWidth={0.75}
                  style={{ fill: PAPER, stroke: "var(--folder-edge)" }}
                />
                <motion.text
                  x={66}
                  y={plateText}
                  textAnchor="middle"
                  fontSize={9}
                  className="font-mono"
                  style={{ fill: PLATE_INK }}
                >
                  {items.length}
                </motion.text>
              </motion.g>
              {sheets
                .filter((s) => s.kind === "bounce")
                .map((s) => (
                  <FallingSheet key={s.id} sheet={s} onDone={sheetDone} />
                ))}
            </svg>
          </button>
          <input
            ref={inputRef}
            type="file"
            name={name}
            multiple
            accept={rule.input}
            required={required && items.length === 0}
            disabled={disabled}
            tabIndex={-1}
            aria-hidden
            onChange={(event) => {
              const files = Array.from(event.currentTarget.files ?? []);
              if (files.length) ingest(files);
              else syncInput(items);
            }}
            className="pointer-events-none absolute bottom-0 left-1/2 size-px opacity-0"
          />
        </div>

        <div
          className={cn(
            "max-h-[120px] min-w-0 flex-1 overflow-y-auto overscroll-contain",
            // Three rows outgrow the folder: the list scrolls, and says so
            // with a fade at its lower edge that the last row can clear.
            items.length + bounced.length > 2 &&
              "[mask-image:linear-gradient(to_bottom,black_calc(100%-16px),transparent)] pb-3",
          )}
        >
          {hasRows ? (
            <ul role="list" className="relative flex flex-col">
              <AnimatePresence initial={false} mode="popLayout">
                {items.map((item) => {
                  const p = item.progress;
                  const state =
                    p === undefined
                      ? "Ready"
                      : p >= 1
                        ? "Filed"
                        : `${Math.round(clamp(p, 0, 1) * 100)}%`;
                  return (
                    <motion.li
                      key={item.id}
                      layout={motionSafe ? "position" : false}
                      initial={{
                        opacity: 0,
                        y: motionSafe ? -distances.step : 0,
                      }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                      transition={
                        motionSafe ? springs.snap : { duration: durations.fast }
                      }
                      className="flex items-center gap-2 py-1"
                    >
                      <span
                        aria-hidden
                        className="flex h-7 w-6 shrink-0 items-end justify-center rounded-1 border border-hairline-strong bg-surface-2 pb-1 font-mono text-[7px] leading-none text-ink-2"
                      >
                        {extOf(item)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p
                          className="truncate text-xs leading-4 font-medium text-foreground"
                          title={item.name}
                        >
                          {item.name}
                        </p>
                        <p className="truncate font-mono text-[10px] leading-4 text-ink-3 tabular-nums">
                          <span
                            className={cn(
                              p !== undefined &&
                                (p >= 1
                                  ? "text-success"
                                  : "text-cobalt-bright"),
                            )}
                          >
                            {p !== undefined && p < 1 ? (
                              <span className="sr-only">Uploading </span>
                            ) : null}
                            {state}
                          </span>{" "}
                          · {formatSize(item.size)}
                        </p>
                        {p !== undefined ? (
                          <Ribbon progress={p} motionSafe={motionSafe} />
                        ) : null}
                      </div>
                      <button
                        ref={(node) => {
                          if (node) removers.current.set(item.id, node);
                          else removers.current.delete(item.id);
                        }}
                        type="button"
                        disabled={disabled}
                        aria-label={`Remove ${item.name}`}
                        onClick={() => remove(item.id)}
                        className={cn(
                          "inline-flex size-7 shrink-0 items-center justify-center rounded-2 text-ink-3 transition-colors outline-none",
                          "hover:bg-surface-2 hover:text-foreground",
                          "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
                          "disabled:cursor-not-allowed",
                        )}
                      >
                        {CROSS}
                      </button>
                    </motion.li>
                  );
                })}
                {bounced.map((b) => (
                  <motion.li
                    key={b.id}
                    layout={motionSafe ? "position" : false}
                    initial={{
                      opacity: 0,
                      x: motionSafe ? distances.nudge : 0,
                    }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                    transition={
                      motionSafe
                        ? { ...springs.snap, delay: 0.2 }
                        : { duration: durations.fast }
                    }
                    className="flex items-center gap-2 py-1"
                  >
                    <span
                      aria-hidden
                      className="flex h-7 w-6 shrink-0 items-center justify-center rounded-1 border border-danger/40 bg-danger/10 font-mono text-[10px] leading-none text-danger"
                    >
                      !
                    </span>
                    <div className="min-w-0 flex-1">
                      <p
                        className="truncate text-xs leading-4 font-medium text-foreground"
                        title={b.name}
                      >
                        {b.name}
                      </p>
                      <p
                        className="truncate text-[11px] leading-4 text-danger"
                        title={b.reason}
                      >
                        {b.reason}
                      </p>
                    </div>
                    <button
                      ref={(node) => {
                        if (node) removers.current.set(b.id, node);
                        else removers.current.delete(b.id);
                      }}
                      type="button"
                      aria-label={`Dismiss ${b.name}`}
                      onClick={() => dismiss(b.id)}
                      className={cn(
                        "inline-flex size-7 shrink-0 items-center justify-center rounded-2 text-ink-3 transition-colors outline-none",
                        "hover:bg-surface-2 hover:text-foreground",
                        "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
                      )}
                    >
                      {CROSS}
                    </button>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          ) : (
            <div className="flex flex-col gap-1 pt-1">
              <p className="text-xs leading-4 font-medium text-ink-2">
                {dragOver ? "Let go to file them." : "Nothing filed yet."}
              </p>
              <p className="text-xs leading-4 text-ink-3">
                Drop files on the folder, or press it to choose.
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <p id={hintId} className="text-xs leading-4 text-ink-3">
          {shownHint}
        </p>
        {error ? (
          <p id={errorId} className="text-xs leading-4 text-danger">
            {error}
          </p>
        ) : null}
      </div>
      <p aria-live="polite" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
