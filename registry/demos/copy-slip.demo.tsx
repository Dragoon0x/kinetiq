"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { CopySlip } from "@/registry/ui/copy-slip";

export const tweaks = defineTweaks({
  arc: {
    kind: "range",
    label: "Arc",
    default: 0.8,
    min: 0,
    max: 1,
    step: 0.05,
  },
  slip: {
    kind: "range",
    label: "Slip",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
  hold: {
    kind: "range",
    label: "Hold",
    default: 2,
    min: 1,
    max: 4,
    step: 0.5,
    unit: "s",
  },
  showText: { kind: "toggle", label: "Show text", default: true },
});

const LINK = "pay.waylight.test/r/4F9A-C21E";

/** Stands in for a browser that refuses the clipboard, as a real one can. */
const refuse = () =>
  Promise.reject(
    new DOMException("Clipboard access was refused.", "NotAllowedError"),
  );

/**
 * Sharing a Waylight Pay payment link. On the docs page a second button
 * swaps in a clipboard that refuses, so the failure can be seen on a page
 * where copying works.
 */
export function CopySlipDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [blocked, setBlocked] = React.useState(false);
  const [result, setResult] = React.useState<"none" | "copied" | "refused">(
    "none",
  );

  return (
    <div className="flex w-full max-w-md flex-col gap-4">
      <div className="rounded-3 border border-hairline bg-card p-4">
        <CopySlip
          label="Payment link"
          value={LINK}
          writer={blocked ? refuse : undefined}
          onCopy={() => setResult("copied")}
          onCopyError={() => setResult("refused")}
          sound={sound}
          {...values}
        />
      </div>
      {chrome ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              aria-pressed={blocked}
              onClick={() => setBlocked((b) => !b)}
              className="group inline-flex h-8 items-center gap-2 rounded-2 border border-hairline-strong px-3 text-xs font-medium text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring aria-pressed:border-danger/50 aria-pressed:text-danger"
            >
              <span
                aria-hidden
                className="size-2 shrink-0 rounded-full border border-current group-aria-pressed:bg-current"
              />
              Block the clipboard
            </button>
          </div>
          <p
            role="status"
            className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
          >
            {result === "copied" ? (
              <>
                <span className="text-signal">copied</span> · payment link on
                the clipboard
              </>
            ) : result === "refused" ? (
              <>
                <span className="text-danger">not copied</span> · clipboard
                blocked
              </>
            ) : (
              <>
                <span className="text-signal">ready</span> ·{" "}
                {blocked ? "clipboard blocked" : "nothing copied yet"}
              </>
            )}
          </p>
        </>
      ) : null}
    </div>
  );
}
