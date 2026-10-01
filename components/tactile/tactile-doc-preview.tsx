"use client";

import * as React from "react";

import { ArrowUpRight } from "lucide-react";
import Link from "next/link";

import { ATELIER_ROOM } from "@/components/atelier/atelier-room";
import { SpecimenPlate } from "@/components/lab/specimen-plate";
import { STUDIO_ROOM } from "@/components/studio/studio-room";
import { defaultsOf } from "@/registry/lib/tweaks";

import { RoomProvider } from "./room";
import { useSoundPref } from "./sound-pref";
import { SoundSwitch } from "./sound-switch";
import { TweakPanel, type TweakState } from "./tweak-panel";
import { TACTILE_ROOM } from "./tactile-room";
import { useTactileModule } from "./use-tactile-module";

const ROOMS = {
  tactile: TACTILE_ROOM,
  atelier: ATELIER_ROOM,
  studio: STUDIO_ROOM,
} as const;

/**
 * A room piece's preview on its own docs page (Tactile, Atelier or Studio): the same
 * specimen plate as every other component, with its tweaks and its sound
 * beneath it. The server renders the demo at its defaults as `children`; the
 * first tweak (or turning sound on) hands over to the live, code-split demo
 * with the values applied, so the page never waits for a chunk to show
 * something.
 */
export function TactileDocPreview({
  room,
  ...props
}: {
  room: keyof typeof ROOMS;
  slug: string;
  serial: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <RoomProvider room={ROOMS[room]}>
      <Preview room={room} {...props} />
    </RoomProvider>
  );
}

function Preview({
  room,
  slug,
  serial,
  label,
  children,
}: {
  room: keyof typeof ROOMS;
  slug: string;
  serial: string;
  label: string;
  children: React.ReactNode;
}) {
  const loadedModule = useTactileModule(slug, true);
  const [sound, setSound] = useSoundPref();
  const [values, setValues] = React.useState<TweakState>({});
  const [touched, setTouched] = React.useState(false);
  const schema = loadedModule?.tweaks ?? {};
  const Demo = loadedModule?.Demo;
  const live = (touched || sound) && Demo;

  return (
    <div className="space-y-3">
      <SpecimenPlate serial={serial} label={label} minHeight={380}>
        {live ? (
          <Demo
            sound={sound}
            {...(defaultsOf(schema) as TweakState)}
            {...values}
          />
        ) : (
          children
        )}
      </SpecimenPlate>
      <div className="rounded-3 border border-hairline bg-surface-1 p-4">
        {Object.keys(schema).length > 0 ? (
          <TweakPanel
            grid
            schema={schema}
            values={{ ...(defaultsOf(schema) as TweakState), ...values }}
            onChange={(key, value) => {
              setTouched(true);
              setValues((prev) => ({ ...prev, [key]: value }));
            }}
            onReset={() => setValues({})}
          />
        ) : null}
        <div className="mt-3 flex items-center justify-between gap-3 border-t border-hairline pt-3">
          <Link
            href={`${ROOMS[room].path}?b=${slug}`}
            className="inline-flex items-center gap-1.5 text-xs text-cobalt-bright transition-colors hover:text-foreground"
          >
            {`Open it on the ${ROOMS[room].name} stage`}
            <ArrowUpRight aria-hidden className="size-3.5" />
          </Link>
          <SoundSwitch on={sound} onChange={setSound} />
        </div>
      </div>
    </div>
  );
}
