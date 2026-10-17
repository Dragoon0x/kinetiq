"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  defaultRailSections,
  DoubleRail,
  type RailSection,
} from "@/registry/ui/double-rail";

export const tweaks = defineTweaks({
  panelWidth: {
    kind: "range",
    label: "Panel",
    default: 220,
    min: 180,
    max: 280,
    step: 20,
    unit: "px",
  },
  slideDirection: {
    kind: "choice",
    label: "Slide",
    default: "sideways",
    options: ["sideways", "vertical", "fade"],
    names: { sideways: "Sideways", vertical: "Vertical", fade: "Fade" },
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
      "oklch(from var(--accent-bright) l c 320)": "Plum",
    },
  },
});

/** Settings arrives a moment after it is first opened, like a real fetch. */
const LOADING_SETTINGS: RailSection[] = defaultRailSections.map((s) =>
  s.id === "settings" ? { ...s, loading: true } : s,
);

const BUTTON = cn(
  "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none",
  "hover:bg-surface-2 hover:text-foreground",
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
);

/**
 * Gaugeworks, a fleet operator’s back office: Fleet, Billing and People with
 * their lists, Reports still empty, and Settings that loads on first visit.
 */
export function DoubleRailDemo({
  chrome = true,
  // The navigation is silent: the stage's sound switch has nothing to play.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [round, setRound] = React.useState(0);
  const [sections, setSections] = React.useState(LOADING_SETTINGS);
  const [where, setWhere] = React.useState({ section: "fleet", page: "vans" });
  const [collapsed, setCollapsed] = React.useState(false);
  const [event, setEvent] = React.useState<string | null>(null);

  const settingsLoading = sections.some((s) => s.loading);
  React.useEffect(() => {
    if (where.section !== "settings" || !settingsLoading) return;
    const t = window.setTimeout(() => setSections(defaultRailSections), 900);
    return () => window.clearTimeout(t);
  }, [where.section, settingsLoading]);

  const section = sections.find((s) => s.id === where.section);
  const item = section?.groups
    ?.flatMap((g) => g.items)
    .find((i) => i.id === where.page);

  const surface = (
    <DoubleRail
      key={round}
      sections={sections}
      collapsed={collapsed}
      onCollapse={setCollapsed}
      onSection={(id) => {
        setWhere((w) => ({ ...w, section: id }));
        setEvent(null);
      }}
      onNavigate={(sectionId, page) => {
        setWhere({ section: sectionId, page });
        setEvent(null);
      }}
      onEmptyAction={() => setEvent("new report started")}
      {...values}
    />
  );

  if (!chrome) return <div className="w-full">{surface}</div>;

  const line = collapsed
    ? "panel collapsed"
    : (event ??
      (section?.loading
        ? `${section.label.toLowerCase()} · loading`
        : item
          ? `${section?.label.toLowerCase()} · ${item.label.toLowerCase()}${item.count !== undefined ? ` · ${item.count}` : ""}`
          : `${section?.label.toLowerCase() ?? ""} · empty`));

  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      {surface}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setSections(LOADING_SETTINGS);
            setWhere({ section: "fleet", page: "vans" });
            setCollapsed(false);
            setEvent(null);
            setRound((r) => r + 1);
          }}
          className={BUTTON}
        >
          <RotateCcw aria-hidden className="size-3.5" />
          Reset
        </button>
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">gaugeworks</span>
        {` · ${line}`}
      </p>
    </div>
  );
}
