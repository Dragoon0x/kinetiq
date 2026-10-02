"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  GateButton,
  type GateButtonState,
  type GateRequirement,
} from "@/registry/ui/gate-button";

export const tweaks = defineTweaks({
  segments: {
    kind: "choice",
    label: "Segments",
    default: "arc",
    options: ["arc", "ring", "pips"],
    names: { arc: "Arc", ring: "Ring", pips: "Pips" },
  },
  warm: {
    kind: "range",
    label: "Warm",
    default: 0.7,
    min: 0,
    max: 1,
    step: 0.05,
  },
  hint: {
    kind: "choice",
    label: "Hint",
    default: "list",
    options: ["list", "next", "off"],
    names: { list: "List", next: "Next only", off: "Off" },
  },
});

/** The access form's fields, each one a requirement the button wears. */
const FIELDS: { id: string; label: string; detail: string }[] = [
  { id: "email", label: "Work email verified", detail: "rhea@fieldline.dev" },
  { id: "team", label: "Team chosen", detail: "Survey crew, north basin" },
  { id: "policy", label: "Data policy accepted", detail: "Version 4, read" },
];
const START: Record<string, boolean> = {
  email: true,
  team: false,
  policy: false,
};

const toggle = (on: boolean) =>
  cn(
    "inline-flex h-7 cursor-pointer items-center rounded-2 border px-2.5 text-xs transition-colors outline-none",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
    on
      ? "border-cobalt-bright/40 bg-cobalt-wash text-cobalt-bright"
      : "border-hairline text-ink-2 hover:bg-surface-2 hover:text-foreground",
  );

/**
 * Asking Fieldline for access to a workspace: the request only goes once the
 * email is verified, a team is chosen and the data policy is accepted.
 */
export function GateButtonDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [met, setMet] = React.useState(START);
  const [phase, setPhase] = React.useState<GateButtonState>("idle");
  const [sent, setSent] = React.useState(false);
  const [nudged, setNudged] = React.useState<string[]>([]);
  const [failNext, setFailNext] = React.useState(false);
  const failArmed = React.useRef(false);
  const uid = React.useId();

  const requirements: GateRequirement[] = FIELDS.map((f) => ({
    id: f.id,
    label: f.label,
    met: met[f.id] ?? false,
  }));
  const count = requirements.filter((r) => r.met).length;

  React.useEffect(() => {
    if (nudged.length === 0) return;
    const timer = window.setTimeout(() => setNudged([]), 1200);
    return () => window.clearTimeout(timer);
  }, [nudged]);

  /** Fieldline's admins answer in a second, or not at all when asked to fail. */
  const submit = (signal: AbortSignal) => {
    const fail = failArmed.current;
    if (fail) {
      failArmed.current = false;
      setFailNext(false);
    }
    return new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        if (fail) reject(new Error("Admins unreachable"));
        else {
          setSent(true);
          resolve();
        }
      }, 1000);
      signal.addEventListener(
        "abort",
        () => {
          window.clearTimeout(timer);
          reject(new Error("Cancelled"));
        },
        { once: true },
      );
    });
  };

  return (
    <div className="flex w-full max-w-sm flex-col gap-3">
      <div className="flex flex-col gap-2.5 rounded-3 border border-hairline bg-card p-3">
        <p className="truncate px-1 text-sm font-medium text-foreground">
          Request access
          <span className="font-normal text-ink-3"> · Fieldline workspace</span>
        </p>
        <ul className="@container flex flex-col gap-0.5">
          {FIELDS.map((f) => {
            const id = `${uid}-${f.id}`;
            const on = met[f.id] ?? false;
            return (
              <li key={f.id}>
                <label
                  htmlFor={id}
                  className={cn(
                    "flex h-7 cursor-pointer items-center gap-2.5 rounded-2 px-1 transition-colors hover:bg-surface-2",
                    nudged.includes(f.id) && "bg-danger/10",
                  )}
                >
                  <input
                    id={id}
                    type="checkbox"
                    checked={on}
                    onChange={(e) => {
                      const next = e.currentTarget.checked;
                      setMet((m) => ({ ...m, [f.id]: next }));
                    }}
                    className="size-4 shrink-0 cursor-pointer accent-(--accent) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
                  />
                  <span className="min-w-0 flex-1 truncate text-[13px] text-foreground">
                    {f.label}
                  </span>
                  <span className="hidden max-w-40 truncate text-xs text-ink-3 @[20rem]:block">
                    {f.detail}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
        <div className="flex items-center justify-end gap-2 border-t border-hairline pt-2.5">
          <GateButton
            requirements={requirements}
            onSubmit={submit}
            onStateChange={setPhase}
            onLockedPress={(missing) => setNudged(missing.map((m) => m.id))}
            sound={sound}
            {...values}
          />
        </div>
      </div>
      {chrome ? (
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-border pt-3">
          <p
            role="status"
            className="min-w-0 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
          >
            {phase === "pending" ? (
              <span className="text-signal">sending</span>
            ) : phase === "error" ? (
              <>
                <span className="text-signal">not sent</span> · press retry
              </>
            ) : sent ? (
              <>
                <span className="text-signal">request sent</span> · fieldline
                admins notified
              </>
            ) : count === FIELDS.length ? (
              <span className="text-signal">ready to send</span>
            ) : (
              <>
                <span className="text-signal">locked</span> · {count} of{" "}
                {FIELDS.length} ready
              </>
            )}
          </p>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              aria-pressed={failNext}
              onClick={() => {
                failArmed.current = !failNext;
                setFailNext(!failNext);
              }}
              className={toggle(failNext)}
            >
              Fail next
            </button>
            <button
              type="button"
              onClick={() => {
                setMet(START);
                setSent(false);
              }}
              className={toggle(false)}
            >
              Reset
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
