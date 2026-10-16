"use client";

import * as React from "react";

import { Check, RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import { FailedCharge } from "@/registry/ui/failed-charge";

export const tweaks = defineTweaks({
  bandStyle: {
    kind: "choice",
    label: "Band",
    default: "edge",
    options: ["edge", "wash", "outline"],
    names: { edge: "Edge", wash: "Wash", outline: "Outline" },
  },
  cornerRadius: {
    kind: "range",
    label: "Corners",
    default: 10,
    min: 0,
    max: 16,
    step: 2,
    unit: "px",
  },
  tone: {
    kind: "choice",
    label: "Tone",
    default: "soft",
    options: ["soft", "strong", "mono"],
    names: { soft: "Soft", strong: "Strong", mono: "Mono" },
  },
});

const CHARGE_MS = 1200;
const REARM_MS = 4500;
const PROJECTS = [
  { name: "Harbour survey", meta: "12 renders · edited 2h ago" },
  { name: "Atrium walkthrough", meta: "4K · queued" },
  { name: "Lobby stills", meta: "8 views · draft" },
];

/** The top of a Fernworks workspace: a slim bar and the page under it. */
function AppFrame({
  paid,
  children,
}: {
  paid: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex max-h-[13.5rem] w-full flex-col overflow-hidden rounded-3 border border-hairline bg-background">
      <div className="flex h-9 shrink-0 items-center justify-between gap-3 border-b border-hairline px-3">
        <span className="flex min-w-0 items-center gap-2 text-[12px] font-medium text-foreground">
          <span
            aria-hidden
            className="size-3.5 shrink-0 rounded-[4px] bg-cobalt-bright"
          />
          <span className="truncate">Fernworks</span>
        </span>
        {paid ? (
          <span className="inline-flex h-5 shrink-0 items-center gap-1 rounded-full bg-[color-mix(in_oklab,var(--success)_13%,transparent)] px-2 text-[11px] text-success">
            <Check aria-hidden className="size-3" />
            October paid
          </span>
        ) : (
          <span className="shrink-0 font-mono text-[10px] tracking-[0.06em] text-ink-3 uppercase">
            Billing
          </span>
        )}
      </div>
      <div className="flex flex-1 [scrollbar-width:thin] flex-col gap-3 overflow-y-auto overscroll-contain p-3">
        {children}
        <div aria-hidden className="flex flex-col gap-1.5">
          <p className="text-[12px] font-medium text-foreground">Projects</p>
          {PROJECTS.map((p) => (
            <div
              key={p.name}
              className="flex items-baseline justify-between gap-3 rounded-2 border border-hairline bg-card px-2.5 py-1.5"
            >
              <span className="truncate text-[12px] text-foreground">
                {p.name}
              </span>
              <span className="shrink-0 text-[11px] text-ink-3">{p.meta}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * October's charge on the Fernworks workspace was declined two days ago.
 * The first retry comes back with insufficient funds, so the grace days
 * show; the next one goes through and the banner folds away.
 */
export function FailedChargeDemo({
  chrome = true,
  // The banner is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [round, setRound] = React.useState(0);
  const [paid, setPaid] = React.useState(false);
  const [note, setNote] = React.useState<string | null>(null);
  const [attempts, setAttempts] = React.useState(1);
  const [failNext, setFailNext] = React.useState(false);
  const tries = React.useRef(0);
  const failRef = React.useRef(false);
  const timers = React.useRef<number[]>([]);

  React.useEffect(() => {
    const list = timers.current;
    return () => {
      for (const t of list) window.clearTimeout(t);
      list.length = 0;
    };
  }, []);

  const later = (fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms));
  };

  const reset = () => {
    for (const t of timers.current) window.clearTimeout(t);
    timers.current = [];
    tries.current = 0;
    failRef.current = false;
    setFailNext(false);
    setPaid(false);
    setAttempts(1);
    setNote(null);
    setRound((r) => r + 1);
  };

  const surface = (
    <FailedCharge
      key={round}
      onRetry={() =>
        new Promise<void>((resolve, reject) => {
          const first = tries.current === 0;
          tries.current += 1;
          const fail = first || failRef.current;
          failRef.current = false;
          setFailNext(false);
          setNote("retrying");
          later(() => {
            if (fail) {
              setAttempts((a) => a + 1);
              setNote("declined again");
              reject(new Error("Insufficient funds."));
              return;
            }
            setNote("paid");
            resolve();
          }, CHARGE_MS);
        })
      }
      onUpdateMethod={(choice) =>
        new Promise((resolve) => {
          setNote("method updated");
          later(
            () =>
              resolve(
                choice.kind === "saved"
                  ? choice.method
                  : {
                      id: "card-new",
                      label: `card ending ${choice.number.slice(-4)}`,
                      kind: "card",
                    },
              ),
            600,
          );
        })
      }
      onDismiss={(why) => {
        setNote(why === "paid" ? "paid · banner folded" : "dismissed");
        if (why === "paid") setPaid(true);
        // The gallery card has no Reset, so it sets the scene again.
        if (!chrome) later(reset, REARM_MS);
      }}
      {...values}
    />
  );

  const frame = <AppFrame paid={paid}>{surface}</AppFrame>;
  if (!chrome) return <div className="w-full max-w-2xl">{frame}</div>;

  const button = cn(
    "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none",
    "hover:bg-surface-2 hover:text-foreground",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
  );

  return (
    <div className="flex w-full max-w-2xl flex-col gap-4">
      {frame}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-pressed={failNext}
          onClick={() => {
            failRef.current = !failNext;
            setFailNext((v) => !v);
          }}
          className={cn(
            button,
            failNext && "border-danger/50 text-danger hover:text-danger",
          )}
        >
          Fail next retry
        </button>
        <button type="button" onClick={reset} className={button}>
          <RotateCcw aria-hidden className="size-3.5" />
          Reset
        </button>
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">{note ?? "declined"}</span> ·{" "}
        {attempts === 1 ? "1 attempt" : `${attempts} attempts`}
      </p>
    </div>
  );
}
