"use client";

import * as React from "react";

import { StepSlide } from "@/registry/ui/step-slide";

const FIELD =
  "h-9 w-full rounded-2 border border-input bg-surface-0 px-3 text-sm text-foreground outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

const CREW = [
  { id: "wl-1", name: "Rosa Amberlink", email: "rosa@waylight.test" },
  { id: "wl-2", name: "Teo Bramhall", email: "teo@waylight.test" },
  { id: "wl-3", name: "June Rakes", email: "june@waylight.test" },
];

const STEPS = [
  {
    id: "workspace",
    title: "Workspace",
    content: (
      <div className="flex flex-col gap-1.5">
        <label htmlFor="waylight-name" className="text-xs text-ink-3">
          Workspace name
        </label>
        <input
          id="waylight-name"
          defaultValue="Waylight North"
          className={FIELD}
        />
      </div>
    ),
  },
  {
    id: "team",
    title: "Team",
    content: (
      <ul className="flex flex-col gap-1.5">
        {CREW.map((member) => (
          <li
            key={member.id}
            className="flex items-center gap-2.5 rounded-2 border border-hairline bg-surface-0 p-2"
          >
            <span
              aria-hidden
              className="flex size-7 shrink-0 items-center justify-center rounded-full bg-cobalt-wash text-[10px] font-semibold text-cobalt-bright"
            >
              {member.name.charAt(0)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm text-foreground">
                {member.name}
              </span>
              <span className="block truncate text-xs text-ink-3">
                {member.email}
              </span>
            </span>
          </li>
        ))}
      </ul>
    ),
  },
  {
    id: "notifications",
    title: "Notifications",
    content: (
      <div className="flex flex-col gap-2">
        {["Run summaries, daily", "Drift alerts, immediately"].map((line) => (
          <label key={line} className="flex items-center gap-2.5 text-sm">
            <input
              type="checkbox"
              defaultChecked
              className="size-4 shrink-0 accent-primary"
            />
            <span className="min-w-0 truncate">{line}</span>
          </label>
        ))}
      </div>
    ),
  },
];

export function StepSlideDemo() {
  const [index, setIndex] = React.useState(0);
  const [filed, setFiled] = React.useState(false);

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <StepSlide
        steps={STEPS}
        value={index}
        onValueChange={setIndex}
        onFinish={() => setFiled(true)}
        aria-label="Waylight setup"
      />

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Step{" "}
        <span className="text-[var(--signal,var(--primary))]">
          {STEPS[index]?.title ?? "—"}
        </span>
        {filed ? " · setup filed" : null}
      </p>
    </div>
  );
}
