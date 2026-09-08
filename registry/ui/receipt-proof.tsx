"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, durations, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type ProofStatus = "idle" | "checking" | "verified" | "failed";

export type ProofNode = {
  level: number;
  index: number;
  hash: string;
  role: "path" | "sibling" | "idle";
};

export type ReceiptProofProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** Leaf count, rounded up to a power of two so the tree pairs evenly. @default 8 */
  leaves?: number;
  /** Controlled leaf index — the receipt being proved. */
  value?: number;
  /** Initial leaf index for uncontrolled usage. @default 0 */
  defaultValue?: number;
  onValueChange?: (index: number) => void;
  /** Drives the draw and the stamp; the host owns the timing. @default "idle" */
  status?: ProofStatus;
  /** Seeds the procedural hashes so the tree is deterministic. @default "basin" */
  seed?: string;
  /** The receipt's value, printed beside the chosen leaf. */
  amount?: number;
  /** Formats `amount`. */
  format?: (value: number) => string;
  /** Ticker printed after the amount. @default "BSN" */
  asset?: string;
  /** Visible caption. Omit it and pass `aria-label`. */
  label?: React.ReactNode;
  /** Caption on the root node's read-out. @default "Block root" */
  rootLabel?: string;
  /** Fires from the hover or focus that changed the read-out. */
  onNodeFocus?: (node: ProofNode) => void;
  className?: string;
  "aria-label"?: string;
};

const MONEY = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const defaultFormat = (value: number): string => MONEY.format(value);

const round = (value: number): number => Number(value.toFixed(3));

/**
 * A deterministic mixer, not a hash function: the same seed and position draw
 * the same sixteen characters on the server and in the browser, which is the
 * only property a procedural tree needs.
 */
const hashAt = (seed: string, level: number, index: number): string => {
  const input = `${seed}:${level}:${index}`;
  let state = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i += 1) {
    state ^= input.charCodeAt(i);
    state = Math.imul(state, 16777619) >>> 0;
  }
  let out = "";
  for (let i = 0; i < 2; i += 1) {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    out += state.toString(16).padStart(8, "0");
  }
  return `0x${out}`;
};

const shorten = (hash: string): string =>
  `${hash.slice(0, 6)}…${hash.slice(-4)}`;

const ROLE_WORD = {
  path: "on the proof path",
  sibling: "proof sibling",
  idle: "not in this proof",
} as const;

/**
 * The proof, drawn as a path. Leaves pair upward to a single root, and choosing
 * one picks out the edges that prove it plus the sibling hash a verifier needs
 * at every level. While the status is idle the tree is all hairline; turning it
 * to checking draws the path leaf-first — each edge's `pathLength` from 0 to 1
 * on `glide`, staggered by `cascade()` so the whole climb stays inside the
 * choreography budget — and the siblings wash in behind it.
 *
 * Verifying stamps the root: the seal arrives from 1.25× on `recoil`, whose
 * ζ0.53 gives the two bounces of a stamp hitting paper, and its check draws on
 * `flick`. A failure does not celebrate — the root turns danger on a colour
 * tween and nothing bounces.
 *
 * Hashes are procedural and seeded, and every coordinate is rounded before it
 * reaches an attribute, because a last-digit disagreement between Node and the
 * browser is a hydration error. The nodes are real buttons over the SVG with a
 * roving tabindex — Left and Right walk a level, Up and Down change level, Home
 * and End jump, Enter and Space choose the leaf — so focus reads exactly what
 * hovering reads. Under reduced motion the path appears already drawn, because
 * which edges prove the receipt is the information.
 */
