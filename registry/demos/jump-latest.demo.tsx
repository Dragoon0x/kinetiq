"use client";

import * as React from "react";

import { JumpLatest, type JumpMessage } from "@/registry/ui/jump-latest";

const msg = (
  id: string,
  author: string,
  time: string,
  text: string,
  own = false,
): JumpMessage => ({ id, author, time, text, own });

const SEED: JumpMessage[] = [
  msg("1", "Rui Baptista", "01:40", "Yard gate is shut. Dock two has the run."),
  msg("2", "Ines Moreau", "01:44", "Keys back on the hook?", true),
  msg("3", "Rui Baptista", "01:45", "On the hook, both sets."),
  msg("4", "Ines Moreau", "01:52", "Good. Pallet 4471 still held?", true),
  msg("5", "Rui Baptista", "01:58", "Held. Waylight Pay has not cleared it."),
  msg("6", "Marta Ferreira", "02:05", "I have the paperwork here."),
  msg("7", "Ines Moreau", "02:07", "Leave it under the sheet.", true),
  msg(
    "8",
    "Marta Ferreira",
    "02:09",
    "Done. Loader is booked until half past.",
  ),
  msg("9", "Rui Baptista", "02:16", "Dock three frees up at nine."),
  msg("10", "Ines Moreau", "02:18", "Take it if the yard needs it.", true),
  msg("11", "Marta Ferreira", "02:24", "Basinworks crates are labelled."),
  msg("12", "Rui Baptista", "02:31", "Handover sheet is on the desk."),
];

/** A seeded script, walked by index — no clock, no randomness. */
const SCRIPT = [
  msg("s1", "Marta Ferreira", "02:38", "Coldbrook depot closes Thursday."),
  msg("s2", "Marta Ferreira", "02:39", "Nothing leaves the yard after eleven."),
  msg("s3", "Rui Baptista", "02:41", "Noted. I will move the morning run up."),
  msg("s4", "Ines Moreau", "02:44", "Fernworks returns can wait.", true),
];

const CAP = 40;
const chip =
  "flex h-8 items-center rounded-2 border border-hairline-strong px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50";

export function JumpLatestDemo() {
  const [thread, setThread] = React.useState<JumpMessage[]>(SEED);
  const [step, setStep] = React.useState(0);
  const [count, setCount] = React.useState(0);
  const [atBottom, setAtBottom] = React.useState(true);

  const arrive = () => {
    const added: JumpMessage[] = [];
    for (let n = 0; n < 3; n += 1) {
      const line = SCRIPT[(step + n) % SCRIPT.length];
      if (line) added.push({ ...line, id: `${line.id}-${step + n}` });
    }
    setStep(step + 3);
    setThread((prev) => [...prev, ...added].slice(-CAP));
  };

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <JumpLatest
        label="Coldbrook night shift"
        messages={thread}
        onNewCountChange={setCount}
        onAtBottomChange={setAtBottom}
      />

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={arrive} className={chip}>
          Three arrive
        </button>
        <button
          type="button"
          onClick={() => setThread(SEED)}
          disabled={thread.length === SEED.length}
          className={chip}
        >
          Reset the thread
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">
          {atBottom
            ? "at the latest"
            : count === 0
              ? "scrolled up"
              : `${count} new below`}
        </span>
        {` · ${thread.length} messages`}
      </p>
    </div>
  );
}
