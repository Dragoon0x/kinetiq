"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { LoomField } from "@/registry/ui/loom-field";

export const tweaks = defineTweaks({
  weave: {
    kind: "choice",
    label: "Weave",
    default: "twill",
    options: ["plain", "twill", "basket"],
    names: { plain: "Plain", twill: "Twill", basket: "Basket" },
  },
  press: {
    kind: "range",
    label: "Press",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
  thread: {
    kind: "choice",
    label: "Thread",
    default: "indigo",
    options: ["indigo", "rust", "moss"],
    names: { indigo: "Indigo", rust: "Rust", moss: "Moss" },
  },
});

const DYE = { indigo: "Indigo", rust: "Rust", moss: "Moss" } as const;

type Hand = "rest" | "pressed" | "settling";

/**
 * Fernworks Mill announcing a new bolt: the hero sits on the cloth itself,
 * and the cloth gives under the visitor's hand.
 */
export function LoomFieldDemo({
  chrome = true,
  // The cloth is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [hand, setHand] = React.useState<Hand>("rest");
  const weave = values.weave ?? "twill";
  const dye = DYE[values.thread ?? "indigo"];

  // A second after the hand lets go the threads have settled; the line
  // says so then, not before.
  React.useEffect(() => {
    if (hand !== "settling") return;
    const done = window.setTimeout(() => setHand("rest"), 1200);
    return () => window.clearTimeout(done);
  }, [hand]);

  const cloth = (
    <LoomField
      label="Woven cloth behind the Fernworks Mill banner"
      onPressChange={(pressed) => setHand(pressed ? "pressed" : "settling")}
      className={
        chrome
          ? "h-64 rounded-3 border border-hairline"
          : "h-52 rounded-3 border border-hairline"
      }
      {...values}
    >
      <div className="flex size-full items-center p-4 sm:p-6">
        <div className="max-w-64 rounded-3 border border-hairline bg-background/85 px-4 py-3 backdrop-blur-sm">
          <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            Fernworks Mill
          </p>
          <p className="mt-1 text-base leading-snug font-medium text-balance text-foreground">
            Autumn cloth is on the loom
          </p>
          {chrome ? (
            <>
              <p className="mt-1 text-xs text-ink-2">
                {dye} {weave}, 340 gsm
              </p>
              <button
                type="button"
                className="mt-3 inline-flex h-8 items-center rounded-2 bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors outline-none hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
              >
                See the bolts
              </button>
            </>
          ) : null}
        </div>
      </div>
    </LoomField>
  );

  if (!chrome) return <div className="flex w-full">{cloth}</div>;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      {cloth}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {hand === "pressed" ? (
          <>
            <span className="text-signal">pressed</span> · the threads part
          </>
        ) : hand === "settling" ? (
          <>
            <span className="text-signal">let go</span> · the threads settle
          </>
        ) : (
          <>
            <span className="text-signal">at rest</span> · {weave} weave,{" "}
            {dye.toLowerCase()}
          </>
        )}
      </p>
    </div>
  );
}
