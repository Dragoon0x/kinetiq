"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  CheckoutFlow,
  defaultCheckoutValues,
  type CheckoutCard,
  type CheckoutState,
  type CheckoutValues,
} from "@/registry/ui/checkout-flow";

export const tweaks = defineTweaks({
  steps: {
    kind: "choice",
    label: "Steps",
    default: "slide",
    options: ["slide", "stack"],
    names: { slide: "Slide", stack: "Stack" },
  },
  summary: {
    kind: "choice",
    label: "Summary",
    default: "side",
    options: ["side", "bar", "off"],
    names: { side: "Side", bar: "Bar", off: "Review only" },
  },
  format: {
    kind: "choice",
    label: "Card format",
    default: "groups",
    options: ["groups", "mask", "plain"],
    names: { groups: "Groups", mask: "Mask", plain: "Plain" },
  },
});

/** Passes the checksum; no card network uses it. */
const TEST_CARD: CheckoutCard = {
  number: "8402115033672919",
  name: "Maeve Corrigan",
  expiry: "0929",
  cvc: "418",
};

const STEP_NAMES = ["address", "delivery", "payment", "review"];

/**
 * The Fernworks checkout: a Field Mug and two bags of Coldbrook beans going
 * to Dublin. The address is filled in; the card is not. Placing the order
 * answers after 1.1 s with order FW-20481.
 */
export function CheckoutFlowDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [answers, setAnswers] = React.useState<CheckoutValues>(
    defaultCheckoutValues,
  );
  const [step, setStep] = React.useState(0);
  const [note, setNote] = React.useState<string | null>(null);
  const [failNext, setFailNext] = React.useState(false);
  const [round, setRound] = React.useState(0);
  const failRef = React.useRef(false);

  const flow = (
    <CheckoutFlow
      key={round}
      value={answers}
      onValueChange={setAnswers}
      step={step}
      onStepChange={(i) => {
        setStep(i);
        setNote(null);
      }}
      onInvalid={(_, fields) =>
        setNote(
          `held · ${fields.length} ${fields.length === 1 ? "field needs" : "fields need"} attention`,
        )
      }
      onStateChange={(s: CheckoutState) => {
        if (s === "pending") setNote("placing order");
      }}
      onPlaceOrder={() =>
        new Promise<{ orderId: string }>((resolve, reject) => {
          const fail = failRef.current;
          failRef.current = false;
          setFailNext(false);
          window.setTimeout(() => {
            if (fail) {
              setNote("declined · try another card");
              reject(new Error("Waylight Pay declined the card. Try another."));
              return;
            }
            setNote("order fw-20481 confirmed");
            resolve({ orderId: "FW-20481" });
          }, 1100);
        })
      }
      onContinueShopping={() => setNote("back to the shop")}
      testCard={TEST_CARD}
      sound={sound}
      className={chrome ? "max-h-[600px]" : "max-h-[588px]"}
      {...values}
    />
  );

  if (!chrome) return <div className="w-full">{flow}</div>;

  return (
    <div className="flex w-full max-w-5xl flex-col gap-4">
      {flow}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
        <p
          role="status"
          className="min-w-0 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          {note ? (
            <span className="text-signal">{note}</span>
          ) : (
            <>
              <span className="text-signal">step {step + 1} of 4</span> ·{" "}
              {STEP_NAMES[step] ?? ""}
            </>
          )}
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
            className="inline-flex h-8 items-center rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid aria-pressed:border-danger/50 aria-pressed:text-danger"
          >
            Fail next
          </button>
          <button
            type="button"
            onClick={() => {
              setAnswers(defaultCheckoutValues);
              setStep(0);
              setNote(null);
              failRef.current = false;
              setFailNext(false);
              setRound((r) => r + 1);
            }}
            className="inline-flex h-8 items-center rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
          >
            Reset
          </button>
        </div>
      </div>
    </div>
  );
}
