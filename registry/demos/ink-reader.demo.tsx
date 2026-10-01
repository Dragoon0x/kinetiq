"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { InkReader } from "@/registry/ui/ink-reader";

export const tweaks = defineTweaks({
  light: {
    kind: "range",
    label: "Front light",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
  warmth: {
    kind: "range",
    label: "Warmth",
    default: 0.3,
    min: 0,
    max: 1,
    step: 0.05,
  },
  refresh: {
    kind: "choice",
    label: "Refresh",
    default: "full",
    options: ["full", "fast"],
    names: { full: "Full", fast: "Fast" },
  },
});

const CHAPTER = [
  "The weir at Basin 3 is not much to look at in winter. A grey lip of concrete, a sill of green weed, and the river going over it in one smooth sheet that never seems to hurry. You could stand on the footbridge for an hour and believe nothing was happening at all.",
  "The keeper knows better. Every morning she walks out along the wall with a notebook in her coat and reads the gauge board: a white post marked in tenths, half hidden by the spray. She writes the number down before she looks at anything else, because the number is the only thing the river will not argue with later.",
  "In January the reading barely moves. Snow sits on the hills above Fieldline and the water comes down cold and thin. She clears the trash screen of the leaves that blew in over the autumn, oils the sluice chain, and listens. A weir has a voice, she says, and a change in it is the first sign of anything.",
  "February is the month of small floods. A warm night, a little rain, and by morning the sheet over the lip has thickened into a roll that hides the sill completely. She opens the side gate a turn at a time and watches the gauge between turns. Too fast and the bank below the outfall scours; too slow and the meadow on the far side goes under.",
  "By March the herons are back, standing in the slack water at the foot of the apron as if someone had placed them there. The keeper does not count them, but she notes the day the first one arrives. Over the years the date has crept earlier. She has not decided what to make of that, and she writes it down anyway.",
  "Spring work is mostly mud. The silt trap fills with what the floods brought down, and someone has to dig it out before the summer. Two of them do it with long spades and a barrow, and it takes most of a week. What comes out is grey, then brown, then, at the very bottom, a clean yellow sand that nobody can explain.",
  "Summer is quiet in a different way. The river drops until the sheet over the lip breaks into separate threads, and the threads into drops, and some evenings the weir is almost silent. Children come down to paddle in the pool below it. The keeper tells them where the steps are and where the holes are, and does not tell them to go home.",
  "There is a fish pass at the north end, a staircase of shallow pools for anything that wants to climb. In August she lifts the cover at dusk and shines a torch into the top pool. Most nights there is nothing. Once, years ago, there was a trout as long as her arm, holding still in the current, and she put the cover back very gently.",
  "Autumn brings the leaves again, and the first proper rain, and the sound of the weir finding its voice. She walks the wall with the notebook in her coat and reads the white post through the spray, and writes the number down before she looks at anything else.",
  "People ask her whether it is lonely work. She says it is the opposite. The river is always arriving from somewhere and always leaving for somewhere else, and the weir is the one place where it stops long enough to be measured. Somebody, she says, ought to be there when it does.",
];

/**
 * Fernworks Books, reading on a small e-reader: chapter two of an essay
 * about a weir through the year.
 */
export function InkReaderDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [page, setPage] = React.useState(1);
  const [pages, setPages] = React.useState<number | null>(null);
  // The slider moves the light; a new tweak value moves it again.
  const tweakLight = values.light ?? tweaks.light.default;
  const [light, setLight] = React.useState(tweakLight);
  const [seen, setSeen] = React.useState(tweakLight);
  if (seen !== tweakLight) {
    setSeen(tweakLight);
    setLight(tweakLight);
  }

  const reader = (
    <InkReader
      label="Fernworks Books reader"
      title="The Weir Keeper's Year · 2"
      page={page}
      onPageChange={setPage}
      onPageCountChange={setPages}
      onLightChange={setLight}
      sound={sound}
      {...values}
    >
      <h2 className="mb-[0.6em] font-sans text-[1.15em] leading-tight font-semibold text-foreground">
        Two · Reading the gauge
      </h2>
      {CHAPTER.map((p, i) => (
        <p
          key={i}
          className="mb-[0.7em] font-sans text-foreground"
          style={{ textIndent: i === 0 ? 0 : "1.2em" }}
        >
          {p}
        </p>
      ))}
    </InkReader>
  );

  if (!chrome) {
    return <div className="flex w-full max-w-[280px]">{reader}</div>;
  }

  return (
    <div className="flex w-full max-w-80 flex-col gap-4">
      <div className="flex w-full max-w-[268px] self-center">{reader}</div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">
          page {pages ? Math.min(page, pages) : page}
          {pages ? ` of ${pages}` : ""}
        </span>{" "}
        · light {Math.round(light * 100)}% ·{" "}
        {(values.refresh ?? tweaks.refresh.default) === "full"
          ? "full refresh"
          : "fast refresh"}
      </p>
    </div>
  );
}
