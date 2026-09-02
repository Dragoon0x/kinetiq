"use client";

import { PressureButton } from "@/registry/ui/pressure-button";
import { ReadingRuler } from "@/registry/ui/reading-ruler";

const SIGHTINGS = [
  { plot: "C3", species: "sedge warbler", count: "6", note: "nesting" },
  { plot: "C7", species: "marsh harrier", count: "1", note: "passing" },
  { plot: "D1", species: "bearded tit", count: "14", note: "flocking" },
] as const;

/** A field report — several paragraphs of prose and a small table — for the
 * ruler to read. Move the cursor down the page: the line under it stays
 * plain, and everything else softens and dims around it. */
export function ReadingRulerDemo() {
  return (
    <div className="flex w-full flex-col items-center gap-3">
      <ReadingRuler className="w-full max-w-2xl rounded-4 border border-hairline bg-surface-1">
        <div className="flex flex-col gap-4 p-6 sm:p-8">
          <div>
            <p className="text-label text-ink-3">Fieldline · plot C, week 9</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              The reed bed survey, written up.
            </h2>
          </div>
          <p className="text-sm leading-relaxed text-ink-2">
            Water stayed high through the count, which kept the boardwalk crew
            off two of the southern plots until Thursday. Where we did reach,
            the reed stood thick enough that most calls came before any bird
            broke cover, so the tally below leans on song more than sight.
          </p>
          <p className="text-sm leading-relaxed text-ink-2">
            Plot C held steady against last season, with the sedge warblers back
            in the same stand of reed they used the year before. The harrier
            over D1 was a single pass, not a hunt, and it did not return before
            we packed the scopes.
          </p>
          <p className="text-sm leading-relaxed text-ink-2">
            Bearded tits ran in one loose flock rather than the usual pairs,
            which the crew put down to the wind. Next week&apos;s count moves to
            plot E, weather allowing, with the same start time at first light.
          </p>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-hairline text-left">
                <th className="py-2 pr-4 text-label text-ink-3">Plot</th>
                <th className="py-2 pr-4 text-label text-ink-3">Species</th>
                <th className="py-2 pr-4 text-label text-ink-3">Count</th>
                <th className="py-2 text-label text-ink-3">Note</th>
              </tr>
            </thead>
            <tbody>
              {SIGHTINGS.map((row) => (
                <tr key={row.plot} className="border-b border-hairline">
                  <td className="py-2 pr-4 font-mono text-xs text-ink-2">
                    {row.plot}
                  </td>
                  <td className="py-2 pr-4 font-medium text-ink">
                    {row.species}
                  </td>
                  <td className="py-2 pr-4 font-mono text-xs text-ink-2 tabular-nums">
                    {row.count}
                  </td>
                  <td className="py-2 text-ink-2">{row.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex flex-wrap items-center gap-3">
            <PressureButton variant="solid">Submit the count</PressureButton>
            <PressureButton variant="outline">Flag plot D1</PressureButton>
          </div>
        </div>
      </ReadingRuler>
      <p className="text-center font-mono text-xs text-ink-3">
        one line at a time
      </p>
    </div>
  );
}
