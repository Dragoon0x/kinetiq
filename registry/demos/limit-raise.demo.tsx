"use client";

import * as React from "react";

import { LimitRaise, type LimitRaiseStatus } from "@/registry/ui/limit-raise";

const OPENING_LIMIT = 4000;
const USED = 2740;
const CEILING = 10000;
const STEP = 500;
/** The issuer's rule, so the demo can show both verdicts. */
const APPROVE_UP_TO = 8000;
const REVIEW_MS = 1800;

const MONEY = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const subscribeVisibility = (onChange: () => void) => {
  if (typeof document === "undefined") return () => {};
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
};
const getVisible = () => typeof document === "undefined" || !document.hidden;
const getServerVisible = () => true;

const BUTTON =
  "inline-flex h-8 w-fit items-center justify-center rounded-2 border border-input bg-surface-1 px-3 text-xs font-medium text-foreground transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50";

export function LimitRaiseDemo() {
  const [limit, setLimit] = React.useState(OPENING_LIMIT);
  const [ask, setAsk] = React.useState(OPENING_LIMIT + STEP);
  const [status, setStatus] = React.useState<LimitRaiseStatus>("idle");
  const visible = React.useSyncExternalStore(
    subscribeVisibility,
    getVisible,
    getServerVisible,
  );

  // The control never invents time — the issuer's beat lives here, in an
  // effect with cleanup, and holds while the tab is hidden rather than
  // deciding unseen.
  React.useEffect(() => {
    if (status !== "requested" || !visible) return;
    const timer = window.setTimeout(() => {
      if (ask <= APPROVE_UP_TO) {
        setLimit(ask);
        setAsk(ask + STEP);
        setStatus("approved");
      } else {
        setStatus("declined");
      }
    }, REVIEW_MS);
    return () => window.clearTimeout(timer);
  }, [status, visible, ask]);

  const available = Math.max(0, limit - USED);
  const line =
    status === "requested"
      ? `under review · ${MONEY.format(ask)}`
      : status === "approved"
        ? `approved · limit ${MONEY.format(limit)}`
        : status === "declined"
          ? `declined · ${MONEY.format(ask)}`
          : `${MONEY.format(available)} available of ${MONEY.format(limit)} | asking ${MONEY.format(ask)}`;

  return (
    <div className="flex w-full max-w-sm flex-col gap-5">
      <LimitRaise
        label="Basin card"
        limit={limit}
        used={USED}
        ceiling={CEILING}
        step={STEP}
        proposed={ask}
        onProposedChange={(next) => {
          setAsk(next);
          // A new ask is a new question; the last verdict no longer applies.
          if (status !== "idle") setStatus("idle");
        }}
        status={status}
        onRequest={() => setStatus("requested")}
      />

      <button
        type="button"
        className={BUTTON}
        disabled={
          status === "idle" &&
          limit === OPENING_LIMIT &&
          ask === OPENING_LIMIT + STEP
        }
        onClick={() => {
          setLimit(OPENING_LIMIT);
          setAsk(OPENING_LIMIT + STEP);
          setStatus("idle");
        }}
      >
        Reset
      </button>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Basin card{" "}
        <span className="text-cobalt-bright tabular-nums">{line}</span>
      </p>
    </div>
  );
}
