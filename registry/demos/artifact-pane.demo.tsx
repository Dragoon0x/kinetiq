"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  ArtifactPane,
  defaultArtifact,
  defaultArtifactConversation,
  type Artifact,
  type ArtifactStatus,
  type ArtifactTab,
  type ArtifactTurn,
} from "@/registry/ui/artifact-pane";

export const tweaks = defineTweaks({
  versions: {
    kind: "choice",
    label: "Versions",
    default: "pills",
    options: ["pills", "stepper", "timeline"],
    names: { pills: "Pills", stepper: "Stepper", timeline: "Timeline" },
  },
  diff: {
    kind: "choice",
    label: "Diff",
    default: "flash",
    options: ["flash", "hold", "off"],
    names: { flash: "Flash", hold: "Hold", off: "Off" },
  },
  dock: {
    kind: "choice",
    label: "Dock",
    default: "inline",
    options: ["inline", "pinned"],
    names: { inline: "In message", pinned: "Pinned" },
  },
});

const LAST = defaultArtifact.versions[defaultArtifact.versions.length - 1];
const LATER = (LAST?.at ?? 0) + 4 * 60_000;

/** The fourth draft "Revise" asks for. */
const WARMER = `# Good news: your refund is on its way

Hi {first_name},

Sorry for the wait. Your refund for order {order_id} is approved and on its way back to you.

It should reach your account by {refund_date}. Banks can take up to five working days to show it.

## While you wait

- Find the refund in the Waylight app under Activity.
- If it has not arrived by {refund_date}, reply to this email and we will chase it for you.
- You do not need to cancel the card you paid with.

Thanks for bearing with us,
The Waylight Pay team`;

const ASK: ArtifactTurn = {
  id: "u4",
  role: "user",
  text: "Make it warmer.",
  at: LATER - 60_000,
};
const ANSWER: ArtifactTurn = {
  id: "a4",
  role: "assistant",
  author: "Fernworks Model 3",
  text: "Opened with an apology and offered to chase the refund for them.",
  version: "v4",
  at: LATER,
};

const withFourth = (a: Artifact): Artifact => ({
  ...a,
  versions: [
    ...a.versions,
    { id: "v4", summary: "Warmer opening", at: LATER, source: WARMER },
  ],
});

/**
 * Waylight Pay support drafting the email customers get when a refund is
 * late. With chrome on, Revise asks for a fourth, warmer draft: the pane
 * writes for a moment, then flips to v4 with its diff.
 */
export function ArtifactPaneDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [revised, setRevised] = React.useState(false);
  const [status, setStatus] = React.useState<ArtifactStatus>("ready");
  const [version, setVersion] = React.useState(LAST?.id ?? "v3");
  const [open, setOpen] = React.useState(true);
  const [tab, setTab] = React.useState<ArtifactTab>("preview");
  const [note, setNote] = React.useState<string | null>(null);

  const artifact = revised ? withFourth(defaultArtifact) : defaultArtifact;
  const conversation = [
    ...defaultArtifactConversation,
    ...(status === "writing" || revised ? [ASK] : []),
    ...(revised ? [ANSWER] : []),
  ];

  // The assistant takes a moment to write the fourth draft.
  React.useEffect(() => {
    if (status !== "writing") return;
    const id = window.setTimeout(() => {
      setRevised(true);
      setVersion("v4");
      setStatus("ready");
      setNote(null);
    }, 1400);
    return () => window.clearTimeout(id);
  }, [status]);

  const count = artifact.versions.length;
  const at = artifact.versions.findIndex((v) => v.id === version) + 1;
  const line =
    note ??
    (status === "writing"
      ? "writing v4 · make it warmer"
      : !open
        ? `docked · ${values.dock === "pinned" ? "pinned" : "in the message"}`
        : `v${at} of ${count} · ${tab}`);

  return (
    <div className="flex w-full max-w-5xl flex-col gap-3">
      <ArtifactPane
        className={chrome ? "h-[500px]" : "h-[560px]"}
        artifact={artifact}
        conversation={conversation}
        version={version}
        onVersionChange={(id) => {
          setNote(null);
          setVersion(id);
        }}
        open={open}
        onOpenChange={(next) => {
          setNote(null);
          setOpen(next);
        }}
        tab={tab}
        onTabChange={(next) => {
          setNote(null);
          setTab(next);
        }}
        status={status}
        onCopy={(_text, v) =>
          setNote(
            `copied v${artifact.versions.findIndex((x) => x.id === v.id) + 1}`,
          )
        }
        onDownload={(file) => setNote(`downloaded ${file.name}`)}
        sound={sound}
        {...values}
      />
      {chrome ? (
        <div className="flex items-center gap-3 border-t border-border pt-3">
          <p
            role="status"
            className="min-w-0 flex-1 truncate font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
          >
            <span className="text-signal">{line.split(" · ")[0]}</span>
            {line.includes(" · ")
              ? ` · ${line.split(" · ").slice(1).join(" · ")}`
              : null}
          </p>
          <button
            type="button"
            disabled={status === "writing"}
            onClick={() => {
              setNote(null);
              if (revised) {
                setRevised(false);
                setVersion(LAST?.id ?? "v3");
              } else {
                setOpen(true);
                setStatus("writing");
              }
            }}
            className="inline-flex h-7 shrink-0 items-center rounded-2 border border-hairline px-2.5 font-mono text-[10px] tracking-[0.08em] text-ink-2 uppercase transition-colors outline-none hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid disabled:opacity-50"
          >
            {revised ? "Reset" : "Revise"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
