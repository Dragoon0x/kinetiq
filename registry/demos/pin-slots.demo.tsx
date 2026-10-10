"use client";

import * as React from "react";

import { ClipboardPaste, RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { PinSlots, type PinSlotsState } from "@/registry/ui/pin-slots";

export const tweaks = defineTweaks({
  length: {
    kind: "range",
    label: "Length",
    default: 6,
    min: 4,
    max: 8,
    step: 1,
  },
  mask: { kind: "toggle", label: "Mask", default: false },
  state: {
    kind: "choice",
    label: "State",
    default: "idle",
    options: ["idle", "checking", "success", "error"],
    names: {
      idle: "Idle",
      checking: "Checking",
      success: "Success",
      error: "Error",
    },
  },
});

/** The code the demo's sign-in accepts, cut to the slot count. */
const SAMPLE = "24681035";

const button =
  "inline-flex h-7 items-center gap-1.5 rounded-2 border border-hairline-strong bg-card px-2.5 text-xs font-medium text-foreground outline-none hover:bg-surface-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

/**
 * Waylight's sign-in, second step: the code from the phone drops into its
 * slots, and the right one locks them into a single bar.
 */
export function PinSlotsDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const length = values.length ?? tweaks.length.default;
  const forced = values.state && values.state !== "idle" ? values.state : null;
  const right = SAMPLE.slice(0, length);
  const [code, setCode] = React.useState("");
  const [verdict, setVerdict] = React.useState<PinSlotsState>("idle");
  const timer = React.useRef(0);

  React.useEffect(() => () => window.clearTimeout(timer.current), []);

  const check = (typed: string) => {
    setVerdict("checking");
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(
      () => setVerdict(typed === right ? "success" : "error"),
      700,
    );
  };

  const shown = forced ? right : code.slice(0, length);
  const state = forced ?? verdict;

  const field = (
    <div className="flex w-full flex-col gap-4 rounded-4 border border-hairline bg-card px-4 py-5">
      <div className="flex flex-col items-center gap-1 text-center">
        <p className="text-sm font-medium text-foreground">Check your phone</p>
        <p className="text-xs text-ink-3">
          We sent a code to the number ending 4821.
        </p>
      </div>
      <PinSlots
        hideLabel
        label="Sign-in code"
        hint="It stays valid for ten minutes."
        successMessage="Signed in to Waylight."
        errorMessage="That code didn’t match. Type it again."
        sound={sound}
        {...values}
        length={length}
        split={length >= 6 && length % 2 === 0 ? length / 2 : undefined}
        value={shown}
        state={state}
        onValueChange={(next) => {
          setCode(next);
          if (verdict !== "idle" && next.length < length) {
            window.clearTimeout(timer.current);
            setVerdict("idle");
          }
        }}
        onComplete={check}
      />
    </div>
  );

  if (!chrome) {
    return <div className="flex w-full max-w-sm justify-center">{field}</div>;
  }

  const [lead, rest] =
    state === "checking"
      ? ["checking", ` · ${length} of ${length}`]
      : state === "success"
        ? ["accepted", " · signed in"]
        : state === "error"
          ? ["refused", " · type again"]
          : [`${shown.length} of ${length} entered`, ` · try ${right}`];

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      {field}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-border pt-3">
        <p
          role="status"
          className="font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          <span className="text-signal">{lead}</span>
          {rest}
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className={button}
            onClick={() => {
              if (forced) return;
              setCode(right);
              check(right);
            }}
          >
            <ClipboardPaste aria-hidden className="size-3.5 shrink-0" />
            Paste code
          </button>
          <button
            type="button"
            className={button}
            onClick={() => {
              window.clearTimeout(timer.current);
              setCode("");
              setVerdict("idle");
            }}
          >
            <RotateCcw aria-hidden className="size-3.5 shrink-0" />
            Clear
          </button>
        </div>
      </div>
    </div>
  );
}
