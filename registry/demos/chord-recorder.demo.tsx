"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  ChordRecorder,
  defaultChordCommands,
  formatChord,
} from "@/registry/ui/chord-recorder";

export const tweaks = defineTweaks({
  keycapStyle: {
    kind: "choice",
    label: "Keycaps",
    default: "raised",
    options: ["raised", "flat", "outline"],
    names: { raised: "Raised", flat: "Flat", outline: "Outline" },
  },
  density: {
    kind: "choice",
    label: "Density",
    default: "regular",
    options: ["compact", "regular", "roomy"],
    names: { compact: "Compact", regular: "Regular", roomy: "Roomy" },
  },
  accent: {
    kind: "choice",
    label: "Accent",
    default: "cobalt",
    options: ["cobalt", "signal", "amber", "graphite"],
    names: {
      cobalt: "Cobalt",
      signal: "Signal",
      amber: "Amber",
      graphite: "Graphite",
    },
  },
});

const nameOf = (id: string) =>
  (defaultChordCommands.find((c) => c.id === id)?.label ?? id).toLowerCase();

/**
 * The Fieldline editor's shortcut settings. Try giving Toggle sidebar ⌘B:
 * Bold already has it, so its row steps aside and offers a swap.
 */
export function ChordRecorderDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [line, setLine] = React.useState<{ lead: string; rest: string }>({
    lead: "17 shortcuts",
    rest: "enter on a binding to record",
  });
  // The status line prints chords in Mac glyphs only once the page is read
  // as a Mac — the server and the first render both say Ctrl.
  const mac = React.useSyncExternalStore(
    () => () => {},
    () =>
      typeof navigator !== "undefined" &&
      /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent),
    () => false,
  );

  const recorder = (
    <ChordRecorder
      sound={sound}
      onBind={(id, binding) =>
        setLine({
          lead: nameOf(id),
          rest: binding ? `${formatChord(binding, mac)} · recorded` : "cleared",
        })
      }
      onSwap={(id, other, binding) =>
        setLine({
          lead: "swapped",
          rest: `${nameOf(id)} ${formatChord(binding, mac)} · ${nameOf(other)} takes the old one`,
        })
      }
      onReset={(id) =>
        setLine({
          lead: id ? `${nameOf(id)}` : "reset all",
          rest: id ? "back to default" : "every default restored",
        })
      }
      {...values}
    />
  );

  if (!chrome) return <div className="w-full">{recorder}</div>;

  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      {recorder}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">{line.lead}</span> · {line.rest}
      </p>
    </div>
  );
}
