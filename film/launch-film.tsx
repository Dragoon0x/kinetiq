"use client";

import * as React from "react";
import { flushSync } from "react-dom";

import {
  atTime,
  audioTrack,
  installAudioCapture,
  renderTrack,
} from "./core/audio-capture";
import { CatalogProvider, type Catalog } from "./core/catalog";
import { filmClock, useFilmTime } from "./core/clock";
import { setStageScale, STAGE, type PointerState } from "./core/input";
import { DURATION_FRAMES, f, FPS } from "./core/shot";
import { Cursor, type CursorHandle } from "./core/stage";
import { scoreInto } from "./sound/score";
import { SHOTS } from "./timeline";

type FilmApi = {
  fps: number;
  frames: number;
  ready: boolean;
  /** Composes the frame at `seconds` and returns where the hand is. */
  seek: (seconds: number) => PointerState | null;
  /** Writes the score into the captured track and renders the whole mix. */
  renderAudio: () => ReturnType<typeof renderTrack>;
};

declare global {
  interface Window {
    __film?: FilmApi;
  }
}

const DURATION = DURATION_FRAMES / FPS;
const CUES = SHOTS.flatMap((shot) => shot.cues ?? []).sort(
  (a, b) => a.at - b.at,
);

/** The shot whose hand is on screen at `t`: the latest one that has one. */
function inputAt(t: number): PointerState | null {
  for (let i = SHOTS.length - 1; i >= 0; i--) {
    const shot = SHOTS[i];
    if (!shot?.input) continue;
    if (t >= f(shot.from) && t < f(shot.to)) return shot.input(t);
  }
  return null;
}

/**
 * The Kinetiq launch film: thirty seconds composed of live components on a
 * 1920×1080 stage. Rendered by scripts/film/render.mjs, which drives this
 * page one frame at a time through `window.__film`; opened on its own it
 * plays the choreography in real time as a preview (the hand, and anything
 * it operates, only moves under the director).
 */
export function LaunchFilm({ catalog }: { catalog: Catalog }) {
  const t = useFilmTime();
  const cursor = React.useRef<CursorHandle>(null);
  const [scale, setScale] = React.useState(1);
  const [rendering] = React.useState(
    () =>
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).has("render"),
  );

  React.useEffect(() => {
    if (rendering) installAudioCapture(DURATION + 1.5);
    let lastCue = -Infinity;
    window.__film = {
      fps: FPS,
      frames: DURATION_FRAMES,
      ready: true,
      seek(seconds) {
        flushSync(() => filmClock.set(seconds));
        const input = inputAt(seconds);
        cursor.current?.set(input);
        if (audioTrack()) {
          for (const cue of CUES) {
            if (cue.at > lastCue && cue.at <= seconds) atTime(cue.at, cue.play);
          }
        }
        lastCue = seconds;
        return input;
      },
      async renderAudio() {
        const track = audioTrack();
        if (!track) throw new Error("open the film with ?render to record");
        scoreInto(track);
        return renderTrack();
      },
    };
    return () => {
      delete window.__film;
    };
  }, [rendering]);

  // Preview: fit the stage to the window and play the choreography live.
  React.useEffect(() => {
    if (rendering) return;
    const fit = () => {
      const next = Math.min(
        window.innerWidth / STAGE.width,
        window.innerHeight / STAGE.height,
      );
      setStageScale(next);
      setScale(next);
    };
    fit();
    window.addEventListener("resize", fit);
    const from = Number(
      new URLSearchParams(window.location.search).get("t") ?? 0,
    );
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      filmClock.set((from + (now - start) / 1000) % DURATION);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", fit);
    };
  }, [rendering]);

  return (
    <CatalogProvider catalog={catalog}>
      <div className="fixed inset-0 overflow-hidden bg-black">
        <style>{`html,body{overflow:hidden;background:black}`}</style>
        <div
          className="dark absolute top-0 left-0 overflow-hidden bg-background text-foreground"
          style={{
            width: STAGE.width,
            height: STAGE.height,
            transform: scale === 1 ? undefined : `scale(${scale})`,
            transformOrigin: "0 0",
          }}
        >
          {SHOTS.map((shot) => {
            const mount = f(shot.from - (shot.preroll ?? 0));
            if (t < mount || t >= f(shot.to)) return null;
            const { Scene } = shot;
            return (
              <div
                key={shot.id}
                className="absolute inset-0"
                style={{ visibility: t < f(shot.from) ? "hidden" : undefined }}
              >
                <Scene t={t} local={t - f(shot.from)} />
              </div>
            );
          })}
          <Cursor ref={cursor} />
        </div>
      </div>
    </CatalogProvider>
  );
}
