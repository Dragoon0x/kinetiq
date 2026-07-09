"use client";

import * as React from "react";

import { cn } from "@/registry/lib/utils";
import { GateStepper, type GateStep } from "@/registry/ui/gate-stepper";

/** Fixed calibration readouts — stiffness / damping, indexed and invented. */
const CALIBRATION_ROWS = [
  { label: "GLIDE", value: "300 / 34" },
  { label: "SNAP", value: "640 / 42" },
] as const;

/** The verification sweep — three lines, every tick already drawn. */
const VERIFY_LINES = [
  "RAIL ALIGNED",
  "SPRINGS SEATED",
  "SEALS TORQUED",
] as const;

function IdentifyGate() {
  return (
    <div className="flex h-full flex-col justify-center gap-2">
      <div className="flex items-baseline justify-between gap-3 rounded-3 border border-hairline bg-surface-0 px-3 py-2.5">
        <span className="text-label text-ink-3">UNIT</span>
        <span className="font-mono text-[13px] text-ink tabular-nums">
          KQ-119 &middot; GATE STEPPER
        </span>
      </div>
    </div>
  );
}

function CalibrateGate({
  calibrated,
  onToggle,
}: {
  calibrated: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex h-full flex-col justify-center gap-2">
      {CALIBRATION_ROWS.map((row) => (
        <div
          key={row.label}
          className="flex items-baseline justify-between gap-3 rounded-3 border border-hairline bg-surface-0 px-3 py-2"
        >
          <span className="text-label text-ink-3">{row.label}</span>
          <span className="font-mono text-xs text-signal tabular-nums">
            {row.value}
          </span>
        </div>
      ))}
      {/* The gate's mark — Next refuses until this chip is pressed on. */}
      <button
        type="button"
        aria-pressed={calibrated}
        onClick={onToggle}
        className={cn(
          "mt-1 flex cursor-pointer items-center gap-2 self-start rounded-full border px-3 py-1.5 text-label transition-colors",
          "outline-none focus-visible:ring-2 focus-visible:ring-ring",
          calibrated
            ? "border-signal/60 text-signal"
            : "border-hairline text-ink-2 hover:text-ink",
        )}
      >
        <span
          aria-hidden
          className={cn(
            "size-1.5 shrink-0 rounded-full transition-colors",
            calibrated ? "bg-signal" : "bg-surface-0 ring-1 ring-hairline-strong",
          )}
        />
        MARK CALIBRATED
      </button>
    </div>
  );
}

function VerifyGate() {
  return (
    <ul className="m-0 flex h-full list-none flex-col justify-center gap-2 p-0">
      {VERIFY_LINES.map((line) => (
        <li
          key={line}
          className="flex items-center gap-2.5 rounded-3 border border-hairline bg-surface-0 px-3 py-2"
        >
          <svg
            aria-hidden
            viewBox="0 0 12 12"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-3 shrink-0 text-signal"
          >
            <path d="M2.5 6.5 L5 9 L9.5 3.5" />
          </svg>
          <span className="font-mono text-[11px] tracking-wide text-ink-2">
            {line}
          </span>
        </li>
      ))}
    </ul>
  );
}

function SealGate() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
      <span className="font-mono text-[13px] text-ink tabular-nums">
        RUN 07 &middot; ALL CHECKS PASSED
      </span>
      <span className="text-label text-ink-3">PRESS DONE TO SEAL THE RUN</span>
    </div>
  );
}

/**
 * GateStepper as the KQ-119 commissioning run: four gates passed in order,
 * framed by the bench bezel. CALIBRATE holds its own mark — Next refuses
 * (headshake, announcement) until the chip is pressed. The status line
 * mirrors every gate; Done stamps the run complete.
 */
export function GateStepperDemo() {
  const [atIndex, setAtIndex] = React.useState(0);
  const [calibrated, setCalibrated] = React.useState(false);
  const [complete, setComplete] = React.useState(false);

  const steps: GateStep[] = [
    { id: "identify", title: "IDENTIFY", content: <IdentifyGate /> },
    {
      id: "calibrate",
      title: "CALIBRATE",
      content: (
        <CalibrateGate
          calibrated={calibrated}
          onToggle={() => setCalibrated((c) => !c)}
        />
      ),
    },
    { id: "verify", title: "VERIFY", content: <VerifyGate /> },
    { id: "seal", title: "SEAL", content: <SealGate /> },
  ];

  const handleIndexChange = (next: number) => {
    setAtIndex(next);
    setComplete(false);
  };

  const gateTitle = steps[atIndex]?.title ?? "";

  return (
    <div className="flex w-full max-w-lg flex-col gap-3">
      <div className="relative rounded-4 border border-hairline bg-surface-1 p-4">
        {/* Corner registration ticks — the lab-instrument frame. */}
        {(
          [
            "left-2 top-2 border-l border-t",
            "right-2 top-2 border-r border-t",
            "bottom-2 left-2 border-b border-l",
            "bottom-2 right-2 border-b border-r",
          ] as const
        ).map((corner) => (
          <span
            key={corner}
            aria-hidden
            className={cn("absolute size-2.5 border-hairline-strong", corner)}
          />
        ))}

        <div className="mb-3 flex items-center justify-between px-1">
          <span className="text-label text-ink-2">
            COMMISSIONING RUN &middot; 04
          </span>
          <span className="text-label text-ink-3 tabular-nums">KQ-119</span>
        </div>

        <GateStepper
          steps={steps}
          defaultIndex={0}
          onIndexChange={handleIndexChange}
          canAdvance={(i) => i !== 1 || calibrated}
          onComplete={() => setComplete(true)}
          height={260}
        />

        <p
          role="status"
          className="mt-3 border-t border-hairline pt-3 text-center text-label text-ink-2"
        >
          {complete ? (
            <span className="text-signal">RUN COMPLETE</span>
          ) : (
            <>
              AT GATE &middot; <span className="text-signal">{gateTitle}</span>
            </>
          )}
        </p>
      </div>

      <p className="text-center text-label text-ink-3">
        Pass the gates in order - CALIBRATE needs its mark first.
      </p>
    </div>
  );
}
