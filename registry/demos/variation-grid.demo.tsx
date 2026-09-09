"use client";

import * as React from "react";

import { VariationGrid, type Variation } from "@/registry/ui/variation-grid";

/** Four cover takes for a Waylight release note; each round rolls new seeds. */
const takesFor = (
  round: number,
): [Variation, Variation, Variation, Variation] => [
  { id: "a", seed: round * 4 + 1, label: "Take A" },
  { id: "b", seed: round * 4 + 2, label: "Take B" },
  { id: "c", seed: round * 4 + 3, label: "Take C" },
  { id: "d", seed: round * 4 + 4, label: "Take D" },
];

/** How long the four veils stay down before the takes reveal together. */
const RENDER_MS = 1600;

const button =
  "flex h-8 items-center rounded-2 border border-primary bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors outline-none hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50";

export function VariationGridDemo() {
  const [round, setRound] = React.useState(0);
  const [generating, setGenerating] = React.useState(false);
  const [revealed, setRevealed] = React.useState(false);
  const [picked, setPicked] = React.useState<string | null>(null);

  // A hidden tab holds the render; the takes should not reveal unseen.
  const [visible, setVisible] = React.useState(true);
  React.useEffect(() => {
    const onVisibility = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  React.useEffect(() => {
    if (!generating || !visible) return;
    // The seeds roll only once the veils are down, so no new picture flashes.
    const timer = window.setTimeout(() => {
      setRound((current) => current + 1);
      setRevealed(true);
      setGenerating(false);
    }, RENDER_MS);
    return () => window.clearTimeout(timer);
  }, [generating, visible]);

  const generate = () => {
    setRevealed(false);
    setPicked(null);
    setGenerating(true);
  };

  const takes = takesFor(round);
  const chosen = takes.find((take) => take.id === picked);
  const line = generating
    ? ["Rendering", "4 takes", ""]
    : chosen
      ? ["Picked", chosen.label, "· 3 folded"]
      : revealed
        ? ["Revealed", "pick one", ""]
        : ["Idle · press generate", "", ""];

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <VariationGrid
        label="Cover takes from Fernworks Model 3"
        variations={takes}
        revealed={revealed}
        generating={generating}
        value={picked}
        onValueChange={setPicked}
      />

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={generate}
          disabled={generating}
          className={button}
        >
          {round > 0 ? "Regenerate" : "Generate"}
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {line[0]}{" "}
        <span className="text-[var(--signal,var(--primary))]">{line[1]}</span>{" "}
        {line[2]}
      </p>
    </div>
  );
}
