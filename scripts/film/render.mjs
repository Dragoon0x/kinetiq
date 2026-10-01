#!/usr/bin/env node
/**
 * The director: renders the launch film (film/) to video, one frame at a time.
 *
 *   node scripts/film/render.mjs                 # the master: 1920×1080, 30 fps, motion blur, audio
 *   node scripts/film/render.mjs --draft         # fast check: no blur, quicker encode
 *   node scripts/film/render.mjs --from 9.6 --to 13.4   # a section
 *
 * How a frame is made. The page at /film?render=1 runs under a fake clock
 * (Playwright's page.clock), so requestAnimationFrame, timers and
 * performance.now() only move when this script moves them. For every
 * captured frame it:
 *   1. advances the clock by one frame — the live components' springs,
 *      canvases and timers run exactly that long;
 *   2. seeks the composition to the frame's time — camera, type, masks;
 *   3. holds every CSS animation and transition at the same time;
 *   4. captures the frame;
 *   5. moves a real mouse to where the film's hand is, so the next frame
 *      shows the components answering real input.
 * Motion blur comes from capturing several sub-frames per frame and
 * averaging them (six of eight sub-frames: a 270° shutter). Sound is
 * captured inside the page as the components make it (film/core/audio-capture)
 * and rendered with the score at the end, then muxed.
 */
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const option = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : fallback;
};

const draft = flag("draft");
const base = option("base", "http://localhost:3100");
const FPS = 30;
const subframes = Number(option("subframes", draft ? 1 : 8));
const shutter = Number(option("shutter", draft ? 1 : 6));
const scale = Number(option("scale", 1));
const from = Number(option("from", 0));
const to = Number(option("to", 30));
const withAudio = !flag("no-audio");
const out = resolve(
  ROOT,
  option("out", `film/out/kinetiq-launch${draft ? "-draft" : ""}.mp4`),
);
mkdirSync(dirname(out), { recursive: true });
const videoOnly = out.replace(/\.mp4$/, ".video.mp4");
const wavPath = out.replace(/\.mp4$/, ".raw.wav");
/** The mastered soundtrack, kept beside the film as a deliverable. */
const masterWav = out.replace(/\.mp4$/, ".wav");

const rate = FPS * subframes;
const first = Math.round(from * rate);
const last = Math.round(to * rate);
const msAt = (i) => Math.round((i * 1000) / rate);

console.log(
  `film: ${from}s → ${to}s · ${last - first} captures at ${rate}/s · ${subframes}×${shutter} blur · ${scale}× · ${base}`,
);

const browser = await chromium.launch({
  args: [
    "--force-color-profile=srgb",
    "--hide-scrollbars",
    "--font-render-hinting=none",
  ],
});
const context = await browser.newContext({
  viewport: { width: 1920, height: 1080 },
  deviceScaleFactor: scale,
  colorScheme: "dark",
  reducedMotion: "no-preference",
});
await context.addInitScript(() => {
  // Motion hands opacity/transform tweens to the compositor (WAAPI), which
  // runs on the wall clock. Without Element.prototype.animate it keeps them
  // on requestAnimationFrame — which the fake clock owns.
  delete Element.prototype.animate;
  // The gesture kit measures fling velocity from event.timeStamp, a wall
  // clock too. On film time, a drag at film speed is thrown at film speed.
  Object.defineProperty(Event.prototype, "timeStamp", {
    configurable: true,
    get() {
      return performance.now();
    },
  });
  // CSS animations and transitions: held at film time, frame by frame.
  const births = new WeakMap();
  window.__syncCss = (nowMs) => {
    for (const animation of document.getAnimations()) {
      let birth = births.get(animation);
      if (birth === undefined) {
        birth = nowMs;
        births.set(animation, birth);
      }
      const local = nowMs - birth;
      const end = animation.effect?.getComputedTiming().endTime ?? Infinity;
      if (Number.isFinite(end) && local >= end) {
        try {
          animation.finish();
        } catch {
          /* an infinite or idle animation cannot finish; it is held below */
        }
        continue;
      }
      animation.pause();
      animation.currentTime = local;
    }
  };
});

