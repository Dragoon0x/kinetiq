"use client";

import * as React from "react";

import {
  AnimatePresence,
  animate,
  motion,
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

export type VersionStatus = "good" | "bad" | "unknown";

export type ReleaseVersion = {
  id: string;
  /** What the version is called: "2.13.4". */
  label: string;
  status: VersionStatus;
  /** One short line about this version, printed under the arc. */
  note?: string;
};

export type RollbackArcProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** Oldest first, frontier last. */
  versions: ReleaseVersion[];
  /** Whose versions these are; printed in the head. */
  service: string;
  /** Controlled deployed version id. */
  value?: string;
  /** Initial deployed version id for uncontrolled usage. @default the frontier */
  defaultValue?: string;
  /** Fires when a rollback SETTLES, from the setter that committed it. */
  onValueChange?: (id: string) => void;
  /** The caret's version — a state, so it also fires on the first commit. */
  onChosenChange?: (id: string) => void;
  /** Fires from the press that started the travel. */
  onRollbackStart?: (id: string) => void;
  /** Copy on the confirm control; the default names the direction. */
  rollbackLabel?: (version: ReleaseVersion) => string;
  /** Names the arc for assistive technology. @default "Version arc" */
  label?: string;
  className?: string;
};

/* The arc lives in a 300×120 viewBox around a centre well below it, so the
   sweep reads as a shallow frontier rather than a dome. */
const CX = 150;
const CY = 150;
const R = 130;
const FROM = 200;
const TO = 340;
const VIEW_W = 300;
const VIEW_H = 120;

/** Three decimals before any number reaches an attribute: `Math.cos` is not
 *  correctly rounded and Node and Chromium differ in the last digits, which is
 *  a hydration error rather than a rounding one. */
const r3 = (value: number): number => Number(value.toFixed(3));

const angleAt = (index: number, count: number): number =>
  count <= 1 ? (FROM + TO) / 2 : FROM + ((TO - FROM) * index) / (count - 1);

const xAt = (angle: number): number =>
  r3(CX + R * Math.cos((angle * Math.PI) / 180));
const yAt = (angle: number): number =>
  r3(CY + R * Math.sin((angle * Math.PI) / 180));

/** A static path: an arc that drew itself with `pathLength` and a dash pattern
 *  would be measured against its length on screen while the pattern scaled to
 *  user units, and paint a fraction of itself in a stretched viewBox. */
const ARC = `M ${xAt(FROM)} ${yAt(FROM)} A ${R} ${R} 0 0 1 ${xAt(TO)} ${yAt(TO)}`;

const DOT_FILL: Record<VersionStatus, string> = {
  good: "fill-success",
  bad: "fill-danger",
  unknown: "fill-ink-3",
};

const STATUS_TEXT: Record<VersionStatus, string> = {
  good: "text-success",
  bad: "text-danger",
  unknown: "text-ink-3",
};

const focusRing =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

/**
 * Every version a service has worn, laid on one arc with the newest at the
 * frontier. The arc is a static path and the nodes sit on it at coordinates
 * rounded to three decimals before they reach an attribute. The deployed marker
 * rides the arc rather than cutting the chord: a scalar motion value carries its
 * position between version indices and `useTransform` derives `cx` and `cy` from
 * it, so a rollback across three versions travels the curve on `glide`.
 *
 * Choosing an earlier node moves a hollow caret to it on `snap` and unfolds a
 * roll-back row in flow at a ResizeObserver-measured height, its button focused
 * when it ARRIVES. Only when the marker has SETTLED does the version become
 * current and the sentence be spoken — announcing at the press would be a lie
 * about something that had not happened yet.
 *
 * Each version carries its verdict as a word as well as a colour, the nodes are
 * a real `role="listbox"` under a roving tabindex, and nothing here reads a
 * clock. Under reduced motion the marker does not travel: the scalar jumps and
 * the arrival is spoken at once, because where the service now stands is
 * information rather than flourish.
 */
