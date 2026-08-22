"use client";

import { NavGlassRail } from "@/registry/blocks/nav-glass-rail/nav-glass-rail";

/** Page filler below the rail so the condensing has something to condense over. */
const PASSAGES = [
  "Fieldline keeps a bench for every experiment — what was tried, what held, and what the next pass should change.",
  "Recipes are versioned like code: fork one, adjust the cure time, and the diff travels with the batch.",
  "The journal is the part teams keep: a plain record of decisions made while the work was still warm.",
];

export function NavGlassRailDemo() {
  return (
    <div className="w-full">
      <NavGlassRail activeHref="#product" />
      <div className="mx-auto w-full max-w-7xl px-6 pt-16 pb-[70vh]">
        <h2 className="max-w-xl text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          Scroll — the rail condenses once content moves under it.
        </h2>
        <div className="mt-10 flex max-w-xl flex-col gap-8">
          {PASSAGES.map((passage) => (
            <p key={passage} className="text-ink-2 leading-relaxed">
              {passage}
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}
