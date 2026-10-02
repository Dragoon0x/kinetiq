"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  PublishPress,
  type PublishPressState,
  type PublishStatus,
} from "@/registry/ui/publish-press";

export const tweaks = defineTweaks({
  ink: {
    kind: "range",
    label: "Ink",
    default: 0.7,
    min: 0,
    max: 1,
    step: 0.05,
  },
  roller: {
    kind: "range",
    label: "Roller",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
  smudge: {
    kind: "range",
    label: "Smudge",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
});

/** Friday 9 October, 09:00 UTC: the journal's usual slot. */
const FRIDAY_SLOT = Date.UTC(2026, 9, 9, 9, 0);

const toggle = (on: boolean) =>
  cn(
    "inline-flex h-7 cursor-pointer items-center rounded-2 border px-2.5 text-xs transition-colors outline-none",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
    "disabled:cursor-not-allowed disabled:opacity-50",
    on
      ? "border-cobalt-bright/40 bg-cobalt-wash text-cobalt-bright"
      : "border-hairline text-ink-2 enabled:hover:bg-surface-2 enabled:hover:text-foreground",
  );

/**
 * Putting a post live on the Waylight Journal: press to print it, or stamp a
 * date to let it go out on Friday.
 */
export function PublishPressDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [status, setStatus] = React.useState<PublishStatus>("draft");
  const [phase, setPhase] = React.useState<PublishPressState>("idle");
  const [slot, setSlot] = React.useState(false);
  const [failNext, setFailNext] = React.useState(false);
  const failArmed = React.useRef(false);
  const scheduling = chrome && slot;

  /** The journal's server: answers after `ms`, or refuses when asked to. */
  const answer = (ms: number, signal: AbortSignal) => {
    const fail = failArmed.current;
    if (fail) {
      failArmed.current = false;
      setFailNext(false);
    }
    return new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(
        () => (fail ? reject(new Error("Offline")) : resolve()),
        ms,
      );
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

  const what =
    status === "draft"
      ? phase === "pending"
        ? scheduling
          ? "scheduling"
          : "publishing"
        : "draft saved 2 min ago"
      : status === "published"
        ? phase === "pending"
          ? "unpublishing"
          : "live"
        : "goes out Friday";

  return (
    <div className="flex w-full max-w-md flex-col gap-3">
      <div className="flex items-center gap-3 rounded-3 border border-hairline bg-card py-3 pr-3 pl-4">
        <div className="min-w-0 flex-1">
          <p
            className="truncate text-sm font-medium text-foreground"
            title="Field notes: the spring survey"
          >
            Field notes: the spring survey
          </p>
          <p className="truncate text-xs text-ink-3">
            Waylight Journal · {what}
          </p>
        </div>
        <PublishPress
          value={status}
          onValueChange={setStatus}
          onStateChange={setPhase}
          schedule={scheduling ? FRIDAY_SLOT : null}
          onPublish={(_, signal) => answer(900, signal)}
          onUnpublish={(signal) => answer(600, signal)}
          sound={sound}
          {...values}
        />
      </div>
      {chrome ? (
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-border pt-3">
          <p
            role="status"
            className="min-w-0 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
          >
            {phase === "pending" ? (
              <span className="text-signal">
                {status !== "draft"
                  ? "unpublishing"
                  : scheduling
                    ? "scheduling"
                    : "publishing"}
              </span>
            ) : phase === "error" ? (
              <>
                <span className="text-signal">
                  {status === "draft" ? "not published" : "still live"}
                </span>{" "}
                · press retry
              </>
            ) : status === "published" ? (
              <>
                <span className="text-signal">live</span> · on the journal
              </>
            ) : status === "scheduled" ? (
              <>
                <span className="text-signal">scheduled</span> · oct 9 · 09:00
              </>
            ) : (
              <>
                <span className="text-signal">draft</span> · press{" "}
                {scheduling ? "schedule" : "publish"}
              </>
            )}
          </p>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              aria-pressed={slot}
              disabled={status !== "draft" || phase === "pending"}
              onClick={() => setSlot((v) => !v)}
              className={toggle(slot)}
            >
              Schedule Fri 09:00
            </button>
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
          </div>
        </div>
      ) : null}
    </div>
  );
}
