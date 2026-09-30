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

export type HealthStatus = "waiting" | "running" | "pass" | "fail";

export type HealthProbe = {
  id: string;
  /** The probe itself, printed first: "GET /healthz". */
  name: string;
  /** What it was pointed at: "gate-relay-1". */
  target: string;
  status: HealthStatus;
  /** How long the probe took; printed once it has settled. */
  latencyMs?: number;
  /** What came back: "200 OK", "503". */
  response?: string;
  /** One short line naming what happened, printed in the body. */
  detail?: string;
};

export type HealthSummary = {
  passed: number;
  failed: number;
  running: number;
  waiting: number;
  settled: number;
  total: number;
};

export type HealthCheckProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The checks, in run order. */
  checks: HealthProbe[];
  /** Controlled set of expanded check ids. */
  open?: string[];
  /** Initial expanded set for uncontrolled usage. @default [] */
  defaultOpen?: string[];
  /** Fires from the press or key that folded or unfolded a check. */
  onOpenChange?: (ids: string[]) => void;
  /** The whole reading — a state, so it also fires on the first commit. */
  onSummaryChange?: (summary: HealthSummary) => void;
  /** Fires when a row is activated by pointer or keyboard. */
  onCheckSelect?: (id: string) => void;
  /** Renders every latency, so a host changes units in one place. */
  formatMs?: (ms: number) => string;
  /** Names the list for assistive technology. @default "Health checks" */
  label?: string;
  className?: string;
};

const STATUS_TEXT: Record<HealthStatus, string> = {
  waiting: "text-ink-3",
  running: "text-cobalt-bright",
  pass: "text-success",
  fail: "text-danger",
};

const formatDuration = (ms: number): string =>
  ms >= 1000
    ? `${(Math.round(ms) / 1000).toFixed(2)} s`
    : `${Math.round(ms)} ms`;

/** Spoken units are words, not abbreviations, and never a raw float. */
const msPhrase = (ms: number): string => {
  if (ms >= 1000) {
    const seconds = Math.round(ms / 100) / 10;
    return `${seconds} ${seconds === 1 ? "second" : "seconds"}`;
  }
  const whole = Math.round(ms);
  return `${whole} ${whole === 1 ? "millisecond" : "milliseconds"}`;
};

const checkPhrase = (count: number): string =>
  `${count} ${count === 1 ? "check" : "checks"}`;

/** One sentence per row, so a failed probe says so rather than turning red. */
const readingOf = (check: HealthProbe): string => {
  const took =
    check.latencyMs === undefined ? "no reading" : msPhrase(check.latencyMs);
  if (check.status === "fail")
    return `failed after ${took}${check.response ? `, ${check.response}` : ""}`;
  if (check.status === "pass") return `passed in ${took}`;
  return check.status === "running" ? "is running" : "has not run yet";
};

const focusRing =
  "outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring";

/**
 * A wait turns at a constant rate: a spring would imply the probe is nearly
 * finished, which the list has no way of knowing. A settled check stamps on
 * `snap` from scale 1.06 — one crisp arrival, never `recoil`, because a failure
 * does not get to bounce twice — and the tick draws its `pathLength` in a square
 * viewBox carrying no `vector-effect`, so the dash the browser measures is the
 * dash the path is drawn in.
 */
