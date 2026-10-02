"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  defaultSettingsSections,
  defaultSettingsValues,
  SettingsForm,
  type SettingsValues,
} from "@/registry/ui/settings-form";

export const tweaks = defineTweaks({
  glow: {
    kind: "range",
    label: "Glow",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.1,
  },
  bar: {
    kind: "choice",
    label: "Bar",
    default: "dock",
    options: ["dock", "float", "inline"],
    names: { dock: "Dock", float: "Float", inline: "Inline" },
  },
  rewind: {
    kind: "choice",
    label: "Rewind",
    default: "sequence",
    options: ["sequence", "together", "instant"],
    names: {
      sequence: "Newest first",
      together: "Together",
      instant: "Instant",
    },
  },
});

const LABELS: Record<string, string> = Object.fromEntries(
  defaultSettingsSections.flatMap((s) =>
    s.fields.map((f) => [f.id, f.label.toLowerCase()]),
  ),
);

/** The address another Fieldline workspace already uses. */
const TAKEN = "fieldline";

/** Two edits left from an earlier visit, so the form opens with its bar up. */
const RESTORED = { name: "Fieldline Labs North", digest: "daily" };

const changes = (n: number) => `${n} ${n === 1 ? "change" : "changes"}`;

/**
 * Fieldline Labs' workspace settings. Saves take 700 ms, and the workspace
 * URL "fieldline" is already taken, so it comes back refused.
 */
export function SettingsFormDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [saved, setSaved] = React.useState<SettingsValues>(
    defaultSettingsValues,
  );
  const [dirty, setDirty] = React.useState<string[]>(Object.keys(RESTORED));
  const [newest, setNewest] = React.useState<string | null>("digest");
  const [event, setEvent] = React.useState<string | null>(null);
  const last = React.useRef<SettingsValues>({
    ...defaultSettingsValues,
    ...RESTORED,
  });
  const timers = React.useRef(new Set<number>());

  React.useEffect(() => {
    const running = timers.current;
    return () => {
      for (const t of running) window.clearTimeout(t);
      running.clear();
    };
  }, []);

  const form = (
    <SettingsForm
      title="Workspace settings"
      description="Fieldline Labs · changes apply to everyone in the workspace"
      value={saved}
      defaultDraft={RESTORED}
      onValueChange={setSaved}
      onDraftChange={(draft, ids) => {
        const moved = Object.keys(draft).find(
          (id) => draft[id] !== last.current[id],
        );
        last.current = draft;
        setDirty(ids);
        if (moved && ids.includes(moved)) setNewest(moved);
        setEvent(null);
      }}
      onDiscard={(list) => setEvent(`discarded ${changes(list.length)}`)}
      onSave={(list, draft) =>
        new Promise((resolve) => {
          const id = window.setTimeout(() => {
            timers.current.delete(id);
            const refused = draft.slug === TAKEN;
            const kept = list.filter((c) => !(refused && c.id === "slug"));
            setDirty(refused ? ["slug"] : []);
            setEvent(
              refused
                ? `saved ${changes(kept.length)} · url ${TAKEN} is taken`
                : `saved ${changes(kept.length)}`,
            );
            resolve(
              refused
                ? { errors: { slug: "That address is taken." } }
                : undefined,
            );
          }, 700);
          timers.current.add(id);
        })
      }
      sound={sound}
      {...values}
    />
  );

  if (!chrome) return <div className="w-full">{form}</div>;

  return (
    <div className="flex w-full flex-col gap-4">
      {form}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {event ? (
          <span className="text-signal">{event}</span>
        ) : dirty.length > 0 ? (
          <>
            <span className="text-signal">
              {dirty.length} unsaved {dirty.length === 1 ? "change" : "changes"}
            </span>
            {newest ? ` · newest: ${LABELS[newest] ?? newest}` : ""}
          </>
        ) : (
          <>
            <span className="text-signal">no unsaved changes</span> · ⌘s or
            ctrl+s saves
          </>
        )}
      </p>
    </div>
  );
}