const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
await page.clock.install({ time: new Date("2026-10-01T09:00:00Z") });
await page.goto(`${base}/film?render=1`, {
  waitUntil: "load",
  timeout: 180_000,
});
await page.waitForFunction(() => window.__film?.ready === true, null, {
  polling: 100,
  timeout: 180_000,
});
await page.evaluate(() => document.fonts.ready);
await page.addStyleTag({
  content:
    "nextjs-portal,[data-nextjs-toast],[data-next-badge-root]{display:none!important}",
});
const startMs = await page.evaluate(() => Date.now());
await page.clock.pauseAt(startMs + 1000);

const cdp = await context.newCDPSession(page);

const mux = [];
if (subframes > 1) {
  const weights = Array.from({ length: subframes }, (_, i) =>
    i >= subframes - shutter ? 1 : 0,
  ).join(" ");
  mux.push(
    `tmix=frames=${subframes}:weights='${weights}'`,
    `select='not(mod(n+1\\,${subframes}))'`,
    `setpts=N/(${FPS}*TB)`,
  );
}
if (scale !== 1) mux.push("scale=1920:1080:flags=lanczos");
mux.push("scale=out_color_matrix=bt709:out_range=tv", "format=yuv420p");

const ffmpeg = spawn(
  "ffmpeg",
  [
    "-y",
    "-loglevel",
    "error",
    "-f",
    "image2pipe",
    "-framerate",
    String(rate),
    "-i",
    "-",
    "-vf",
    mux.join(","),
    "-r",
    String(FPS),
    "-c:v",
    "libx264",
    "-preset",
    draft ? "veryfast" : "slow",
    "-crf",
    draft ? "20" : "12",
    "-profile:v",
    "high",
    "-colorspace",
    "bt709",
    "-color_primaries",
    "bt709",
    "-color_trc",
    "bt709",
    "-movflags",
    "+faststart",
    videoOnly,
  ],
  { stdio: ["pipe", "inherit", "inherit"] },
);
const write = (buffer) =>
  new Promise((done, fail) => {
    ffmpeg.stdin.write(buffer, (error) => (error ? fail(error) : done()));
  });

const pointer = { x: -1, y: -1, down: false };
const settle = () =>
  page.evaluate(
    () =>
      new Promise((done) => {
        // Two task hops: React commits and runs its effects before capture.
        const a = new MessageChannel();
        a.port1.onmessage = () => {
          const b = new MessageChannel();
          b.port1.onmessage = () => done();
          b.port2.postMessage(0);
        };
        a.port2.postMessage(0);
      }),
  );

// Everything before `from` still has to happen — the components have state —
// so a section render runs the film from the top and only captures its span.
const began = Date.now();
for (let i = 0; i < last; i++) {
  if (i > 0) await page.clock.runFor(msAt(i) - msAt(i - 1));
  const t = i / rate;
  const input = await page.evaluate((s) => window.__film.seek(s), t);
  await settle();
  await page.evaluate((ms) => window.__syncCss(ms), msAt(i));
  if (i >= first) {
    const shot = await cdp.send("Page.captureScreenshot", {
      format: "png",
      optimizeForSpeed: true,
    });
    await write(Buffer.from(shot.data, "base64"));
  }
  if (input) {
    if (input.x !== pointer.x || input.y !== pointer.y) {
      await page.mouse.move(input.x, input.y);
      pointer.x = input.x;
      pointer.y = input.y;
    }
    if (input.down && !pointer.down) await page.mouse.down();
    if (!input.down && pointer.down) await page.mouse.up();
    pointer.down = input.down;
  } else if (pointer.down) {
    await page.mouse.up();
    pointer.down = false;
  }
  if (i % rate === 0 && i >= first) {
    const done = (i - first) / (last - first);
    const spent = (Date.now() - began) / 1000;
    process.stdout.write(
      `\r  ${t.toFixed(1)}s  ${(done * 100).toFixed(0)}%  ${spent.toFixed(0)}s elapsed   `,
    );
  }
}
ffmpeg.stdin.end();
await new Promise((done) => ffmpeg.on("close", done));
process.stdout.write("\n");

