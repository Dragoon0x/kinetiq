"use client";

import * as React from "react";

import { Check, Lock } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

type SkillNodeData = {
  id: string;
  label: string;
  x: number;
  y: number;
  prereqs: readonly string[];
};

type SkillState = "locked" | "available" | "owned";

type LinkData = {
  id: string;
  from: string;
  to: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

/** Fixed viewBox the whole layout table is authored against. */
const VIEW_W = 280;
const VIEW_H = 340;

const ROOT_ID = "root";
const CAPSTONE_ID = "autopilot";

/** One root, two three-deep chains, converging on a capstone. Never measured. */
const NODES: readonly SkillNodeData[] = [
  { id: ROOT_ID, label: "Wake", x: 140, y: 28, prereqs: [] },
  { id: "alarm", label: "Alarm", x: 78, y: 96, prereqs: [ROOT_ID] },
  { id: "stretch", label: "Stretch", x: 54, y: 170, prereqs: ["alarm"] },
  { id: "coffee", label: "Coffee", x: 80, y: 244, prereqs: ["stretch"] },
  { id: "playlist", label: "Playlist", x: 202, y: 96, prereqs: [ROOT_ID] },
  { id: "route", label: "Route", x: 226, y: 170, prereqs: ["playlist"] },
  { id: "pace", label: "Pace", x: 200, y: 244, prereqs: ["route"] },
  {
    id: CAPSTONE_ID,
    label: "Autopilot",
    x: 140,
    y: 300,
    prereqs: ["coffee", "pace"],
  },
];

const findNode = (id: string): SkillNodeData | undefined =>
  NODES.find((node) => node.id === id);

/** Every link a node's prereqs imply, geometry pulled straight from NODES. */
const LINKS: LinkData[] = NODES.flatMap((node) =>
  node.prereqs.flatMap((from) => {
    const parent = findNode(from);
    if (!parent) return [];
    return [
      {
        id: `${from}-${node.id}`,
        from,
        to: node.id,
        x1: parent.x,
        y1: parent.y,
        x2: node.x,
        y2: node.y,
      },
    ];
  }),
);

const LINK_DRAW_S = 0.45;
const PULSE_MS = 550;
const CELEBRATE_MS = 1500;
const CAPSTONE_CAPTION = "BUILD COMPLETE · the morning runs itself";
const IDLE_CAPTION = "still waking up";

function statusOf(node: SkillNodeData, owned: ReadonlySet<string>): SkillState {
  if (owned.has(node.id)) return "owned";
  if (node.prereqs.every((id) => owned.has(id))) return "available";
  return "locked";
}

/** Stagger index (reversed) for a node/link draining during respec. */
function reverseDelay(id: string, drainOrder: readonly string[]): number {
  const idx = drainOrder.indexOf(id);
  if (idx === -1) return 0;
  return (
    (drainOrder.length - 1 - idx) * cascade(Math.max(drainOrder.length, 1))
  );
}

export type SkillTreeProps = {
  /** Points available to spend. @default 3 */
  points?: number;
  /** Fires with a node's id the instant it is bought. */
  onUnlock?: (id: string) => void;
  className?: string;
};

/**
 * A talent tree you spend points into. Eight skills branch from a single
 * root in two three-deep chains that converge on a capstone; a node's lock
 * only lifts once every skill before it is owned, and each freshly reachable
 * node lifts into view on `snap` with a slow ambient pulse — the hook that
 * says spend here next. Spending fills the node from its centre, sends a
 * ring out from it, and draws the link up from its owned parent; respec
 * drains every owned node back to locked in the reverse order it was
 * bought, links retracting behind it as the points return. Owning the
 * capstone sweeps a band of light across the whole tree and brightens every
 * owned node in a cascade, flipping the caption to the finished build's
 * name.
 * Reduced motion: no ambient pulse, no drawn links, and no capstone sweep —
 * spending and respec swap every node's state and every link's length
 * instantly, with no stagger between them.
 */
export function SkillTree({
  points = 3,
  onUnlock,
  className,
}: SkillTreeProps): React.JSX.Element {
  const motionSafe = useMotionSafe();
  const totalPoints = Math.max(0, points);

  const [owned, setOwned] = React.useState<ReadonlySet<string>>(
    () => new Set([ROOT_ID]),
  );
  const [order, setOrder] = React.useState<string[]>([]);
  const [drainOrder, setDrainOrder] = React.useState<string[]>([]);
  const [pulseId, setPulseId] = React.useState<string | null>(null);
  const [celebrating, setCelebrating] = React.useState(false);
  const [announce, setAnnounce] = React.useState("");

  const pulseTimer = React.useRef<number | null>(null);
  const celebrateTimer = React.useRef<number | null>(null);

  React.useEffect(() => {
    return () => {
      if (pulseTimer.current !== null) window.clearTimeout(pulseTimer.current);
      if (celebrateTimer.current !== null)
        window.clearTimeout(celebrateTimer.current);
    };
  }, []);

  const spent = owned.size - 1;
  const remaining = Math.max(0, totalPoints - spent);
  const complete = owned.has(CAPSTONE_ID);

  const ownedInOrder = NODES.filter((node) => owned.has(node.id));
  const celebrateStep = cascade(Math.max(ownedInOrder.length, 1));

  const handleUnlock = (node: SkillNodeData) => {
    if (owned.has(node.id)) return;
    if (!node.prereqs.every((id) => owned.has(id))) return;
    if (remaining <= 0) return;

    setOwned((prev) => {
      const next = new Set(prev);
      next.add(node.id);
      return next;
    });
    setOrder((prev) => [...prev, node.id]);
    onUnlock?.(node.id);
    setAnnounce(`${node.label} unlocked.`);

    if (motionSafe) {
      if (pulseTimer.current !== null) window.clearTimeout(pulseTimer.current);
      setPulseId(node.id);
      pulseTimer.current = window.setTimeout(() => {
        pulseTimer.current = null;
        setPulseId(null);
      }, PULSE_MS);

      if (node.id === CAPSTONE_ID) {
        if (celebrateTimer.current !== null)
          window.clearTimeout(celebrateTimer.current);
        setCelebrating(true);
        celebrateTimer.current = window.setTimeout(() => {
          celebrateTimer.current = null;
          setCelebrating(false);
        }, CELEBRATE_MS);
      }
    }
  };

  const handleRespec = () => {
    if (owned.size <= 1) return;
    setDrainOrder(order);
    setOrder([]);
    setOwned(new Set([ROOT_ID]));
    setPulseId(null);
    setCelebrating(false);
    setAnnounce("Respec. All points returned.");
  };

  const counterText =
    remaining <= 0
      ? "no points"
      : `${remaining} point${remaining === 1 ? "" : "s"} to spend`;
  const captionText = complete ? CAPSTONE_CAPTION : IDLE_CAPTION;

  return (
    <div
      className={cn(
        "w-full max-w-sm rounded-4 border border-hairline bg-surface-1 shadow-raised",
        className,
      )}
    >
      <div className="flex items-center justify-between border-b border-hairline px-4 py-3">
        <span className="text-sm font-semibold text-ink">Morning Build</span>
        <span className="font-mono text-xs text-ink-3 tabular-nums">
          {counterText}
        </span>
      </div>

      <div className="flex justify-center px-4 py-5">
        <div className="relative" style={{ width: VIEW_W, height: VIEW_H }}>
          <svg
            aria-hidden
            viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
            className="absolute inset-0 size-full"
          >
            {LINKS.map((link) => {
              const drawn = owned.has(link.from) && owned.has(link.to);
              const delay = drawn ? 0 : reverseDelay(link.to, drainOrder);
              return (
                <SkillLinkView
                  key={link.id}
                  link={link}
                  drawn={drawn}
                  delay={delay}
                  motionSafe={motionSafe}
                />
              );
            })}
          </svg>

          <AnimatePresence>
            {motionSafe && celebrating && (
              <motion.div
                aria-hidden
                className="pointer-events-none absolute inset-y-0"
                style={{
                  width: VIEW_W * 0.45,
                  background:
                    "linear-gradient(100deg, transparent, color-mix(in oklab, var(--primary) 55%, transparent), transparent)",
                }}
                initial={{ x: -VIEW_W * 0.5, opacity: 0 }}
                animate={{ x: VIEW_W * 1.05, opacity: [0, 1, 0] }}
                exit={{ opacity: 0 }}
                transition={{
                  x: { duration: 0.9, ease: easings.move },
                  opacity: {
                    duration: 0.9,
                    ease: easings.move,
                    times: [0, 0.5, 1],
                  },
                }}
              />
            )}
          </AnimatePresence>

          {NODES.map((node) => {
            const status = statusOf(node, owned);
            const index = ownedInOrder.findIndex((n) => n.id === node.id);
            return (
              <SkillNodeView
                key={node.id}
                node={node}
                status={status}
                unaffordable={status === "available" && remaining <= 0}
                pulseOnce={pulseId === node.id}
                celebrate={celebrating && owned.has(node.id)}
                celebrateDelay={index >= 0 ? index * celebrateStep : 0}
                lockedDelay={reverseDelay(node.id, drainOrder)}
                motionSafe={motionSafe}
                onUnlock={() => handleUnlock(node)}
              />
            );
          })}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-hairline px-4 py-3">
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={complete ? "complete" : "idle"}
            className="font-mono text-xs text-ink-3"
            initial={motionSafe ? { opacity: 0, y: 3 } : false}
            animate={{ opacity: 1, y: 0 }}
            exit={
              motionSafe
                ? {
                    opacity: 0,
                    transition: {
                      duration: durations.fast,
                      ease: easings.exit,
                    },
                  }
                : { opacity: 0, transition: { duration: 0 } }
            }
            transition={
              motionSafe
                ? { duration: durations.base, ease: easings.enter }
                : { duration: 0 }
            }
          >
            {captionText}
          </motion.span>
        </AnimatePresence>

        <button
          type="button"
          onClick={handleRespec}
          disabled={owned.size <= 1}
          className="text-label text-ink-3 transition-colors hover:text-ink disabled:pointer-events-none disabled:opacity-40"
        >
          respec
        </button>
      </div>

      <span role="status" aria-live="polite" className="sr-only">
        {announce}
      </span>
    </div>
  );
}

type SkillLinkViewProps = {
  link: LinkData;
  drawn: boolean;
  delay: number;
  motionSafe: boolean;
};

function SkillLinkView({ link, drawn, delay, motionSafe }: SkillLinkViewProps) {
  return (
    <motion.path
      d={`M ${link.x1} ${link.y1} L ${link.x2} ${link.y2}`}
      fill="none"
      stroke={drawn ? "var(--primary)" : "var(--hairline-strong)"}
      strokeWidth={2}
      strokeLinecap="round"
      style={{ transition: "stroke 240ms ease" }}
      initial={false}
      animate={{ pathLength: drawn ? 1 : 0 }}
      transition={
        motionSafe
          ? {
              duration: LINK_DRAW_S,
              ease: drawn ? easings.enter : easings.exit,
              delay: drawn ? 0 : delay,
            }
          : { duration: 0 }
      }
    />
  );
}

type SkillNodeViewProps = {
  node: SkillNodeData;
  status: SkillState;
  /** Available, but the point pool is empty — dim and inert. */
  unaffordable: boolean;
  /** One-shot expanding ring for the instant this node is bought. */
  pulseOnce: boolean;
  /** Capstone brighten flash. */
  celebrate: boolean;
  celebrateDelay: number;
  /** Reverse-cascade stagger applied while this node drains during respec. */
  lockedDelay: number;
  motionSafe: boolean;
  onUnlock: () => void;
};

function SkillNodeView({
  node,
  status,
  unaffordable,
  pulseOnce,
  celebrate,
  celebrateDelay,
  lockedDelay,
  motionSafe,
  onUnlock,
}: SkillNodeViewProps) {
  const isRoot = node.id === ROOT_ID;
  const owned = status === "owned";
  const available = status === "available";
  const locked = status === "locked";
  const filled = owned || isRoot;
  const interactive = available && !unaffordable;

  const ariaLabel = available
    ? `Unlock ${node.label}`
    : owned
      ? `${node.label}, unlocked`
      : `${node.label}, locked`;

  const liftTransition = motionSafe
    ? { ...springs.snap, delay: locked ? lockedDelay : 0 }
    : { duration: 0 };
  const fillTransition = motionSafe
    ? filled
      ? { ...springs.recoil, delay: 0 }
      : { duration: durations.base, ease: easings.exit, delay: lockedDelay }
    : { duration: 0 };
  const lockTransition = motionSafe
    ? locked
      ? { duration: durations.fast, ease: easings.enter, delay: lockedDelay }
      : { duration: durations.fast, ease: easings.exit }
    : { duration: 0 };
  const checkTransition = motionSafe
    ? filled
      ? { duration: durations.fast, ease: easings.enter, delay: 0.12 }
      : { duration: durations.fast, ease: easings.exit, delay: lockedDelay }
    : { duration: 0 };

  return (
    <div
      className="absolute -translate-x-1/2"
      style={{ left: node.x, top: node.y }}
    >
      <motion.div
        className="relative flex flex-col items-center"
        animate={{ y: locked ? 4 : 0 }}
        transition={liftTransition}
      >
        {motionSafe && available && !unaffordable && (
          <motion.span
            aria-hidden
            className="absolute inset-0 rounded-full border"
            style={{ borderColor: "var(--primary)" }}
            initial={{ scale: 1, opacity: 0.35 }}
            animate={{ scale: 1.22, opacity: 0.05 }}
            transition={{
              duration: 1.7,
              ease: "easeInOut",
              repeat: Infinity,
              repeatType: "mirror",
            }}
          />
        )}

        <AnimatePresence>
          {motionSafe && pulseOnce && (
            <motion.span
              aria-hidden
              className="absolute inset-0 rounded-full border-2"
              style={{ borderColor: "var(--primary)" }}
              initial={{ scale: 1, opacity: 0.6 }}
              animate={{ scale: 2.1, opacity: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.55, ease: easings.exit }}
            />
          )}
        </AnimatePresence>

        <AnimatePresence>
          {motionSafe && celebrate && (
            <motion.span
              aria-hidden
              className="absolute inset-0 rounded-full"
              style={{ background: "var(--primary)" }}
              initial={{ opacity: 0, scale: 1 }}
              animate={{ opacity: [0, 0.85, 0], scale: [1, 1.18, 1] }}
              exit={{ opacity: 0 }}
              transition={{
                duration: 0.6,
                ease: easings.move,
                delay: celebrateDelay,
                times: [0, 0.4, 1],
              }}
            />
          )}
        </AnimatePresence>

        {isRoot ? (
          <div
            className="relative flex size-9 items-center justify-center rounded-full border border-hairline-strong shadow-raised"
            style={{ background: "var(--primary)" }}
          >
            <Check
              aria-hidden
              className="size-3.5"
              style={{ color: "var(--primary-foreground)" }}
            />
          </div>
        ) : (
          <button
            type="button"
            aria-label={ariaLabel}
            onClick={onUnlock}
            disabled={!interactive}
            className={cn(
              "relative flex size-9 items-center justify-center rounded-full border bg-surface-1 shadow-raised transition-colors",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
              available
                ? cn(
                    "border-2",
                    unaffordable
                      ? "cursor-not-allowed opacity-45"
                      : "cursor-pointer hover:bg-surface-2",
                  )
                : locked
                  ? "cursor-not-allowed border-hairline opacity-55"
                  : "cursor-default border-hairline-strong",
            )}
            style={available ? { borderColor: "var(--primary)" } : undefined}
          >
            <motion.span
              aria-hidden
              className="absolute inset-0 rounded-full"
              style={{ background: "var(--primary)" }}
              initial={false}
              animate={{ scale: filled ? 1 : 0, opacity: filled ? 1 : 0 }}
              transition={fillTransition}
            />
            <motion.span
              aria-hidden
              className="relative"
              initial={false}
              animate={{ opacity: locked ? 1 : 0 }}
              transition={lockTransition}
            >
              <Lock className="size-3.5 text-ink-3" />
            </motion.span>
            <motion.span
              aria-hidden
              className="absolute inset-0 flex items-center justify-center"
              initial={false}
              animate={{ opacity: filled ? 1 : 0 }}
              transition={checkTransition}
            >
              <Check
                className="size-3.5"
                style={{ color: "var(--primary-foreground)" }}
              />
            </motion.span>
          </button>
        )}

        <span
          className={cn(
            "mt-1.5 text-[10px] font-medium",
            filled
              ? "text-ink"
              : available && !unaffordable
                ? "text-ink-2"
                : "text-ink-3",
          )}
        >
          {node.label}
        </span>
      </motion.div>
    </div>
  );
}
