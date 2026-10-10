"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { PixelBloom, type PixelBloomSource } from "@/registry/ui/pixel-bloom";

export const tweaks = defineTweaks({
  pixel: {
    kind: "range",
    label: "Pixel",
    default: 10,
    min: 6,
    max: 20,
    step: 2,
    unit: "px",
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
  color: {
    kind: "choice",
    label: "Color",
    default: "cobalt",
    options: ["cobalt", "signal", "ember", "violet"],
    names: {
      cobalt: "Cobalt",
      signal: "Signal",
      ember: "Ember",
      violet: "Violet",
    },
  },
});

const FROM: Record<PixelBloomSource, string> = {
  press: "from your press",
  linger: "from your pointer",
  focus: "from the keyboard",
  ambient: "on its own",
};

/**
 * Fieldline, a layout tool for interface teams: its hero sits on a field of
 * pixels that open wherever a visitor touches it.
 */
export function PixelBloomDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [said, setSaid] = React.useState<PixelBloomSource | null>(null);
  const quiet = React.useRef(0);
  const pixel = values.pixel ?? 10;
  const color = values.color ?? "cobalt";

  React.useEffect(() => () => window.clearTimeout(quiet.current), []);

  // The status names a bloom the visitor opened, for a moment, then rests;
  // the field's own blooms are not news.
  const onBloom = (source: PixelBloomSource) => {
    if (source === "ambient") return;
    setSaid(source);
    window.clearTimeout(quiet.current);
    quiet.current = window.setTimeout(() => setSaid(null), 1800);
  };

  const field = (
    <PixelBloom
      onBloom={(b) => onBloom(b.source)}
      sound={sound}
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
            Fieldline
          </p>
          <p className="mt-1 text-base leading-snug font-medium text-balance text-foreground">
            Every pixel, on purpose
          </p>
          {chrome ? (
            <>
              <p className="mt-1 text-xs text-ink-2">
                Layout tools for interface teams
              </p>
              <button
                type="button"
                className="mt-3 inline-flex h-8 items-center rounded-2 bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors outline-none hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
              >
                Start a canvas
              </button>
            </>
          ) : null}
        </div>
      </div>
    </PixelBloom>
  );

  if (!chrome) return <div className="flex w-full">{field}</div>;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      {field}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {said ? (
          <>
            <span className="text-signal">bloom</span> · {FROM[said]}
          </>
        ) : (
          <>
            <span className="text-signal">quiet</span> · {pixel} px · {color}
          </>
        )}
      </p>
    </div>
  );
}
