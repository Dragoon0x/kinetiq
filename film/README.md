# Kinetiq — launch film

A 30-second launch film built from the library itself. Every product frame is
a live Kinetiq component operated by a real pointer; the film's camera, masks
and type move on Kinetiq's five springs; every UI sound is the component's own
synthesized voice. See [TIMELINE.md](./TIMELINE.md) for the shot list, copy,
motion system and sound design.

## Render it

The film renders against the docs site, so start the dev server first (port 3100,
or pass `--base`):

```bash
pnpm dev --port 3100
```

Then, in another terminal:

```bash
pnpm film:render            # the master: film/out/kinetiq-launch.mp4 + .wav
pnpm film:render --draft    # a fast check (~1 min): no motion blur, quicker encode
```

Options:

| Flag | Default | What it does |
|---|---|---|
| `--from`, `--to` | `0`, `30` | Render a section (seconds). The film still runs from the top, because the components carry state. |
| `--subframes` | `8` (`1` with `--draft`) | Captures per frame, averaged for motion blur. |
| `--shutter` | `6` | How many of those sub-frames are averaged (6 of 8 ≈ a 270° shutter). |
| `--scale` | `1` | Device pixel ratio for capture; `2` supersamples and downscales to 1080p (about 4× slower). |
| `--base` | `http://localhost:3100` | Where the site is served. |
| `--out` | `film/out/kinetiq-launch.mp4` | Output path; the mastered `.wav` is written beside it. |
| `--no-audio` | — | Picture only. |

Requirements: `ffmpeg` on the PATH, and Playwright's Chromium (already a dev
dependency). Output lands in `film/out/`, which is git-ignored.

To render from a production build instead of the dev server, build with
`KINETIQ_FILM=1` — the `/film` route is a 404 in production otherwise.

## Preview it

- **The film**: render a draft (about a minute) and open the MP4.
- **The choreography**: open `http://localhost:3100/film` in a browser. It plays
  the camera, type and masks in real time, fitted to the window (`?t=12` starts
  at 12 s). The hand — and everything it operates — only moves under the
  director, so components sit still in this view.

## How it is made

- **`app/film/page.tsx`** — the route. Reads the real catalog (names, serials,
  taglines, counts) on the server and hands it to the film. `noindex`, and not
  served in production builds.
- **`film/launch-film.tsx`** — the 1920×1080 stage, and `window.__film`, the
  interface the director drives: `seek(t)` composes a frame and returns where
  the hand is; `renderAudio()` writes the score and renders the soundtrack.
- **`film/timeline.ts`** — the edit: the shots in order.
- **`film/shots/*`** — one file per sequence. Each shot owns its frames, its
  scene, its hand (`input`) and its sound cues.
- **`film/core/`** — the film clock, closed-form springs and easings, the
  camera, the masked type, the cursor, the hand (`travel`, `on`), the catalog
  and the audio capture.
- **`film/sound/score.ts`** — the music, synthesized into the same offline
  track as the captured UI sound.
- **`scripts/film/render.mjs`** — the director. Under Playwright's fake clock it,
  for each captured frame: advances the clock one frame (so the components'
  springs, canvases and timers run exactly that long), seeks the composition,
  holds every CSS animation at the same time, captures the frame, and moves a
  real mouse to where the hand is. Frames stream straight into ffmpeg; nothing
  is written to disk but the result. The soundtrack is loudness-normalised to
  −14 LUFS / −1.5 dBTP and muxed as 320 kbps AAC; a 24-bit master WAV is kept.

Determinism: no wall clock is read anywhere — the components' `requestAnimationFrame`,
timers, `performance.now()` and event timestamps all run on film time, motion's
WAAPI shortcut is switched off so its tweens do too, and all randomness is seeded.
The same commit renders the same film.

## Edit it

- **Timing**: frames are written as `f(n)` at 30 fps; the music is 16 frames a
  beat. Move a shot by changing its constants (e.g. `HOOK.press`, `TUNE.copy`).
- **Copy**: each line is in its shot file, inside a `MaskLine`.
- **Feel**: change which of the five springs drives a move (`spring("glide", …)`).
- **Sound**: component sounds follow the components; edit cues in each shot's
  `cues`, and the music in `film/sound/score.ts`.

## Other formats

The master is composed for 16:9. The stage size lives in `film/core/input.ts`
(`STAGE`), and every shot positions its type and camera in stage pixels, so a
9:16, 1:1 or 4:5 cut is a per-shot recomposition rather than a crop:

- Headlines sit at a 150 px left gutter; in vertical, stack them above the
  subject and reduce `Display` sizes by about a third.
- Cameras frame their subjects at a stage point (e.g. `REST` in
  `shots/tune.tsx`, `restAt` in `shots/hook.tsx`); set those to the new
  frame's centre column.
- The montage and the catalog wall fill whatever stage they are given; the
  wall's column count (`COLS` in `shots/finale.tsx`) sets its aspect.
- Keep essential type inside the central 1080 px for a square crop.