export function ReceiptProof({
  ref,
  leaves = 8,
  value,
  defaultValue = 0,
  onValueChange,
  status = "idle",
  seed = "basin",
  amount,
  format = defaultFormat,
  asset = "BSN",
  label,
  rootLabel = "Block root",
  onNodeFocus,
  className,
  "aria-label": ariaLabel,
}: ReceiptProofProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const labelId = `${baseId}-label`;

  const size = 2 ** Math.ceil(Math.log2(Math.max(2, Math.min(32, leaves))));
  const levels = Math.log2(size) + 1;

  const [uncontrolled, setUncontrolled] = React.useState(defaultValue);
  const isControlled = value !== undefined;
  const leaf = Math.max(
    0,
    Math.min(size - 1, isControlled ? value : uncontrolled),
  );

  const nodeX = React.useCallback(
    (level: number, index: number) => ((index + 0.5) / (size >> level)) * 100,
    [size],
  );
  const nodeY = React.useCallback(
    (level: number) => ((levels - 1 - level) / (levels - 1)) * 100,
    [levels],
  );

  /** The chain of indices from the chosen leaf up to the root. */
  const chain = React.useMemo(
    () => Array.from({ length: levels }, (_, level) => leaf >> level),
    [levels, leaf],
  );

  const roleOf = (level: number, index: number): ProofNode["role"] => {
    if (chain[level] === index) return "path";
    if (level < levels - 1 && (chain[level] ?? 0) === (index ^ 1))
      return "sibling";
    return "idle";
  };

  const edges = React.useMemo(() => {
    const all: { key: string; d: string; level: number }[] = [];
    for (let level = 0; level < levels - 1; level += 1) {
      for (let index = 0; index < size >> level; index += 1) {
        const x1 = nodeX(level, index);
        const y1 = nodeY(level);
        const x2 = nodeX(level + 1, index >> 1);
        const y2 = nodeY(level + 1);
        const mid = round((y1 + y2) / 2);
        all.push({
          key: `${level}:${index}`,
          level,
          d: `M${round(x1)} ${round(y1)} C${round(x1)} ${mid}, ${round(x2)} ${mid}, ${round(x2)} ${round(y2)}`,
        });
      }
    }
    return all;
  }, [levels, size, nodeX, nodeY]);

  const drawn = status !== "idle";
  const verified = status === "verified";
  const failed = status === "failed";
  const stagger = cascade(levels - 1);

  const [read, setRead] = React.useState<string | null>(null);
  const [focusKey, setFocusKey] = React.useState(`0:${leaf}`);
  const buttons = React.useRef(new Map<string, HTMLButtonElement | null>());

  const nodeAt = (key: string): ProofNode => {
    const [levelText, indexText] = key.split(":");
    const level = Number(levelText);
    const index = Number(indexText);
    return {
      level,
      index,
      hash: hashAt(seed, level, index),
      role: roleOf(level, index),
    };
  };

  const readKey = read ?? `0:${leaf}`;
  const readNode = nodeAt(readKey);

  const report = (key: string) => {
    setRead(key);
    onNodeFocus?.(nodeAt(key));
  };

  const moveTo = (level: number, index: number) => {
    const clampedLevel = Math.min(levels - 1, Math.max(0, level));
    const clampedIndex = Math.min(
      (size >> clampedLevel) - 1,
      Math.max(0, index),
    );
    const key = `${clampedLevel}:${clampedIndex}`;
    setFocusKey(key);
    buttons.current.get(key)?.focus();
  };

  const choose = (index: number) => {
    if (!isControlled) setUncontrolled(index);
    if (index !== leaf) onValueChange?.(index);
  };

  const handleKeyDown = (
    event: React.KeyboardEvent,
    level: number,
    index: number,
  ) => {
    switch (event.key) {
      case "ArrowRight":
        event.preventDefault();
        moveTo(level, index + 1);
        break;
      case "ArrowLeft":
        event.preventDefault();
        moveTo(level, index - 1);
        break;
      case "ArrowUp":
        event.preventDefault();
        moveTo(level + 1, index >> 1);
        break;
      case "ArrowDown":
        event.preventDefault();
        moveTo(level - 1, index * 2);
        break;
      case "Home":
        event.preventDefault();
        moveTo(level, 0);
        break;
      case "End":
        event.preventDefault();
        moveTo(level, (size >> level) - 1);
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        if (level === 0) choose(index);
        break;
      default:
        break;
    }
  };

  const nodes = React.useMemo(() => {
    const all: { level: number; index: number }[] = [];
    for (let level = 0; level < levels; level += 1) {
      for (let index = 0; index < size >> level; index += 1) {
        all.push({ level, index });
      }
    }
    return all;
  }, [levels, size]);

  const isRootKey = (level: number) => level === levels - 1;
  const detailWord = isRootKey(readNode.level)
    ? rootLabel
    : readNode.level === 0
      ? `Leaf ${readNode.index}`
      : `Level ${readNode.level} node ${readNode.index}`;

  return (
    <div
      ref={ref}
      role="group"
      aria-labelledby={label ? labelId : undefined}
      aria-label={label ? undefined : ariaLabel}
      className={cn(
        "flex w-full flex-col gap-3 rounded-3 border border-hairline bg-surface-1 p-3",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        {label ? (
          <span id={labelId} className="min-w-0 truncate text-sm font-semibold">
            {label}
          </span>
        ) : null}
        <span
          className={cn(
            "shrink-0 rounded-full border border-hairline px-2 py-0.5 font-mono text-[10px] tracking-[0.08em] uppercase transition-colors",
            verified
              ? "text-success"
              : failed
                ? "text-danger"
                : status === "checking"
                  ? "text-cobalt-bright"
                  : "text-ink-3",
          )}
        >
          {status}
        </span>
      </div>

      {/* Padding of half a node: a node centred on 0% or 100% of the inner box
          still lands inside the card at any width. */}
      <div className="px-2.5 py-2.5">
        <div className="relative h-36">
          <svg
            aria-hidden
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="absolute inset-0 size-full overflow-visible"
          >
            <g className="text-hairline-strong">
              {edges.map((edge) => (
                <path
                  key={edge.key}
                  d={edge.d}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1"
                  vectorEffect="non-scaling-stroke"
                />
              ))}
            </g>
            <g
              className={cn(
                "transition-colors",
                verified
                  ? "text-success"
                  : failed
                    ? "text-danger"
                    : "text-cobalt-bright",
              )}
            >
              {edges
                .filter(
                  (edge) => edge.key === `${edge.level}:${chain[edge.level]}`,
                )
                .map((edge) => (
                  <motion.path
                    key={edge.key}
                    d={edge.d}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    vectorEffect="non-scaling-stroke"
                    pathLength={1}
                    initial={false}
                    animate={{ pathLength: drawn ? 1 : 0 }}
                    transition={
                      motionSafe
                        ? { ...springs.glide, delay: edge.level * stagger }
                        : { duration: 0 }
                    }
                  />
                ))}
            </g>
          </svg>

          {nodes.map(({ level, index }) => {
            const key = `${level}:${index}`;
            const role = roleOf(level, index);
            const isRoot = isRootKey(level);
            const isLeaf = level === 0;
            const isChosen = isLeaf && index === leaf;
            const hash = hashAt(seed, level, index);
            const name = isRoot
              ? rootLabel
              : isLeaf
                ? `Leaf ${index}`
                : `Level ${level} node ${index}`;
            const state = isRoot && drawn ? status : ROLE_WORD[role];
            return (
              <button
                key={key}
                ref={(node) => {
                  buttons.current.set(key, node);
                }}
                type="button"
                tabIndex={key === focusKey ? 0 : -1}
                aria-label={`${name}, ${state}, hash ${shorten(hash)}`}
                aria-pressed={isLeaf ? isChosen : undefined}
                style={{
                  left: `${round(nodeX(level, index))}%`,
                  top: `${round(nodeY(level))}%`,
                }}
                onFocus={() => {
                  setFocusKey(key);
                  report(key);
                }}
                onBlur={() => setRead(null)}
                onPointerEnter={() => report(key)}
                onPointerLeave={() => setRead(null)}
                onClick={() => {
                  setFocusKey(key);
                  report(key);
                  if (isLeaf) choose(index);
                }}
                onKeyDown={(event) => handleKeyDown(event, level, index)}
                className={cn(
                  "absolute grid -translate-x-1/2 -translate-y-1/2 cursor-pointer place-items-center rounded-full border-2 transition-colors outline-none",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                  isRoot ? "size-6" : "size-5",
                  isRoot && verified
                    ? "border-success bg-success text-primary-foreground"
                    : isRoot && failed
                      ? "border-danger bg-surface-1 text-danger"
                      : isChosen
                        ? "border-cobalt-bright bg-cobalt-bright text-primary-foreground"
                        : role === "path"
                          ? "border-cobalt-bright bg-cobalt-wash"
                          : role === "sibling"
                            ? "border-dashed border-cobalt-bright/60 bg-surface-2"
                            : "border-hairline-strong bg-surface-1",
                )}
              >
                {isRoot ? (
                  <svg
                    viewBox="0 0 16 16"
                    aria-hidden
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="size-3"
                  >
                    <motion.path
                      d={
                        failed
                          ? "M4.8 4.8 11.2 11.2M11.2 4.8 4.8 11.2"
                          : "M3.6 8.4 6.4 11.2 12.4 4.8"
                      }
                      pathLength={1}
                      initial={false}
                      animate={{ pathLength: verified || failed ? 1 : 0 }}
                      transition={motionSafe ? springs.flick : { duration: 0 }}
                    />
                  </svg>
                ) : isChosen ? (
                  <span
                    aria-hidden
                    className="size-1.5 rounded-full bg-primary-foreground"
                  />
                ) : null}

                {/* The seal is the stamp: it lands from 1.25× on recoil, and a
                    failure gets none of it. */}
                {isRoot && verified ? (
                  <motion.span
                    aria-hidden
                    className="pointer-events-none absolute -inset-1.5 rounded-full border border-success"
                    initial={
                      motionSafe
                        ? { scale: 1.25, opacity: 0 }
                        : { scale: 1, opacity: 1 }
                    }
                    animate={{ scale: 1, opacity: 1 }}
                    transition={
                      motionSafe
                        ? {
                            ...springs.recoil,
                            opacity: { duration: durations.blink },
                          }
                        : { duration: 0 }
                    }
                  />
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-1 border-t border-hairline pt-3">
        <p
          aria-live="polite"
          className="flex min-w-0 items-baseline gap-2 font-mono text-[11px]"
        >
          <span className="shrink-0 text-ink-2">{detailWord}</span>
          <span className="min-w-0 flex-1 truncate text-ink-3">
            {readNode.hash}
          </span>
        </p>
        <p className="flex items-baseline justify-between gap-2 text-[11px]">
          <span className="min-w-0 truncate text-ink-3">
            Proving leaf {leaf} · {ROLE_WORD[readNode.role]}
          </span>
          {amount !== undefined ? (
            <span className="shrink-0 font-mono font-medium text-foreground tabular-nums">
              {format(amount)} {asset}
            </span>
          ) : null}
        </p>
      </div>

      <span role="status" className="sr-only">
        {verified
          ? "Proof verified against the block root."
          : failed
            ? "Proof failed against the block root."
            : ""}
      </span>
    </div>
  );
}
