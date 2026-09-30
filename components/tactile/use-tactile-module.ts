"use client";

import * as React from "react";

import type { TactileModule } from "./demo-module";
import { useRoom } from "./room";

const loaded = new Map<string, TactileModule>();
const pending = new Map<string, Promise<TactileModule>>();

/**
 * Starts (or joins) the load of a demo module from a room's demo map. Safe to
 * call repeatedly. Slugs are unique across rooms, so one cache serves both.
 */
export function preloadTactile(
  slug: string,
  demos: Record<string, () => Promise<TactileModule>>,
): Promise<TactileModule> | null {
  const done = loaded.get(slug);
  if (done) return Promise.resolve(done);
  const inFlight = pending.get(slug);
  if (inFlight) return inFlight;
  const loader = demos[slug];
  if (!loader) return null;
  const promise = loader().then((module) => {
    loaded.set(slug, module);
    pending.delete(slug);
    return module;
  });
  promise.catch(() => pending.delete(slug));
  pending.set(slug, promise);
  return promise;
}

/**
 * The demo module for `slug`, once `enabled` has asked for it, from the room
 * this component sits in. A module that was loaded before is returned on the
 * first render, so a card scrolled back into view or a stage opened on a card
 * already seen never flashes empty.
 */
export function useTactileModule(
  slug: string,
  enabled: boolean,
): TactileModule | null {
  const { demos } = useRoom();
  const [arrived, setArrived] = React.useState<{
    slug: string;
    module: TactileModule;
  } | null>(null);

  React.useEffect(() => {
    if (!enabled || loaded.has(slug)) return;
    let live = true;
    preloadTactile(slug, demos)
      ?.then((module) => {
        if (live) setArrived({ slug, module });
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [slug, enabled, demos]);

  return loaded.get(slug) ?? (arrived?.slug === slug ? arrived.module : null);
}
