"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { AppShell, defaultShellPages } from "@/registry/ui/app-shell";

export const tweaks = defineTweaks({
  rail: { kind: "toggle", label: "Icon rail", default: true },
  transition: {
    kind: "choice",
    label: "Transition",
    default: "slide",
    options: ["slide", "fade", "zoom"],
    names: { slide: "Slide", fade: "Fade", zoom: "Zoom" },
  },
  density: {
    kind: "choice",
    label: "Density",
    default: "cozy",
    options: ["compact", "cozy", "roomy"],
    names: { compact: "Compact", cozy: "Cozy", roomy: "Roomy" },
  },
});

const NOTES: Record<string, string> = {
  overview: "seven jobs, three teams",
  jobs: "one running late",
  crew: "two engineers free",
};

/**
 * Fieldline Ops on a Tuesday morning: the dispatcher's shell, with the
 * overview, today's jobs and the crew one press (or one key) apart.
 */
export function AppShellDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [page, setPage] = React.useState("overview");
  const [fold, setFold] = React.useState<boolean | null>(null);
  const [lastWas, setLastWas] = React.useState<"page" | "fold">("page");

  const shell = (
    <AppShell
      page={page}
      onPageChange={(id) => {
        setPage(id);
        setLastWas("page");
      }}
      onCollapsedChange={(next) => {
        setFold(next);
        setLastWas("fold");
      }}
      sound={sound}
      {...values}
    />
  );

  if (!chrome) return <div className="w-full">{shell}</div>;

  const label =
    defaultShellPages.find((p) => p.id === page)?.label.toLowerCase() ?? page;
  const rail = values.rail !== false;

  return (
    <div className="flex w-full max-w-6xl flex-col gap-4">
      {shell}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {lastWas === "fold" && fold !== null ? (
          <>
            <span className="text-signal">
              {fold
                ? rail
                  ? "sidebar on its rail"
                  : "sidebar hidden"
                : "sidebar open"}
            </span>{" "}
            ·{" "}
            {fold
              ? rail
                ? "labels moved into tooltips"
                : "[ brings it back"
              : "drag its edge to fold it"}
          </>
        ) : (
          <>
            <span className="text-signal">{label}</span> ·{" "}
            {NOTES[page] ?? "ready"} · 1 to 3 switch pages · [ folds the sidebar
          </>
        )}
      </p>
    </div>
  );
}
