"use client";

import * as React from "react";

import { TapReader, type TapReaderStatus } from "@/registry/ui/tap-reader";

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

/** Three sales that cycle on each reset. */
const SALES = [
  { reference: "WL-2041", amount: 24.6 },
  { reference: "WL-2042", amount: 8.75 },
  { reference: "WL-2043", amount: 61.2 },
];

/** How long the acquirer takes to answer a tap. */
const DECISION_MS = 1400;

const CONTROL =
  "flex h-8 shrink-0 items-center rounded-2 border px-3 text-xs font-medium transition-colors outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

const ANSWERS = [
  { value: true, label: "Approve" },
  { value: false, label: "Decline" },
];

export function TapReaderDemo() {
  const [status, setStatus] = React.useState<TapReaderStatus>("ready");
  const [approve, setApprove] = React.useState(true);
  const [index, setIndex] = React.useState(0);
  const sale = SALES[index % SALES.length] ?? { reference: "", amount: 0 };

  // The armed answer is read by a timer, so it is mirrored rather than listed
  // as a dependency — re-arming mid-read must not restart the acquirer's clock.
  const approveRef = React.useRef(approve);
  React.useEffect(() => {
    approveRef.current = approve;
  });

  React.useEffect(() => {
    if (status !== "reading") return;
    let timer = 0;
    const start = () => {
      timer = window.setTimeout(() => {
        setStatus(approveRef.current ? "approved" : "declined");
      }, DECISION_MS);
    };
    // A reader nobody is watching is not deciding anything: the clock stops
    // with the tab and starts again from the top when it comes back.
    const onVisibility = () => {
      window.clearTimeout(timer);
      if (!document.hidden) start();
    };
    if (!document.hidden) start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [status]);

  const printed = currency.format(sale.amount);
  const line =
    status === "reading"
      ? "Reading"
      : `${status[0]?.toUpperCase()}${status.slice(1)} · ${printed}`;

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <TapReader
        label="Waylight Pay"
        reference={sale.reference}
        amount={sale.amount}
        status={status}
        onTap={() => setStatus("reading")}
        onReset={() => {
          setStatus("ready");
          setIndex((current) => current + 1);
        }}
      />

      <div
        role="radiogroup"
        aria-label="Acquirer answer"
        className="flex items-center gap-1.5"
      >
        {ANSWERS.map((option) => (
          <button
            key={option.label}
            type="button"
            role="radio"
            aria-checked={approve === option.value}
            tabIndex={approve === option.value ? 0 : -1}
            onClick={() => setApprove(option.value)}
            onKeyDown={(event) => {
              if (!event.key.startsWith("Arrow")) return;
              event.preventDefault();
              setApprove(!option.value);
              const sibling =
                event.currentTarget.nextElementSibling ??
                event.currentTarget.previousElementSibling;
              if (sibling instanceof HTMLElement) sibling.focus();
            }}
            className={`${CONTROL} ${
              approve === option.value
                ? "border-cobalt-bright bg-cobalt-wash text-foreground"
                : "border-hairline-strong hover:bg-accent"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">{line}</span>
      </p>
    </div>
  );
}
