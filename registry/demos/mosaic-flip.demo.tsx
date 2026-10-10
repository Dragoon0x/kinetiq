"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { MosaicFlip, type MosaicFlipImage } from "@/registry/ui/mosaic-flip";

export const tweaks = defineTweaks({
  grid: {
    kind: "range",
    label: "Grid",
    default: 8,
    min: 4,
    max: 14,
    step: 2,
  },
  origin: {
    kind: "choice",
    label: "Origin",
    default: "pointer",
    options: ["pointer", "corner", "edge", "center"],
    names: {
      pointer: "Pointer",
      corner: "Corner",
      edge: "Edge",
      center: "Centre",
    },
  },
  speed: {
    kind: "range",
    label: "Speed",
    default: 1,
    min: 0.5,
    max: 2,
    step: 0.1,
    unit: "×",
  },
});

/** Painted plates for the journal: fixed art, the same in both themes. */
const plate = (body: string) =>
  `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180" viewBox="0 0 320 180">${body}</svg>`,
  )}`;

const PLATES: MosaicFlipImage[] = [
  {
    alt: "Salt flats at dawn",
    src: plate(
      `<defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="rgb(176,188,222)"/><stop offset="1" stop-color="rgb(246,212,192)"/></linearGradient><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="rgb(240,224,214)"/><stop offset="1" stop-color="rgb(198,200,220)"/></linearGradient></defs><rect width="320" height="112" fill="url(#s)"/><circle cx="214" cy="106" r="15" fill="rgb(255,238,218)"/><rect y="112" width="320" height="68" fill="url(#g)"/><ellipse cx="214" cy="122" rx="46" ry="4" fill="rgb(255,240,226)" opacity="0.8"/><path d="M0 112h320" stroke="rgb(150,142,172)" stroke-width="0.6"/><path d="M24 146h70M118 160h96M236 142h58M60 172h80" stroke="rgb(214,206,222)" stroke-width="1.2"/>`,
    ),
  },
  {
    alt: "Harbour fog",
    src: plate(
      `<defs><linearGradient id="f" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="rgb(206,214,220)"/><stop offset="1" stop-color="rgb(170,184,194)"/></linearGradient></defs><rect width="320" height="180" fill="url(#f)"/><g fill="rgb(150,164,176)"><rect x="40" y="70" width="4" height="70"/><rect x="74" y="74" width="4" height="66"/><rect x="108" y="78" width="4" height="62"/><rect x="142" y="82" width="4" height="58"/><rect x="30" y="98" width="140" height="5"/></g><path d="M196 120h86l-10 12h-68z" fill="rgb(118,134,148)"/><rect x="226" y="88" width="3" height="32" fill="rgb(118,134,148)"/><path d="M229 90l26 26h-26z" fill="rgb(138,152,166)"/><rect y="138" width="320" height="42" fill="rgb(160,176,188)"/><path d="M0 150h320M0 162h320M0 172h320" stroke="rgb(182,196,206)" stroke-width="1"/><rect y="40" width="320" height="26" fill="rgb(222,228,232)" opacity="0.55"/><rect y="106" width="320" height="18" fill="rgb(214,222,228)" opacity="0.5"/>`,
    ),
  },
  {
    alt: "Pine ridge after rain",
    src: plate(
      `<rect width="320" height="180" fill="rgb(196,212,204)"/><path d="M0 92l40-22 46 18 52-30 60 26 48-18 74 24v90H0z" fill="rgb(140,170,156)"/><rect y="96" width="320" height="10" fill="rgb(214,226,220)" opacity="0.6"/><path d="M0 120l56-26 48 16 64-28 54 22 98-16v92H0z" fill="rgb(84,122,104)"/><g fill="rgb(48,82,68)"><path d="M30 150l12-36 12 36z"/><path d="M58 152l10-28 10 28z"/><path d="M196 148l14-40 14 40z"/><path d="M228 152l10-30 10 30z"/><path d="M260 150l12-36 12 36z"/></g><path d="M0 148l70-14 80 10 90-16 80 12v40H0z" fill="rgb(40,70,58)"/>`,
    ),
  },
  {
    alt: "Night ferry",
    src: plate(
      `<defs><linearGradient id="n" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="rgb(16,24,48)"/><stop offset="1" stop-color="rgb(44,58,96)"/></linearGradient></defs><rect width="320" height="120" fill="url(#n)"/><circle cx="74" cy="40" r="11" fill="rgb(236,232,212)"/><g fill="rgb(220,226,246)"><circle cx="150" cy="24" r="0.9"/><circle cx="212" cy="16" r="1.1"/><circle cx="262" cy="40" r="0.8"/><circle cx="118" cy="56" r="0.7"/><circle cx="296" cy="22" r="0.9"/><circle cx="30" cy="80" r="0.7"/></g><rect y="120" width="320" height="60" fill="rgb(20,30,56)"/><path d="M150 106h104l-12 16h-84z" fill="rgb(10,14,28)"/><rect x="170" y="94" width="58" height="12" fill="rgb(10,14,28)"/><rect x="200" y="84" width="6" height="10" fill="rgb(10,14,28)"/><g fill="rgb(246,206,130)"><rect x="176" y="98" width="5" height="4"/><rect x="186" y="98" width="5" height="4"/><rect x="196" y="98" width="5" height="4"/><rect x="206" y="98" width="5" height="4"/><rect x="216" y="98" width="5" height="4"/></g><g stroke="rgb(246,206,130)" stroke-width="1.4" opacity="0.6"><path d="M178 128h4M188 134h5M198 130h4M208 138h5M218 128h4"/></g><path d="M66 130h16M60 142h28M68 156h12" stroke="rgb(236,232,212)" stroke-width="1.2" opacity="0.5"/>`,
    ),
  },
];

/**
 * Waylight's field journal: four painted plates from one week on the coast,
 * turned tile by tile.
 */
export function MosaicFlipDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [index, setIndex] = React.useState(0);
  // A new grid, origin or pace is shown at once: the journal turns a page.
  const look = `${values.grid}|${values.origin}|${values.speed}`;
  const [shownLook, setShownLook] = React.useState(look);
  if (shownLook !== look) {
    setShownLook(look);
    setIndex((i) => (i + 1) % PLATES.length);
  }
  const current = PLATES[index];

  const gallery = (
    <MosaicFlip
      images={PLATES}
      value={index}
      onValueChange={setIndex}
      autoplay={4200}
      label="Waylight field journal"
      sound={sound}
      className={
        chrome
          ? "aspect-auto h-60 rounded-3 sm:h-72"
          : "aspect-auto h-52 rounded-3"
      }
      {...values}
    />
  );

  if (!chrome) return <div className="w-full max-w-2xl">{gallery}</div>;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
        Waylight · field journal
      </p>
      {gallery}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">
          {index + 1} of {PLATES.length}
        </span>{" "}
        · {current?.alt.toLowerCase()} · arrows, dots or a click turn it
      </p>
    </div>
  );
}