if (withAudio) {
  const audio = await page.evaluate(() => window.__film.renderAudio());
  const samples = Buffer.from(audio.data, "base64");
  writeFileSync(wavPath, wav(samples, audio.sampleRate, audio.channels));
  // Master to -14 LUFS integrated, -1.5 dBTP (headroom for the AAC encode): measure the mix, then apply
  // the correction linearly, so the dynamics the edit was cut to survive.
  const section = ["-ss", String(from), "-t", String(to - from), "-i", wavPath];
  const report = await capture("ffmpeg", [
    "-hide_banner",
    ...section,
    "-af",
    "loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json",
    "-f",
    "null",
    "-",
  ]);
  // loudnorm prints its measurement as the last JSON object on stderr.
  const stats = JSON.parse(
    report.slice(report.lastIndexOf("{"), report.lastIndexOf("}") + 1),
  );
  const loudness = [
    "loudnorm=I=-14:TP=-1.5:LRA=11:linear=true",
    `measured_I=${stats.input_i}`,
    `measured_TP=${stats.input_tp}`,
    `measured_LRA=${stats.input_lra}`,
    `measured_thresh=${stats.input_thresh}`,
    `offset=${stats.target_offset}`,
  ].join(":");
  await run("ffmpeg", [
    "-y",
    "-loglevel",
    "error",
    ...section,
    "-af",
    `${loudness},aresample=48000`,
    "-c:a",
    "pcm_s24le",
    masterWav,
  ]);
  await run("ffmpeg", [
    "-y",
    "-loglevel",
    "error",
    "-i",
    videoOnly,
    "-i",
    masterWav,
    "-map",
    "0:v",
    "-map",
    "1:a",
    "-c:v",
    "copy",
    "-c:a",
    "aac",
    "-b:a",
    "320k",
    "-movflags",
    "+faststart",
    "-shortest",
    out,
  ]);
  rmSync(wavPath);
  rmSync(videoOnly);
} else {
  if (existsSync(out)) rmSync(out);
  await run("mv", [videoOnly, out]);
}

if (errors.length) console.log(`page errors:\n  ${errors.join("\n  ")}`);
console.log(`film: ${out} (${((Date.now() - began) / 1000).toFixed(0)}s)`);
await browser.close();

/** A 32-bit float WAV around interleaved samples. */
function wav(samples, sampleRate, channels) {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + samples.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(3, 20); // IEEE float
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * channels * 4, 28);
  header.writeUInt16LE(channels * 4, 32);
  header.writeUInt16LE(32, 34);
  header.write("data", 36);
  header.writeUInt32LE(samples.length, 40);
  return Buffer.concat([header, samples]);
}

/** Runs a command and returns what it printed to stderr (ffmpeg reports there). */
function capture(command, list) {
  return new Promise((done, fail) => {
    const child = spawn(command, list, { stdio: ["ignore", "ignore", "pipe"] });
    let text = "";
    child.stderr.on("data", (chunk) => (text += chunk));
    child.on("close", (code) =>
      code === 0 ? done(text) : fail(new Error(`${command} exited ${code}`)),
    );
  });
}

function run(command, list) {
  return new Promise((done, fail) => {
    const child = spawn(command, list, { stdio: "inherit" });
    child.on("close", (code) =>
      code === 0 ? done() : fail(new Error(`${command} exited ${code}`)),
    );
  });
}
