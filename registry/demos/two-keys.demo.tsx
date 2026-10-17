"use client";

import * as React from "react";

import { KeyRound, MessageSquareX, RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  defaultTwoKeysApprovers,
  defaultTwoKeysNow,
  TwoKeys,
  type TwoKeysApprover,
  type TwoKeysStatus,
} from "@/registry/ui/two-keys";

export const tweaks = defineTweaks({
  switchStyle: {
    kind: "choice",
    label: "Switch",
    default: "key",
    options: ["key", "lever", "dial"],
    names: { key: "Key", lever: "Lever", dial: "Dial" },
  },
  windowLength: {
    kind: "range",
    label: "Window",
    default: 60,
    min: 15,
    max: 120,
    step: 15,
    unit: "s",
  },
  accent: {
    kind: "choice",
    label: "Accent",
    default: "var(--accent-bright)",
    options: [
      "var(--accent-bright)",
      "var(--success)",
      "oklch(from var(--accent-bright) l c 300)",
      "var(--signal)",
    ],
    names: {
      "var(--accent-bright)": "Cobalt",
      "var(--success)": "Moss",
      "oklch(from var(--accent-bright) l c 300)": "Plum",
      "var(--signal)": "Mint",
    },
  },
});

/**
 * Gaugeworks billing: the agent wants to refund £4,820.00 to Basinworks
 * Supply, over the single-approver limit. You are Mara, the finance lead;
 * Theo, the support manager, holds the other key.
 */
export function TwoKeysDemo({
  chrome = true,
  // The card is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [approvers, setApprovers] = React.useState<TwoKeysApprover[]>(
    defaultTwoKeysApprovers,
  );
  const [turned, setTurned] = React.useState(false);
  const [now, setNow] = React.useState(defaultTwoKeysNow);
  const [status, setStatus] = React.useState<TwoKeysStatus>("open");
  const [round, setRound] = React.useState(0);
  const [inView, setInView] = React.useState(false);
  const frame = React.useRef<HTMLDivElement | null>(null);
  const t0 = React.useRef<number | null>(null);
  const windowMs = (values.windowLength ?? 60) * 1000;

  const clock = React.useCallback(() => {
    if (t0.current === null) t0.current = performance.now();
    return defaultTwoKeysNow + Math.round(performance.now() - t0.current);
  }, []);

  React.useEffect(() => {
    const node = frame.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      ([entry]) => setInView(!!entry?.isIntersecting),
      { threshold: 0.3 },
    );
    io.observe(node);
    return () => io.disconnect();
  }, []);

  const theo = approvers.find((a) => a.id === "theo");
  const theoTurned = theo?.turnedAt != null;

  const setTheo = React.useCallback(
    (patch: Partial<TwoKeysApprover>) => {
      const at = clock();
      setNow(at);
      setApprovers((list) =>
        list.map((a) => (a.id === "theo" ? { ...a, ...patch } : a)),
      );
    },
    [clock],
  );

  // Theo turns his key once the card is seen; the gallery card then turns
  // Mara's a beat later so the bar closes once.
  const [tour, setTour] = React.useState(0);
  React.useEffect(() => {
    if (!inView || tour >= (chrome ? 1 : 2)) return;
    const t = window.setTimeout(
      () => {
        if (tour === 0) setTheo({ turnedAt: clock() });
        else setTurned(true);
        setTour((n) => n + 1);
      },
      tour === 0 ? 1200 : 1500,
    );
    return () => window.clearTimeout(t);
  }, [inView, tour, chrome, clock, setTheo]);

  // The host clears a lone key the window has run out on.
  React.useEffect(() => {
    if (!theoTurned || turned || theo?.turnedAt == null) return;
    const left = theo.turnedAt + windowMs - clock();
    const t = window.setTimeout(
      () => setTheo({ turnedAt: null }),
      Math.max(0, left + 300),
    );
    return () => window.clearTimeout(t);
  }, [theoTurned, turned, theo?.turnedAt, windowMs, clock, setTheo]);

  const surface = (
    <TwoKeys
      key={round}
      approvers={approvers}
      currentUser="mara"
      turned={turned}
      onTurnKey={(next) => {
        setNow(clock());
        setTurned(next);
      }}
      onReject={(note) => {
        const at = clock();
        setNow(at);
        setApprovers((list) =>
          list.map((a) =>
            a.id === "mara" ? { ...a, rejected: { at, note } } : a,
          ),
        );
      }}
      onRun={() => setStatus("done")}
      now={now}
      status={status}
      {...values}
    />
  );

  if (!chrome)
    return (
      <div ref={frame} className="w-full">
        {surface}
      </div>
    );

  const rejecter = approvers.find((a) => a.rejected);
  const line =
    status === "done"
      ? "running · refund to basinworks supply"
      : rejecter
        ? `rejected by ${rejecter.name.toLowerCase()}`
        : turned && theoTurned
          ? "unlocked · ready to run"
          : theoTurned
            ? "theo turned · waiting for mara ilves"
            : turned
              ? "you turned · waiting for theo brandt"
              : `waiting for both keys · ${values.windowLength ?? 60} s window`;

  const button = cn(
    "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none",
    "hover:bg-surface-2 hover:text-foreground",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
  );

  return (
    <div ref={frame} className="flex w-full max-w-2xl flex-col gap-4">
      <p className="text-[13px] text-ink-2">
        Gaugeworks billing · approvals · you are Mara Ilves
      </p>
      {surface}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-pressed={theoTurned}
          onClick={() => setTheo({ turnedAt: theoTurned ? null : clock() })}
          className={button}
        >
          <KeyRound aria-hidden className="size-3.5" />
          {theoTurned ? "Theo turns back" : "Theo turns"}
        </button>
        <button
          type="button"
          aria-pressed={!!theo?.rejected}
          onClick={() =>
            setTheo({
              turnedAt: null,
              rejected: theo?.rejected
                ? null
                : {
                    at: clock(),
                    note: "Store credit already went out on this order.",
                  },
            })
          }
          className={button}
        >
          <MessageSquareX aria-hidden className="size-3.5" />
          {theo?.rejected ? "Undo reject" : "Theo rejects"}
        </button>
        <button
          type="button"
          onClick={() => {
            t0.current = null;
            setApprovers(defaultTwoKeysApprovers);
            setTurned(false);
            setNow(defaultTwoKeysNow);
            setStatus("open");
            setRound((r) => r + 1);
          }}
          className={button}
        >
          <RotateCcw aria-hidden className="size-3.5" />
          Reset
        </button>
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">{line}</span>
        {" · gaugeworks"}
      </p>
    </div>
  );
}
