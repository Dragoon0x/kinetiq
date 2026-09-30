"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { TryOn, type TryOnOption } from "@/registry/ui/try-on";

export const tweaks = defineTweaks({
  wipe: {
    kind: "choice",
    label: "Wipe",
    default: "side",
    options: ["side", "radial"],
    names: { side: "Side", radial: "Radial" },
  },
  speed: {
    kind: "range",
    label: "Speed",
    default: 1,
    min: 0.5,
    max: 2,
    step: 0.25,
    unit: "×",
  },
  sample: {
    kind: "choice",
    label: "Sample",
    default: "card",
    options: ["card", "button", "badge"],
    names: { card: "Card", button: "Button", badge: "Badge" },
  },
});

const ACCENTS: TryOnOption[] = [
  { value: "ink", label: "Ink", color: "var(--ink)" },
  { value: "cobalt", label: "Cobalt", color: "var(--accent)" },
  { value: "moss", label: "Moss", color: "var(--success)" },
  { value: "amber", label: "Amber", color: "var(--warn)" },
  { value: "ember", label: "Ember", color: "var(--danger)" },
];

const SAMPLE_TEXT = {
  card: "Fieldline Studio",
  button: "Invite teammates",
  badge: "Pro plan",
} as const;

const nameOf = (value: string) =>
  (ACCENTS.find((a) => a.value === value)?.label ?? value).toLowerCase();

/**
 * Fieldline's workspace accent: every swatch can be tried on the workspace
 * card, the invite button or the plan badge before it is kept.
 */
export function TryOnDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [accent, setAccent] = React.useState("cobalt");
  const [trying, setTrying] = React.useState<string | null>(null);
  const [kept, setKept] = React.useState(false);
  const [input, setInput] = React.useState<"pointer" | "touch" | "keys">(
    "pointer",
  );
  const sample = values.sample ?? tweaks.sample.default;

  const hint =
    input === "touch"
      ? "tap again to keep"
      : input === "keys"
        ? "enter to keep"
        : "click to keep";
  const line = trying
    ? [`trying ${nameOf(trying)}`, hint]
    : kept
      ? [`kept ${nameOf(accent)}`, "the preview is the accent now"]
      : [`accent ${nameOf(accent)}`, "point at a swatch to try it"];

  return (
    <div
      className="flex w-full max-w-xs flex-col gap-4"
      onPointerDownCapture={(event) =>
        setInput(event.pointerType === "touch" ? "touch" : "pointer")
      }
      onPointerMoveCapture={(event) => {
        if (event.pointerType !== "touch") setInput("pointer");
      }}
      onKeyDownCapture={() => setInput("keys")}
    >
      <TryOn
        label="Accent"
        options={ACCENTS}
        value={accent}
        onValueChange={(next) => {
          setAccent(next);
          setKept(true);
        }}
        onPreviewChange={(next) => {
          setTrying(next);
          if (next) setKept(false);
        }}
        sampleText={SAMPLE_TEXT[sample]}
        sound={sound}
        {...values}
      />
      {chrome ? (
        <p
          role="status"
          className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          <span className="text-signal">{line[0]}</span>
          {` · ${line[1]}`}
        </p>
      ) : null}
    </div>
  );
}
