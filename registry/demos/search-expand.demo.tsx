"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { defaultSearchNav, SearchExpand } from "@/registry/ui/search-expand";

export const tweaks = defineTweaks({
  width: {
    kind: "range",
    label: "Width",
    default: 320,
    min: 200,
    max: 480,
    step: 20,
    unit: "px",
  },
  results: {
    kind: "range",
    label: "Results",
    default: 5,
    min: 3,
    max: 8,
    step: 1,
  },
  tuck: {
    kind: "range",
    label: "Tuck",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.1,
  },
});

type Project = {
  name: string;
  meta: string;
  state: "Active" | "Review" | "Draft";
};

const PROJECTS: Project[] = [
  {
    name: "Basin Road survey",
    meta: "14 plots · Ines Calder",
    state: "Active",
  },
  {
    name: "Coldbrook wetland",
    meta: "9 transects · Tomas Reyes",
    state: "Review",
  },
  {
    name: "Waylight orchard trial",
    meta: "220 trees · Priya Anand",
    state: "Draft",
  },
  {
    name: "Gauge river flow",
    meta: "6 stations · Bram Okafor",
    state: "Active",
  },
];

const STATE_TONE: Record<Project["state"], string> = {
  Active: "text-success",
  Review: "text-warn",
  Draft: "text-ink-3",
};

function Page({ title }: { title: string }) {
  return (
    <div className="flex flex-col px-3 pt-3">
      <div className="flex items-center justify-between gap-3 pb-2">
        <p className="truncate text-sm font-medium text-foreground">{title}</p>
        <p className="shrink-0 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          4 projects
        </p>
      </div>
      <ul role="list" className="flex flex-col">
        {PROJECTS.map((p) => (
          <li
            key={p.name}
            className="flex h-9 items-center gap-3 border-t border-hairline text-[13px]"
          >
            <span className="min-w-0 flex-1 truncate text-foreground">
              {p.name}
            </span>
            <span className="hidden min-w-0 truncate text-[11px] text-ink-3 @min-[420px]:inline">
              {p.meta}
            </span>
            <span className={`shrink-0 text-[11px] ${STATE_TONE[p.state]}`}>
              {p.state}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Fernworks Studio's header over its Projects page. Open the search (or type
 * "/") and the bar makes room for it.
 */
export function SearchExpandDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [page, setPage] = React.useState("projects");
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [tucked, setTucked] = React.useState<string[]>([]);
  const [opened, setOpened] = React.useState<string | null>(null);
  const title =
    defaultSearchNav.find((it) => it.id === page)?.label ?? "Projects";
  const total = defaultSearchNav.length;

  return (
    <div className="flex w-full max-w-3xl flex-col gap-3">
      <div
        className="w-full overflow-clip rounded-3 border border-hairline bg-background"
        style={{ height: chrome ? 268 : 216 }}
      >
        <SearchExpand
          className="h-full"
          value={page}
          onValueChange={(id) => {
            setPage(id);
            setOpened(null);
          }}
          onOpenChange={(next) => {
            setOpen(next);
            if (next) setOpened(null);
          }}
          onQueryChange={setQuery}
          onTuckChange={setTucked}
          onSelect={(entry) => setOpened(entry.title)}
          actions={
            <button
              type="button"
              aria-label="Account, Ines Calder"
              className="inline-flex size-7 items-center justify-center rounded-full bg-cobalt-wash font-mono text-[10px] font-medium text-cobalt-bright outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
            >
              IC
            </button>
          }
          sound={sound}
          {...values}
        >
          <Page title={title} />
        </SearchExpand>
      </div>
      {chrome ? (
        <p
          role="status"
          className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          {opened ? (
            <>
              <span className="text-signal">opened {opened}</span> · {title}
            </>
          ) : open ? (
            <>
              <span className="text-signal">
                {query.trim() ? `searching “${query.trim()}”` : "search open"}
              </span>{" "}
              · {tucked.length} in more
            </>
          ) : (
            <>
              <span className="text-signal">search closed</span> ·{" "}
              {total - tucked.length} of {total} in the bar
            </>
          )}
        </p>
      ) : null}
    </div>
  );
}