function StatusGlyph({
  status,
  motionSafe,
}: {
  status: HealthStatus;
  motionSafe: boolean;
}) {
  if (status === "waiting")
    return (
      <span
        aria-hidden
        className="size-3.5 shrink-0 rounded-full border-2 border-dashed border-ink-3/60"
      />
    );

  if (status === "running")
    return (
      <motion.svg
        viewBox="0 0 16 16"
        aria-hidden
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        className="size-3.5 shrink-0 text-cobalt-bright"
        style={{ originX: 0.5, originY: 0.5 }}
        animate={motionSafe ? { rotate: 360 } : { rotate: 0 }}
        transition={
          motionSafe
            ? { duration: 0.9, ease: easings.linear, repeat: Infinity }
            : { duration: 0 }
        }
      >
        <circle cx="8" cy="8" r="6" strokeOpacity="0.25" />
        <path d="M8 2a6 6 0 0 1 6 6" strokeLinecap="round" />
      </motion.svg>
    );

  const failed = status === "fail";
  return (
    <motion.svg
      key={status}
      viewBox="0 0 16 16"
      aria-hidden
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn(
        "size-3.5 shrink-0",
        failed ? "text-danger" : "text-success",
      )}
      style={{ originX: 0.5, originY: 0.5 }}
      initial={{ scale: motionSafe ? 1.06 : 1, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={
        motionSafe
          ? springs.snap
          : { duration: durations.fast, ease: easings.enter }
      }
    >
      {failed ? (
        <>
          <path d="m4.5 4.5 7 7" />
          <path d="m11.5 4.5-7 7" />
        </>
      ) : (
        <motion.path
          d="M3.5 8.5 6.5 11.5 12.5 4.5"
          initial={{ pathLength: motionSafe ? 0 : 1 }}
          animate={{ pathLength: 1 }}
          transition={motionSafe ? springs.flick : { duration: 0 }}
        />
      )}
    </motion.svg>
  );
}

function CheckRow({
  check,
  baseId,
  open,
  tabbable,
  motionSafe,
  formatMs,
  onToggle,
  onFocus,
  onKeyDown,
}: {
  check: HealthProbe;
  baseId: string;
  open: boolean;
  tabbable: boolean;
  motionSafe: boolean;
  formatMs: (ms: number) => string;
  onToggle: () => void;
  onFocus: () => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => void;
}) {
  const bodyId = `${baseId}-body-${check.id}`;
  const [bodyNode, setBodyNode] = React.useState<HTMLDListElement | null>(null);
  const [bodyHeight, setBodyHeight] = React.useState(0);

  React.useEffect(() => {
    if (!bodyNode || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setBodyHeight(Math.round(entry.contentRect.height));
    });
    observer.observe(bodyNode);
    return () => observer.disconnect();
  }, [bodyNode]);

  const settled = check.status === "pass" || check.status === "fail";
  const glide = motionSafe
    ? springs.glide
    : { duration: durations.base, ease: easings.enter };

  return (
    <li className="rounded-2 border border-hairline bg-surface-0">
      <button
        type="button"
        id={`${baseId}-row-${check.id}`}
        aria-expanded={open}
        aria-controls={bodyId}
        aria-label={`${check.name} on ${check.target} ${readingOf(check)}.`}
        tabIndex={tabbable ? 0 : -1}
        onFocus={onFocus}
        onClick={onToggle}
        onKeyDown={onKeyDown}
        className={cn(
          "flex w-full flex-col gap-0.5 rounded-2 px-2 py-1.5 text-left transition-colors hover:bg-accent",
          focusRing,
        )}
      >
        <span className="flex w-full items-center gap-1.5">
          <StatusGlyph status={check.status} motionSafe={motionSafe} />
          <span className="min-w-0 flex-1 truncate font-mono text-[11px] font-medium text-ink">
            {check.name}
          </span>
          <span
            className={cn(
              "shrink-0 font-mono text-[10px] tracking-[0.08em] uppercase",
              STATUS_TEXT[check.status],
            )}
          >
            {check.status}
          </span>
          <span className="w-14 shrink-0 text-right font-mono text-[11px] text-ink-2 tabular-nums">
            {settled && check.latencyMs !== undefined
              ? formatMs(check.latencyMs)
              : "—"}
          </span>
        </span>
        <span className="w-full truncate pl-5 font-mono text-[10px] text-ink-3">
          {check.target}
        </span>
      </button>

      {/* Measured, never reserved: the wrapper holds nothing at all until the
          body exists, then glides to the height the body reports. */}
      <motion.div
        id={bodyId}
        className="overflow-clip [contain:paint]"
        initial={false}
        animate={{ height: open ? bodyHeight : 0 }}
        transition={glide}
      >
        <AnimatePresence initial={false}>
          {open ? (
            <motion.dl
              key="body"
              ref={setBodyNode}
              className="grid grid-cols-[minmax(0,4rem)_minmax(0,1fr)] gap-x-2 gap-y-0.5 border-t border-hairline px-2 py-1.5 font-mono text-[10px]"
              initial={{ opacity: 0, y: motionSafe ? -distances.nudge : 0 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={glide}
            >
              <dt className="text-ink-3">host</dt>
              <dd className="truncate text-ink">{check.target}</dd>
              <dt className="text-ink-3">answer</dt>
              <dd
                className={cn(
                  "truncate",
                  check.status === "fail" ? "text-danger" : "text-ink",
                )}
              >
                {check.response ?? "nothing yet"}
              </dd>
              {check.detail ? <dt className="text-ink-3">note</dt> : null}
              {check.detail ? (
                <dd className="leading-snug text-ink-2">{check.detail}</dd>
              ) : null}
            </motion.dl>
          ) : null}
        </AnimatePresence>
      </motion.div>
    </li>
  );
}

/**
 * The list a deploy has to get through before anyone believes it. Every state
 * arrives through `checks`, so the list never invents time: a running probe
 * turns its ring at a constant rate, a pass draws its tick on `flick`, and a
 * failure stamps its cross on `snap` and unfolds its own detail at a
 * ResizeObserver-measured height on `glide`.
 *
 * Under the head a rule fills to the share of checks that have settled and
 * reads itself out as a sentence, while the counts beside it sit in one grid
 * cell and cross-fade, so a fast sequence can never blank the number. An
 * uncontrolled list opens a check the moment it settles to `fail`, because the
 * one thing a failed check must not do is stay shut; a controlled host is left
 * alone, since a component may not call a parent's setter during render.
 *
 * The checks are an `<ol role="list">` under a roving tabindex — Arrow Up and
 * Down step, Home and End jump, Enter and Space fold — and each row names itself
 * as one sentence. Under reduced motion the ring holds still and the row prints
 * the word "running", while ticks and crosses still appear at full size,
 * because a settled check is information rather than flourish.
 */
export function HealthCheck({
  ref,
  checks,
  open,
  defaultOpen,
  onOpenChange,
  onSummaryChange,
  onCheckSelect,
  formatMs = formatDuration,
  label = "Health checks",
  className,
}: HealthCheckProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();

  const [ownOpen, setOwnOpen] = React.useState<string[]>(defaultOpen ?? []);
  const opened = open ?? ownOpen;
  const [focusId, setFocusId] = React.useState<string | null>(null);
  const [spoken, setSpoken] = React.useState("");

  const total = checks.length;
  const passed = checks.filter((check) => check.status === "pass").length;
  const failed = checks.filter((check) => check.status === "fail").length;
  const running = checks.filter((check) => check.status === "running").length;
  const waiting = checks.filter((check) => check.status === "waiting").length;
  const settled = passed + failed;

  // A settled failure is an event, so the freeze starts on the sequence as it
  // stands and speaks nothing on the first commit. Compared in render, which is
  // the point: this pass reads the NEW sentence, not the one it replaced.
  const signature = checks.map((check) => `${check.id}=${check.status}`).join();
  const [anchor, setAnchor] = React.useState(signature);
  if (anchor !== signature) {
    const before = new Map(
      anchor.split(",").map((pair) => pair.split("=") as [string, string]),
    );
    const fell = checks.filter(
      (check) => check.status === "fail" && before.get(check.id) !== "fail",
    );
    const last = fell[fell.length - 1];
    setAnchor(signature);
    if (last) {
      setSpoken(
        `${last.name} on ${last.target} failed${last.response ? `, ${last.response}` : ""}.`,
      );
      // Only an uncontrolled list may open itself: calling a host's setter from
      // render is never allowed, so a controlled one keeps its own set.
      if (open === undefined) {
        setOwnOpen((current) =>
          current.includes(last.id) ? current : [...current, last.id],
        );
      }
    } else if (settled === total && total > 0) {
      setSpoken(
        `All ${checkPhrase(total)} settled, ${passed} passed and ${failed} failed.`,
      );
    }
  }

  const summaryRef = React.useRef(onSummaryChange);
  React.useEffect(() => {
    summaryRef.current = onSummaryChange;
  });
  // The summary is a reading, not an event: a host that mounts mid-run sees the
  // same numbers the list does, from the first commit.
  React.useEffect(() => {
    summaryRef.current?.({ passed, failed, running, waiting, settled, total });
  }, [passed, failed, running, waiting, settled, total]);

  const toggle = (id: string) => {
    const next = opened.includes(id)
      ? opened.filter((entry) => entry !== id)
      : [...opened, id];
    if (open === undefined) setOwnOpen(next);
    onOpenChange?.(next);
    onCheckSelect?.(id);
  };

  const focusRow = (index: number) => {
    const target = checks[Math.min(checks.length - 1, Math.max(0, index))];
    if (!target) return;
    setFocusId(target.id);
    document.getElementById(`${baseId}-row-${target.id}`)?.focus();
  };

  const onRowKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusRow(index + 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      focusRow(index - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      focusRow(0);
    } else if (event.key === "End") {
      event.preventDefault();
      focusRow(checks.length - 1);
    }
  };

  const tabbable =
    focusId && checks.some((check) => check.id === focusId)
      ? focusId
      : (checks[0]?.id ?? "");
  const share = total > 0 ? Number((settled / total).toFixed(6)) : 0;
  const tail =
    settled === 0
      ? ""
      : failed === 0
        ? ", all passed"
        : `, ${passed} passed and ${failed} failed`;

  return (
    <div
      ref={ref}
      role="group"
      aria-label={label}
      className={cn(
        "flex w-full flex-col gap-2 overflow-clip rounded-3 border border-hairline bg-surface-1 p-2.5 [contain:paint]",
        className,
      )}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="min-w-0 truncate font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          {label}
        </span>
        {/* Both readings share one cell and cross-fade: a count that swapped
            through mode="wait" would blank between two quick settles. */}
        <span className="grid shrink-0 justify-items-end">
          <AnimatePresence initial={false}>
            <motion.span
              key={`${settled}-${failed}`}
              className={cn(
                "col-start-1 row-start-1 font-mono text-[11px] tabular-nums",
                failed > 0 ? "text-danger" : "text-ink",
              )}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={{ duration: durations.fast, ease: easings.enter }}
            >
              {settled}/{total}
              {failed > 0 ? ` · ${failed} failed` : ""}
            </motion.span>
          </AnimatePresence>
        </span>
      </div>

      <div
        role="meter"
        aria-label="Checks settled"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={settled}
        aria-valuetext={`${settled} of ${checkPhrase(total)} settled${tail}.`}
        className="relative h-1 w-full overflow-clip rounded-full bg-hairline-strong [contain:paint]"
      >
        <motion.span
          aria-hidden
          className={cn(
            "absolute inset-y-0 left-0 w-full origin-left rounded-full transition-colors",
            failed > 0 ? "bg-danger" : "bg-cobalt-bright",
          )}
          initial={{ scaleX: 0 }}
          animate={{ scaleX: share }}
          transition={
            motionSafe
              ? springs.glide
              : { duration: durations.base, ease: easings.enter }
          }
        />
      </div>

      <ol role="list" className="flex flex-col gap-1">
        {checks.map((check, index) => (
          <CheckRow
            key={check.id}
            check={check}
            baseId={baseId}
            open={opened.includes(check.id)}
            tabbable={check.id === tabbable}
            motionSafe={motionSafe}
            formatMs={formatMs}
            onToggle={() => toggle(check.id)}
            onFocus={() => setFocusId(check.id)}
            onKeyDown={(event) => onRowKeyDown(event, index)}
          />
        ))}
      </ol>

      <span role="status" aria-live="polite" className="sr-only">
        {spoken}
      </span>
    </div>
  );
}
