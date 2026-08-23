"use client";

import { NavAtlasPanel } from "@/registry/blocks/nav-atlas-panel/nav-atlas-panel";

/** Page filler below so the header sits over something real. */
export function NavAtlasPanelDemo() {
  return (
    <div className="w-full">
      <NavAtlasPanel />
      <div className="mx-auto w-full max-w-7xl px-6 pt-16 pb-[60vh]">
        <h2 className="max-w-xl text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          The page begins under the header.
        </h2>
        <p className="text-ink-2 mt-6 max-w-xl leading-relaxed">
          Open the menu, try the panel, resize the frame — the header manages
          its own fold and never moves the content underneath it.
        </p>
      </div>
    </div>
  );
}
