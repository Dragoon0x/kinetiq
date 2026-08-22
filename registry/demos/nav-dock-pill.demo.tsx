"use client";

import { NavDockPill } from "@/registry/blocks/nav-dock-pill/nav-dock-pill";

const PASSAGES = [
  "Ovenword is a weekly letter on baking as a practice — one technique, one recipe, one thing worth rereading.",
  "Every issue closes with the bake log: what the test kitchen tried, at what hydration, and how it went.",
];

export function NavDockPillDemo() {
  return (
    <div className="w-full">
      <NavDockPill />
      <div className="mx-auto w-full max-w-7xl px-6 pt-16 pb-[70vh]">
        <h2 className="max-w-xl text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          Pick a link — the dot slides to its new home.
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
