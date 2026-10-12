"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { SlateCourses } from "@/registry/ui/slate-courses";

export const tweaks = defineTweaks({
  courses: {
    kind: "range",
    label: "Courses",
    default: 7,
    min: 4,
    max: 10,
    step: 1,
  },
  overlap: {
    kind: "range",
    label: "Overlap",
    default: 0.4,
    min: 0.2,
    max: 0.6,
    step: 0.05,
  },
  stagger: {
    kind: "range",
    label: "Stagger",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
});

/**
 * Fieldline Farm Stays: the landing page's barn roof is slated, course by
 * course, as the visitor scrolls, until the sign paint across it reads.
 */
export function SlateCoursesDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const motionSafe = useMotionSafe();
  const boxRef = React.useRef<HTMLDivElement | null>(null);
  const [laid, setLaid] = React.useState(2);
  const box = chrome ? 480 : 540;
  const courses = values.courses ?? tweaks.courses.default;

  const page = (
    <div
      ref={boxRef}
      tabIndex={0}
      role="region"
      aria-label="Fieldline Farm Stays"
      className="w-full overflow-y-auto overscroll-contain rounded-3 border border-hairline bg-background outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
      style={{ height: box }}
    >
      <div className="flex flex-col gap-1.5 px-5 pt-5 pb-3">
        <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          Fieldline · Barn conversions in the Coldbrook valley
        </p>
        <p className="max-w-prose text-sm text-ink-2">
          Three barns, one long view. Scroll down and we will put the roof on.
        </p>
      </div>
      <SlateCourses
        height={box - 2}
        onCoursesChange={setLaid}
        sound={sound}
        {...values}
      />
      <div className="flex flex-col gap-2 px-5 pt-5 pb-8 text-sm text-ink-2">
        <p className="max-w-prose">
          Each barn sleeps four. Slate from the old quarry at Basin Head, laid
          by hand, and a fire in every room.
        </p>
      </div>
    </div>
  );

  if (!chrome) return <div className="flex w-full max-w-3xl">{page}</div>;

  const shown = Math.min(laid, courses);
  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      {page}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
        <p
          role="status"
          className="min-w-0 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          <span className="text-signal">
            {shown} of {courses} courses laid
          </span>
          {shown >= courses ? " · the roof is on" : " · keep scrolling"}
        </p>
        <button
          type="button"
          onClick={() =>
            boxRef.current?.scrollTo({
              top: 0,
              behavior: motionSafe ? "smooth" : "auto",
            })
          }
          className="inline-flex h-8 shrink-0 items-center rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
        >
          Back to top
        </button>
      </div>
    </div>
  );
}