export function RollbackArc({
  ref,
  versions,
  service,
  value,
  defaultValue,
  onValueChange,
  onChosenChange,
  onRollbackStart,
  rollbackLabel,
  label = "Version arc",
  className,
}: RollbackArcProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const copyId = `${baseId}-confirm-copy`;

  const count = versions.length;
  const frontier = versions[count - 1];
  const [ownValue, setOwnValue] = React.useState(
    defaultValue ?? frontier?.id ?? "",
  );
  const deployedId = value !== undefined ? value : ownValue;
  const deployedIndex = Math.max(
    0,
    versions.findIndex((version) => version.id === deployedId),
  );
  const deployed = versions[deployedIndex];

  const [ownChosen, setOwnChosen] = React.useState<string | null>(null);
  const chosenId =
    ownChosen && versions.some((version) => version.id === ownChosen)
      ? ownChosen
      : deployedId;
  const chosenIndex = Math.max(
    0,
    versions.findIndex((version) => version.id === chosenId),
  );
  const chosen = versions[chosenIndex];

  const [focusId, setFocusId] = React.useState<string | null>(null);
  const [rollingId, setRollingId] = React.useState<string | null>(null);
  const [spoken, setSpoken] = React.useState("");

  const chosenRef = React.useRef(onChosenChange);
  React.useEffect(() => {
    chosenRef.current = onChosenChange;
  });
  // The caret is a state, not an event: it reports from the first commit.
  React.useEffect(() => {
    chosenRef.current?.(chosenId);
  }, [chosenId]);

  // The marker's position is one scalar in version-index space; cx and cy are
  // derived from it, so the dot follows the curve instead of the chord.
  const travel = useMotionValue(deployedIndex);
  const markerX = useTransform(travel, (at) => xAt(angleAt(at, count)));
  const markerY = useTransform(travel, (at) => yAt(angleAt(at, count)));

  const [rowNode, setRowNode] = React.useState<HTMLDivElement | null>(null);
  const [rowHeight, setRowHeight] = React.useState(0);
  React.useEffect(() => {
    if (!rowNode || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setRowHeight(Math.round(entry.contentRect.height));
    });
    observer.observe(rowNode);
    return () => observer.disconnect();
  }, [rowNode]);

  const [confirmNode, setConfirmNode] =
    React.useState<HTMLButtonElement | null>(null);
  // Bound to the node when it ARRIVES: the confirm does not exist on the frame
  // the choice was made, so a focus call fired then would land nowhere.
  React.useEffect(() => {
    confirmNode?.focus();
  }, [confirmNode]);

  const focusNode = (id: string) => {
    setFocusId(id);
    document.getElementById(`${baseId}-node-${id}`)?.focus();
  };

  const settle = (id: string) => {
    const landed = versions.find((version) => version.id === id);
    if (value === undefined) setOwnValue(id);
    setRollingId(null);
    // The row that held the confirm is about to leave; focus goes back to the
    // node it belonged to rather than being dropped on the body.
    const active =
      typeof document === "undefined" ? null : document.activeElement;
    if (rowNode && active && rowNode.contains(active)) focusNode(id);
    if (landed) {
      const back =
        versions.findIndex((version) => version.id === id) < deployedIndex;
      setSpoken(
        `${back ? "Rolled back" : "Rolled forward"} to ${landed.label}. ${service} is on a version marked ${landed.status}.`,
      );
    }
    onValueChange?.(id);
  };
  const settleRef = React.useRef(settle);
  React.useEffect(() => {
    settleRef.current = settle;
  });

  const rollingIndex = rollingId
    ? versions.findIndex((version) => version.id === rollingId)
    : -1;
  const target = rollingIndex >= 0 ? rollingIndex : deployedIndex;

  React.useEffect(() => {
    const controls = animate(
      travel,
      target,
      motionSafe ? springs.glide : { duration: 0 },
    );
    let live = true;
    // The settled sentence and the committed version both wait for the travel:
    // a rollback announced at the press would speak of a version the service is
    // not on yet.
    void controls.then(() => {
      if (live && rollingId) settleRef.current(rollingId);
    });
    return () => {
      live = false;
      controls.stop();
    };
  }, [target, rollingId, motionSafe, travel]);

  const choose = (index: number) => {
    const version = versions[Math.min(count - 1, Math.max(0, index))];
    if (!version || rollingId) return;
    setOwnChosen(version.id);
    focusNode(version.id);
  };

  const cancel = () => {
    if (!deployed) return;
    setOwnChosen(deployedId);
    setSpoken(`Rollback cancelled, still on ${deployed.label}.`);
    focusNode(chosenId);
  };

  const start = () => {
    if (!chosen || chosen.id === deployedId || rollingId) return;
    const back = chosenIndex < deployedIndex;
    setRollingId(chosen.id);
    setSpoken(
      `${back ? "Rolling back" : "Rolling forward"} to ${chosen.label}.`,
    );
    onRollbackStart?.(chosen.id);
  };

  const onNodeKeyDown = (
    event: React.KeyboardEvent<HTMLLIElement>,
    index: number,
  ) => {
    if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
      event.preventDefault();
      focusNode(versions[Math.max(0, index - 1)]?.id ?? "");
    } else if (event.key === "ArrowRight" || event.key === "ArrowUp") {
      event.preventDefault();
      focusNode(versions[Math.min(count - 1, index + 1)]?.id ?? "");
    } else if (event.key === "Home") {
      event.preventDefault();
      focusNode(versions[0]?.id ?? "");
    } else if (event.key === "End") {
      event.preventDefault();
      focusNode(frontier?.id ?? "");
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      choose(index);
    } else if (event.key === "Escape" && chosenId !== deployedId) {
      event.preventDefault();
      cancel();
    }
  };

  const tabbable =
    focusId && versions.some((version) => version.id === focusId)
      ? focusId
      : chosenId;
  const armed = chosen !== undefined && chosen.id !== deployedId;
  const action = chosen
    ? rollbackLabel
      ? rollbackLabel(chosen)
      : `${chosenIndex < deployedIndex ? "Roll back" : "Roll forward"} to ${chosen.label}`
    : "";
  const fade = { duration: durations.fast, ease: easings.enter } as const;
  const glide = motionSafe
    ? springs.glide
    : { duration: durations.base, ease: easings.enter };

  return (
    <div
      ref={ref}
      role="group"
      aria-label={label}
      onKeyDown={(event) => {
        if (event.key === "Escape" && chosenId !== deployedId && !rollingId) {
          event.preventDefault();
          cancel();
        }
      }}
      className={cn(
        "flex w-full flex-col gap-2 overflow-clip rounded-3 border border-hairline bg-surface-1 p-3 [contain:paint]",
        className,
      )}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="min-w-0 truncate font-mono text-xs font-medium text-ink">
          {service}
        </span>
        <span className="shrink-0 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          {rollingId ? "rolling back" : `on ${deployed?.label ?? "nothing"}`}
        </span>
      </div>

      <div className="relative">
        <svg
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          aria-hidden
          className="block w-full"
        >
          <path
            d={ARC}
            fill="none"
            strokeWidth="2"
            strokeLinecap="round"
            className="stroke-hairline-strong"
          />
          {versions.map((version, index) => {
            const angle = angleAt(index, count);
            return (
              <circle
                key={version.id}
                cx={xAt(angle)}
                cy={yAt(angle)}
                r="3.5"
                className={DOT_FILL[version.status]}
              />
            );
          })}
          <motion.circle
            cx={markerX}
            cy={markerY}
            r="9"
            className="fill-cobalt-bright opacity-20"
          />
          <motion.circle
            cx={markerX}
            cy={markerY}
            r="4.5"
            className="fill-cobalt-bright"
          />
        </svg>

        <ul
          role="listbox"
          aria-label={`${service} versions`}
          className="absolute inset-0 m-0 list-none p-0"
        >
          {versions.map((version, index) => {
            const angle = angleAt(index, count);
            const picked = version.id === chosenId;
            return (
              <li
                key={version.id}
                id={`${baseId}-node-${version.id}`}
                role="option"
                aria-selected={picked}
                aria-describedby={picked && armed ? copyId : undefined}
                tabIndex={version.id === tabbable ? 0 : -1}
                aria-label={`${version.label}, ${version.status}${version.note ? `, ${version.note}` : ""}.${version.id === deployedId ? " Deployed." : ""}${index === count - 1 ? " Frontier." : ""}`}
                onFocus={() => setFocusId(version.id)}
                onClick={() => choose(index)}
                onKeyDown={(event) => onNodeKeyDown(event, index)}
                style={{
                  left: `${r3((xAt(angle) / VIEW_W) * 100)}%`,
                  top: `${r3((yAt(angle) / VIEW_H) * 100)}%`,
                }}
                className={cn(
                  "absolute flex size-6 -translate-x-1/2 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full",
                  focusRing,
                )}
              >
                {picked ? (
                  motionSafe ? (
                    <motion.span
                      aria-hidden
                      layoutId={`${baseId}-caret`}
                      className="size-4 rounded-full border-2 border-ink"
                      transition={springs.snap}
                    />
                  ) : (
                    <span
                      aria-hidden
                      className="size-4 rounded-full border-2 border-ink"
                    />
                  )
                ) : null}
              </li>
            );
          })}
        </ul>
      </div>

      <div
        aria-hidden
        className="flex items-baseline justify-between gap-2 font-mono text-[10px] text-ink-3 tabular-nums"
      >
        <span className="truncate">{versions[0]?.label ?? "—"}</span>
        <span className="truncate">frontier {frontier?.label ?? "—"}</span>
      </div>

      <dl className="grid grid-cols-[minmax(0,4.5rem)_minmax(0,1fr)] gap-x-2 gap-y-0.5 font-mono text-[11px]">
        <dt className="text-ink-3">deployed</dt>
        <dd className="flex min-w-0 items-baseline gap-1.5">
          <span className="truncate text-ink">{deployed?.label ?? "none"}</span>
          <span
            className={cn(
              "shrink-0",
              STATUS_TEXT[deployed?.status ?? "unknown"],
            )}
          >
            {deployed?.status ?? "unknown"}
          </span>
        </dd>
        <dt className="text-ink-3">chosen</dt>
        <dd className="flex min-w-0 items-baseline gap-1.5">
          <span className="truncate text-ink">{chosen?.label ?? "none"}</span>
          <span
            className={cn("shrink-0", STATUS_TEXT[chosen?.status ?? "unknown"])}
          >
            {chosen?.status ?? "unknown"}
          </span>
        </dd>
        {chosen?.note ? <dt className="text-ink-3">note</dt> : null}
        {chosen?.note ? (
          <dd className="leading-snug text-ink-2">{chosen.note}</dd>
        ) : null}
      </dl>

      {/* Measured, never reserved: the wrapper holds nothing at all until the
          row exists, then glides to the height the row reports. */}
      <motion.div
        className="overflow-clip [contain:paint]"
        initial={false}
        animate={{ height: armed ? rowHeight : 0 }}
        transition={glide}
      >
        <AnimatePresence initial={false}>
          {armed && chosen ? (
            <motion.div
              key={chosen.id}
              ref={setRowNode}
              className="flex flex-col gap-2 rounded-2 border border-hairline-strong bg-surface-0 p-2"
              initial={{ opacity: 0, y: motionSafe ? -distances.nudge : 0 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={motionSafe ? springs.snap : fade}
            >
              <p
                id={copyId}
                className="font-mono text-[11px] leading-snug text-ink-2"
              >
                {service} leaves {deployed?.label ?? "nothing"} for{" "}
                {chosen.label}, marked {chosen.status}.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  ref={setConfirmNode}
                  type="button"
                  // aria-disabled, never `disabled`: a control that loses its
                  // focusability mid-press drops the keyboard on the body.
                  aria-disabled={rollingId !== null}
                  onClick={start}
                  className={cn(
                    "flex h-8 items-center rounded-2 bg-cobalt-wash px-3 font-mono text-[11px] font-medium text-cobalt-bright transition-colors hover:bg-accent aria-disabled:opacity-50",
                    focusRing,
                  )}
                >
                  {rollingId ? "Rolling back" : action}
                </button>
                <button
                  type="button"
                  onClick={cancel}
                  className={cn(
                    "flex h-8 items-center rounded-2 border border-hairline-strong px-3 font-mono text-[11px] font-medium text-ink-2 transition-colors hover:bg-accent",
                    focusRing,
                  )}
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </motion.div>

      <span role="status" aria-live="polite" className="sr-only">
        {spoken}
      </span>
    </div>
  );
}
