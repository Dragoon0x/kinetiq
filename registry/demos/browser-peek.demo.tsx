"use client";

import * as React from "react";

import { BrowserPeek, type PeekSnapshot } from "@/registry/ui/browser-peek";

/** Fernworks Model 3 checking a savings rate on basinworks.example. */
const PAGES: PeekSnapshot[] = [
  {
    id: "home",
    url: "basinworks.example",
    title: "Basinworks",
    blocks: [
      { kind: "nav" },
      { kind: "hero" },
      { kind: "heading", width: 55 },
      { kind: "text", width: 90 },
      { kind: "text", width: 72 },
      { kind: "button" },
    ],
    click: { x: 84, y: 6, target: "Rates" },
  },
  {
    id: "rates",
    url: "basinworks.example/rates",
    title: "Basin rates",
    blocks: [
      { kind: "nav" },
      { kind: "heading", width: 40 },
      { kind: "text", width: 85 },
      { kind: "cards" },
      { kind: "text", width: 60 },
    ],
    click: { x: 22, y: 50, target: "Savings" },
  },
  {
    id: "savings",
    url: "basinworks.example/rates/savings",
    title: "Savings rates",
    blocks: [
      { kind: "nav" },
      { kind: "heading", width: 48 },
      { kind: "text", width: 92 },
      { kind: "text", width: 88 },
      { kind: "text", width: 64 },
      { kind: "button", width: 22 },
    ],
    click: { x: 12, y: 58, target: "12 months" },
  },
  {
    id: "term",
    url: "basinworks.example/rates/savings?term=12",
    title: "12-month savings rate",
    blocks: [
      { kind: "nav" },
      { kind: "heading", width: 62 },
      { kind: "hero" },
      { kind: "text", width: 80 },
      { kind: "text", width: 44 },
    ],
  },
];

const STEP_MS = 1700;

const button =
  "flex h-8 items-center rounded-2 border border-hairline-strong px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50";

export function BrowserPeekDemo() {
  const [index, setIndex] = React.useState(0);
  const [browsing, setBrowsing] = React.useState(false);

  // A hidden tab holds the walk where it is rather than finishing unseen.
  const [visible, setVisible] = React.useState(true);
  React.useEffect(() => {
    const onVisibility = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  React.useEffect(() => {
    if (!browsing || !visible) return;
    const timer = window.setTimeout(() => {
      if (index >= PAGES.length - 1) setBrowsing(false);
      else setIndex((current) => current + 1);
    }, STEP_MS);
    return () => window.clearTimeout(timer);
  }, [browsing, visible, index]);

  const page = PAGES[index];

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <BrowserPeek
        label="Fernworks Model 3 browser"
        snapshots={PAGES}
        index={index}
        onIndexChange={(next) => {
          // Stepping by hand takes the walk over from the script.
          setBrowsing(false);
          setIndex(next);
        }}
        live={browsing}
      />

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setIndex(0);
            setBrowsing(true);
          }}
          disabled={browsing}
          className={button}
        >
          Browse
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Page {index + 1} of {PAGES.length} ·{" "}
        <span className="normal-case">{page?.url ?? ""}</span>
        {browsing ? " · browsing" : ""}
        {page?.click ? ` · clicked ${page.click.target}` : ""}
      </p>
    </div>
  );
}
