"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  defaultRefundMethods,
  defaultReturnDropoffs,
  defaultReturnNow,
  defaultReturnOrder,
  defaultReturnReasons,
  refundFor,
  ReturnFlow,
  type ReturnLabelState,
  type ReturnSelection,
} from "@/registry/ui/return-flow";

export const tweaks = defineTweaks({
  print: {
    kind: "choice",
    label: "Print",
    default: "label",
    options: ["label", "qr"],
    names: { label: "Label", qr: "QR code" },
  },
  steps: {
    kind: "choice",
    label: "Steps",
    default: "paged",
    options: ["paged", "inline"],
    names: { paged: "Paged", inline: "One page" },
  },
  reasons: {
    kind: "choice",
    label: "Reasons",
    default: "chips",
    options: ["chips", "rows", "tiles"],
    names: { chips: "Chips", rows: "Rows", tiles: "Tiles" },
  },
});

const STEP_WORDS = ["items", "reason", "refund", "label"];
const DAY_MS = 86_400_000;
const MONTHS = "jan feb mar apr may jun jul aug sep oct nov dec".split(" ");
const WEEKDAYS = "sun mon tue wed thu fri sat".split(" ");
const dropBy = (() => {
  const d = new Date(
    Math.floor(defaultReturnNow / DAY_MS) * DAY_MS + 14 * DAY_MS,
  );
  return `${WEEKDAYS[d.getUTCDay()]} ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
})();

const fresh = (): ReturnSelection => ({
  lines: {},
  method: defaultRefundMethods[0]?.id ?? null,
  dropoff: defaultReturnDropoffs[0]?.id ?? null,
});

const usd = (v: number) => `$${v.toFixed(2)}`;

const BUTTON =
  "inline-flex h-8 items-center rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

/**
 * A Fernworks return: trail runners, a field jacket and two merino tees
 * delivered on 24 September, the watch strap final sale. The label is made
 * in under a second; Fail next makes the next one refuse.
 */
export function ReturnFlowDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [selection, setSelection] = React.useState<ReturnSelection>(fresh);
  const [step, setStep] = React.useState(0);
  const [state, setState] = React.useState<ReturnLabelState>("idle");
  const [torn, setTorn] = React.useState(false);
  const [note, setNote] = React.useState<string | null>(null);
  const [failNext, setFailNext] = React.useState(false);
  const [round, setRound] = React.useState(0);
  const failRef = React.useRef(false);
  const timers = React.useRef(new Set<number>());

  React.useEffect(() => {
    const running = timers.current;
    return () => {
      for (const t of running) window.clearTimeout(t);
      running.clear();
    };
  }, []);

  const refund = refundFor(
    defaultReturnOrder,
    selection,
    defaultReturnReasons,
    defaultRefundMethods,
    defaultReturnDropoffs,
  );
  const paged = values.steps !== "inline";
  const slip = values.print === "qr" ? "code" : "label";

  const flow = (
    <ReturnFlow
      key={round}
      value={selection}
      onValueChange={(next) => {
        setSelection(next);
        setNote(null);
      }}
      step={step}
      onStepChange={setStep}
      state={state}
      onStateChange={setState}
      onCreateLabel={() =>
        new Promise<void>((resolve, reject) => {
          const fail = failRef.current;
          failRef.current = false;
          setFailNext(false);
          const id = window.setTimeout(() => {
            timers.current.delete(id);
            if (fail) {
              setNote("label refused · waylight post is not answering");
              reject(new Error("refused"));
              return;
            }
            resolve();
          }, 900);
          timers.current.add(id);
        })
      }
      onTear={() => setTorn(true)}
      onDownload={() => setNote(`${slip} saved as fw-20418-return.pdf`)}
      onEmail={() => setNote(`${slip} sent to ana@fieldline.example`)}
      onStartOver={() => {
        setTorn(false);
        setNote(null);
      }}
      sound={sound}
      {...values}
    />
  );

  if (!chrome) return <div className="w-full">{flow}</div>;

  const head =
    note ??
    (state === "pending"
      ? `creating ${slip}`
      : state === "ready"
        ? torn
          ? `${slip} torn off · drop by ${dropBy}`
          : `${slip} printed · tear it off`
        : refund.count
          ? `${refund.count} ${refund.count === 1 ? "item" : "items"} · refund ${usd(refund.total)}`
          : paged
            ? `step ${Math.min(step, 2) + 1} of 4 · ${STEP_WORDS[Math.min(step, 2)]}`
            : "nothing picked yet");
  const tail =
    state === "ready" || note
      ? null
      : paged
        ? `step ${Math.min(step, 2) + 1} of 4 · ${STEP_WORDS[Math.min(step, 2)]}`
        : "one page";

  return (
    <div className="flex w-full max-w-6xl flex-col gap-4">
      {flow}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
        <p
          role="status"
          className="min-w-0 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          <span className="text-signal">{head}</span>
          {tail && refund.count ? ` · ${tail}` : null}
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            aria-pressed={failNext}
            onClick={() => {
              const next = !failRef.current;
              failRef.current = next;
              setFailNext(next);
            }}
            className={`${BUTTON} aria-pressed:border-danger/50 aria-pressed:text-danger`}
          >
            Fail next
          </button>
          <button
            type="button"
            onClick={() => {
              for (const t of timers.current) window.clearTimeout(t);
              timers.current.clear();
              failRef.current = false;
              setFailNext(false);
              setSelection(fresh());
              setStep(0);
              setState("idle");
              setTorn(false);
              setNote(null);
              setRound((r) => r + 1);
            }}
            className={BUTTON}
          >
            Reset
          </button>
        </div>
      </div>
    </div>
  );
}
