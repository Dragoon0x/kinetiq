"use client";

import { Volume2, VolumeX } from "lucide-react";

import { cn } from "@/registry/lib/utils";

/**
 * The gallery's sound switch. Its name stays "Sound" whichever way it is set
 * — the switch's checked state says on or off — so it never reads as
 * "Mute, on".
 */
export function SoundSwitch({
  on,
  onChange,
  className,
}: {
  on: boolean;
  onChange: (on: boolean) => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label="Sound"
      title={on ? "Sound on" : "Sound off"}
      onClick={() => onChange(!on)}
      className={cn(
        "inline-flex size-9 items-center justify-center rounded-2 transition-colors outline-none hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        on ? "text-cobalt-bright" : "text-ink-3 hover:text-foreground",
        className,
      )}
    >
      {on ? (
        <Volume2 aria-hidden className="size-4" />
      ) : (
        <VolumeX aria-hidden className="size-4" />
      )}
    </button>
  );
}
