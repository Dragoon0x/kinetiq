"use client";

import * as React from "react";

import { playTone } from "@/registry/lib/tactile-sound";

import { useEntry } from "../core/catalog";
import { PARKED } from "../core/input";
import { f, type Cue, type SceneProps, type Shot } from "../core/shot";
import { ease, r2, span, spring } from "../core/spring";
import { Layer } from "../core/stage";
import { Display, MaskLine, typed } from "../core/type";

/**
 * 0:19.7–0:22.4 — THE AGENT.
 *
 * The same switch, found a third way: a coding agent asked for "a settings
 * toggle that feels like liquid" searches the catalog through Kinetiq's MCP
 * server, picks KQ-1097 by its serial and installs it. The tool names are
 * the server's real ones (search_components, get_install_command).
 */
export const AGENT = {
  in: f(592),
  typeFrom: f(596),
  typeTo: f(613),
  search: f(616),
  found: f(625),
  install: f(634),
  command: f(640),
  done: f(651),
  out: f(664),
  end: f(672),
} as const;

const PROMPT = "add a settings toggle that feels like liquid";

function AgentScene({ t }: SceneProps) {
  const gel = useEntry("gel-switch");
  const prompt = typed(PROMPT, span(t, AGENT.typeFrom, AGENT.typeTo));
  const line = spring("snap", t, AGENT.in + f(4));
  const out = ease.exit(span(t, AGENT.out, AGENT.out + f(8)));
  const show = (at: number) => r2(ease.enter(span(t, at, at + f(4))));
  const caret = t < AGENT.typeTo + f(2) && Math.floor(t * 4) % 2 === 0;

  return (
    <Layer className="bg-background">
      <div className="absolute" style={{ left: 150, top: 132 }}>
        <Display size={112}>
          <MaskLine p={line} out={out}>
            Your agent already knows it.
          </MaskLine>
        </Display>
      </div>

      <div
        className="absolute font-mono"
        style={{
          left: 150,
          top: 420,
          fontSize: 28,
          lineHeight: 1.75,
          opacity: r2(1 - out),
          transform: `translateY(${r2(-out * 18)}px)`,
        }}
      >
        <div className="whitespace-pre text-ink">
          <span className="text-cobalt-bright">› </span>
          {prompt}
          <span
            className="ml-0.5 inline-block w-[0.55em] translate-y-[0.12em] bg-ink"
            style={{ height: "1.05em", opacity: caret ? 0.8 : 0 }}
          />
        </div>
        <div
          className="whitespace-pre text-ink-3"
          style={{ opacity: show(AGENT.search) }}
        >
          {"  "}
          <span className="text-cobalt-bright">kinetiq</span> ·
          search_components(
          <span className="text-ink-2">&quot;toggle liquid gel&quot;</span>)
        </div>
        <div className="whitespace-pre" style={{ opacity: show(AGENT.found) }}>
          {"    "}
          <span className="text-signal">{gel.serial}</span>
          {"  "}
          <span className="text-ink">{gel.name}</span>
          {"   "}
          <span className="text-ink-2">{gel.tagline}</span>
        </div>
        <div
          className="whitespace-pre text-ink-3"
          style={{ opacity: show(AGENT.install) }}
        >
          {"  "}
          <span className="text-cobalt-bright">kinetiq</span> ·
          get_install_command(
          <span className="text-ink-2">&quot;{gel.name}&quot;</span>)
        </div>
        <div
          className="whitespace-pre text-ink"
          style={{ opacity: show(AGENT.command) }}
        >
          {"    "}pnpm dlx shadcn@latest add{" "}
          <span className="text-cobalt-bright">@kinetiq/{gel.name}</span>
        </div>
        <div
          className="whitespace-pre text-signal"
          style={{ opacity: show(AGENT.done) }}
        >
          {"  "}✔ components/ui/{gel.name}.tsx
        </div>
      </div>
    </Layer>
  );
}

const cues: Cue[] = [
  ...Array.from({ length: PROMPT.length }, (_, i) => ({
    at: AGENT.typeFrom + ((AGENT.typeTo - AGENT.typeFrom) * i) / PROMPT.length,
    play: () =>
      playTone("tick", {
        pitch: 1.5 + ((i * 41) % 13) / 34,
        gain: 0.12 + ((i * 17) % 5) / 50,
        pan: -0.25 + ((i * 23) % 11) / 22,
      }),
  })),
  { at: AGENT.typeTo + f(1), play: () => playTone("clack", { gain: 0.4 }) },
  {
    at: AGENT.search,
    play: () => playTone("plip", { pitch: 1.2, gain: 0.25 }),
  },
  {
    at: AGENT.found,
    play: () => playTone("note", { pitch: 2 ** (9 / 12), gain: 0.3 }),
  },
  {
    at: AGENT.install,
    play: () => playTone("plip", { pitch: 1.35, gain: 0.25 }),
  },
  { at: AGENT.done, play: () => playTone("chime", { gain: 0.35 }) },
];

export const agentShot: Shot = {
  id: "agent",
  from: 592,
  to: 672,
  Scene: AgentScene,
  input: () => PARKED,
  cues,
};
