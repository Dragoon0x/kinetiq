"use client";

import * as React from "react";

import { Keyboard, RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  defaultTaxAddress,
  TaxProfile,
  type TaxProfileValues,
} from "@/registry/ui/tax-profile";

export const tweaks = defineTweaks({
  fieldStyle: {
    kind: "choice",
    label: "Fields",
    default: "boxed",
    options: ["boxed", "line", "filled"],
    names: { boxed: "Boxed", line: "Line", filled: "Filled" },
  },
  previewStyle: {
    kind: "choice",
    label: "Invoice",
    default: "classic",
    options: ["classic", "modern", "compact"],
    names: { classic: "Classic", modern: "Modern", compact: "Compact" },
  },
  accent: {
    kind: "choice",
    label: "Accent",
    default: "var(--accent-bright)",
    options: [
      "var(--accent-bright)",
      "var(--success)",
      "var(--warn)",
      "oklch(from var(--accent-bright) l c 320)",
    ],
    names: {
      "var(--accent-bright)": "Cobalt",
      "var(--success)": "Moss",
      "var(--warn)": "Amber",
      "oklch(from var(--accent-bright) l c 320)": "Iris",
    },
  },
});

const START: TaxProfileValues = {
  company: "",
  taxId: { country: "GB", number: "" },
  email: "billing@fernworks.studio",
  address: defaultTaxAddress,
  reference: "",
};
/** A number the seeded registry knows: Fernworks Studio Ltd. */
const SAMPLE = "204718369";

/**
 * Fernworks Studio filling in its billing details on Waylight. In the gallery
 * the VAT number types itself once when the card comes into view; on the
 * docs page "Type an example" does the same.
 */
export function TaxProfileDemo({
  chrome = true,
  // The form is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [vals, setVals] = React.useState<TaxProfileValues>(START);
  const [note, setNote] = React.useState<string | null>(null);
  const [run, setRun] = React.useState(0);
  const [typing, setTyping] = React.useState(0);
  const ref = React.useRef<HTMLDivElement | null>(null);

  // The card types its example once, when it is first seen.
  React.useEffect(() => {
    const node = ref.current;
    if (chrome || !node) return;
    const io = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) setTyping((t) => (t === 0 ? 1 : t));
    });
    io.observe(node);
    return () => io.disconnect();
  }, [chrome]);

  React.useEffect(() => {
    if (typing === 0) return;
    let i = 0;
    let timer = 0;
    const step = () => {
      i += 1;
      setVals((v) => ({
        ...v,
        taxId: { country: "GB", number: SAMPLE.slice(0, i) },
      }));
      if (i < SAMPLE.length) timer = window.setTimeout(step, 85);
    };
    timer = window.setTimeout(step, 400);
    return () => window.clearTimeout(timer);
  }, [typing]);

  const form = (
    <TaxProfile
      key={run}
      values={vals}
      onValuesChange={setVals}
      onValidate={(r) =>
        setNote(
          r.state === "valid"
            ? `tax id · registered to ${r.name}`
            : r.state === "not-found"
              ? "tax id · no company found · kept as entered"
              : r.state === "unreachable"
                ? "tax id · registry did not answer · kept"
                : "tax id · check digit failed",
        )
      }
      onSave={(v) =>
        new Promise<void>((resolve) => {
          window.setTimeout(() => {
            setNote(`saved · invoices billed to ${v.company}`);
            resolve();
          }, 600);
        })
      }
      onCancel={() => setNote("cancelled · nothing changed")}
      {...values}
    />
  );

  if (!chrome)
    return (
      <div ref={ref} className="w-full">
        {form}
      </div>
    );

  const button = cn(
    "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none",
    "hover:bg-surface-2 hover:text-foreground",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
  );

  return (
    <div ref={ref} className="flex w-full max-w-3xl flex-col gap-4">
      {form}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setVals((v) => ({ ...v, taxId: { country: "GB", number: "" } }));
            setTyping((t) => t + 1);
          }}
          className={button}
        >
          <Keyboard aria-hidden className="size-3.5" />
          Type an example
        </button>
        <button
          type="button"
          onClick={() => {
            setVals(START);
            setNote(null);
            setTyping(0);
            setRun((r) => r + 1);
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
        {note ? (
          <span className="text-signal">{note}</span>
        ) : (
          <>
            <span className="text-signal">try gb 204 718 369</span> · or 990 317
            427 for a registry that does not answer
          </>
        )}
      </p>
    </div>
  );
}
