"use client";

import * as React from "react";

import { TACTILE_DEMOS, type TactileModule } from "./tactile-demos";

const loaded = new Map<string, TactileModule>();
const pending = new Map<string, Promise<TactileModule>>();

/** Starts (or joins) the load of a demo module. Safe to call repeatedly. */
export function preloadTactile(slug: string): Promise<TactileModule> | null {
  const done = loaded.get(slug);
  if (done) return Promise.resolve(done);
  const inFlight = pending.get(slug);
  if (inFlight) return inFlight;
  const loader = TACTILE_DEMOS[slug];
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
 * The demo module for `slug`, once `enabled` has asked for it. A module that
 * was loaded before is returned on the first render, so a card scrolled back
 * into view or a stage opened on a card already seen never flashes empty.
 */
export function useTactileModule(
  slug: string,
  enabled: boolean,
): TactileModule | null {
  const [arrived, setArrived] = React.useState<{
    slug: string;
    module: TactileModule;
  } | null>(null);

  React.useEffect(() => {
    if (!enabled || loaded.has(slug)) return;
    let live = true;
    preloadTactile(slug)
      ?.then((module) => {
        if (live) setArrived({ slug, module });
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [slug, enabled]);

  return loaded.get(slug) ?? (arrived?.slug === slug ? arrived.module : null);
}
