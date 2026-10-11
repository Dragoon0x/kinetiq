"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  LanyardBadge,
  type LanyardBadgeMode,
} from "@/registry/ui/lanyard-badge";

export const tweaks = defineTweaks({
  pitch: {
    kind: "range",
    label: "Pitch",
    default: 5,
    min: 4,
    max: 8,
    step: 0.5,
    unit: "px",
  },
  color: {
    kind: "choice",
    label: "LEDs",
    default: "amber",
    options: ["amber", "red", "green", "blue"],
    names: { amber: "Amber", red: "Red", green: "Green", blue: "Blue" },
  },
  brightness: {
    kind: "range",
    label: "Brightness",
    default: 0.75,
    min: 0.25,
    max: 1,
    step: 0.25,
  },
});

const MODE_SAY: Record<LanyardBadgeMode, string> = {
  waves: "waves",
  name: "name",
  pictures: "pictures",
  auto: "auto",
};

/**
 * A Gaugeworks Summit badge on its lanyard. The brightness lives here, seeded
 * from the tweak, so the badge's own button can step it and the tweak can
 * still set it.
 */
export function LanyardBadgeDemo({
  chrome = true,
  sound,
  brightness = 0.75,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [level, setLevel] = React.useState(brightness);
  const [seen, setSeen] = React.useState(brightness);
  if (seen !== brightness) {
    setSeen(brightness);
    setLevel(brightness);
  }
  const [mode, setMode] = React.useState<LanyardBadgeMode>("auto");

  const badge = (
    <LanyardBadge
      label="Gaugeworks Summit name badge"
      messages={["FIELDLINE", "BOOTH 14"]}
      sound={sound}
      {...values}
      brightness={level}
      onBrightnessChange={setLevel}
      mode={mode}
      onModeChange={setMode}
      className="h-52"
    />
  );

  if (!chrome) return <div className="w-full">{badge}</div>;

  return (
    <div className="flex w-full max-w-80 flex-col gap-3">
      <div className="min-w-0">
        <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          Gaugeworks Summit · day two
        </p>
        <p className="text-sm font-medium text-foreground">
          Your badge, on its lanyard
        </p>
      </div>
      {badge}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">mode {MODE_SAY[mode]}</span> · brightness{" "}
        {Math.round(level * 4)} of 4
      </p>
    </div>
  );
}
