"use client";

import * as React from "react";

import { animate, useMotionValue } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type FilmGrainBlend = "dual" | "overlay" | "soft-light";

export type FilmGrainProps = {
  /** The section under the grain. It stays fully interactive and selectable. */
  children?: React.ReactNode;
  /** How strong the grain is, 0 to 1. @default 0.5 */
  intensity?: number;
  /** Grain size: 1 is fine 35mm stock, 3 coarse 16mm (0.5 to 3). @default 1 */
  size?: number;
  /** The projector's frame rate: how many times a second the grain changes (1 to 30). @default 18 */
  fps?: number;
  /** How the grain meets the page: `dual` darkens with dark specks and lightens with light ones, so it reads on light and dark; `overlay` and `soft-light` work the midtones only. @default "dual" */
  blend?: FilmGrainBlend;
  /** Gate weave: how far the section drifts in the gate from frame to frame, in px (0 to 2). @default 0 */
  weave?: number;
  /** How often faint scratches run down the frame, 0 to 1. @default 0.2 */
  scratches?: number;
  /** The darkening toward the corners, 0 to 1. @default 0.3 */
  vignette?: number;
  /** How much the lamp's brightness wavers from frame to frame, 0 to 1. @default 0.2 */
  flicker?: number;
  /** How much the grain clears around the mouse and around a focused control, 0 to 1. @default 0.5 */
  calm?: number;
  /** The radius of that clear patch, in px. @default 140 */
  calmRadius?: number;
  /** Spin the projector up the first time the section comes into view. @default true */
  intro?: boolean;
  /** The mouse and keyboard focus clear the grain around them. @default true */
  interactive?: boolean;
  /** Holds one frame of grain and stops the projector. @default false */
  paused?: boolean;
  /** Seed for the grain tiles and every flaw. Sections with the same seed share their tiles. @default 24 */
  seed?: number;
  /** The highest device pixel ratio the grain is drawn for: one grain pixel per device pixel up to this (never above 2). @default 2 */
  dpr?: number;
  /** Classes for the section box. */
  className?: string;
};

/** Grain tiles are this many device pixels square, and wrap seamlessly. */
const TILE = 256;
const SCRATCHES = 3;
const STARTUP = 600;
const REST_FPS = 4;

type Tiles = { dark: string[]; light: string[]; signed: string[] };

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const r2 = (v: number) => Math.round(v * 100) / 100;
const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

/** An unsigned integer hash to [0, 1). */
const hash = (i: number, seed: number) => {
  let h = (Math.imul(i, 374761393) + Math.imul(seed, 668265263)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A box blur on the torus, so the tile still wraps without a seam. */
function wrapBlur(src: Float32Array, n: number, radius: number) {
  const tmp = new Float32Array(n * n);
  const out = new Float32Array(n * n);
  const span = radius * 2 + 1;
  for (let y = 0; y < n; y += 1) {
    for (let x = 0; x < n; x += 1) {
      let s = 0;
      for (let k = -radius; k <= radius; k += 1) {
        s += src[y * n + ((x + k + n) % n)] ?? 0;
      }
      tmp[y * n + x] = s / span;
    }
  }
  for (let y = 0; y < n; y += 1) {
    for (let x = 0; x < n; x += 1) {
      let s = 0;
      for (let k = -radius; k <= radius; k += 1) {
        s += tmp[((y + k + n) % n) * n + x] ?? 0;
      }
      out[y * n + x] = s / span;
    }
  }
  return out;
}

const normalise = (v: Float32Array) => {
  let sum = 0;
  for (const x of v) sum += x * x;
  const sd = Math.sqrt(sum / Math.max(1, v.length)) || 1;
  for (let i = 0; i < v.length; i += 1) v[i] = (v[i] ?? 0) / sd;
  return v;
};

/**
 * One grain field: fine white noise plus two clumped octaves, blurred on the
 * torus, the way silver grains clump in an emulsion; unit variance.
 */
function grainField(seed: number): Float32Array {
  const n = TILE;
  const next = mulberry32(seed);
  const white = () => {
    const v = new Float32Array(n * n);
    for (let i = 0; i < v.length; i += 1) v[i] = next() * 2 - 1;
    return v;
  };
  const fine = normalise(white());
  const clump = normalise(wrapBlur(white(), n, 1));
  const coarse = normalise(wrapBlur(white(), n, 2));
  const out = new Float32Array(n * n);
  for (let i = 0; i < out.length; i += 1) {
    out[i] =
      0.85 * (fine[i] ?? 0) + 0.5 * (clump[i] ?? 0) + 0.22 * (coarse[i] ?? 0);
  }
  return normalise(out);
}

const toUrl = (canvas: HTMLCanvasElement) =>
  new Promise<string>((resolve) => {
    canvas.toBlob((blob) => resolve(blob ? URL.createObjectURL(blob) : ""));
  });

/**
 * The grain tiles for a seed, made once and shared by every section on the
 * page with that seed: two variants each of dark specks, light specks and a
 * signed grey field.
 */
const cache = new Map<number, Promise<Tiles>>();
function grainTiles(seed: number): Promise<Tiles> {
  const hit = cache.get(seed);
  if (hit) return hit;
  const made = (async () => {
    const canvas = document.createElement("canvas");
    canvas.width = TILE;
    canvas.height = TILE;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const tiles: Tiles = { dark: [], light: [], signed: [] };
    if (!ctx) return tiles;
    for (let variant = 0; variant < 2; variant += 1) {
      const field = grainField((seed * 7919 + variant * 104729) >>> 0);
      for (const kind of ["dark", "light", "signed"] as const) {
        const image = ctx.createImageData(TILE, TILE);
        const d = image.data;
        for (let i = 0; i < field.length; i += 1) {
          const v = field[i] ?? 0;
          const o = i * 4;
          if (kind === "signed") {
            const g = Math.round(clamp(128 + v * 34, 0, 255));
            d[o] = g;
            d[o + 1] = g;
            d[o + 2] = g;
            d[o + 3] = 255;
          } else {
            const tone = kind === "dark" ? 0 : 255;
            d[o] = tone;
            d[o + 1] = tone;
            d[o + 2] = tone;
            // Dense and continuous, like an emulsion: every pixel carries
            // some grain, the darkest and lightest the most.
            d[o + 3] = Math.round(
              clamp((kind === "dark" ? -v : v) * 0.36, 0, 1) * 255,
            );
          }
        }
        ctx.putImageData(image, 0, 0);
        tiles[kind].push(await toUrl(canvas));
      }
    }
    return tiles;
  })();
  cache.set(seed, made);
  // A handful of seeds at most stay around; older ones are let go.
  if (cache.size > 6) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined && oldest !== seed) {
      const gone = cache.get(oldest);
      cache.delete(oldest);
      void gone?.then((t) => {
        for (const url of [...t.dark, ...t.light, ...t.signed]) {
          if (url) URL.revokeObjectURL(url);
        }
      });
    }
  }
  return made;
}

/**
 * Film grain over any section, built for cost. The grain is two seamless
 * tiles per seed — fine white noise plus two clumped octaves blurred on the
 * torus, as silver grains clump — made once and shared by every section,
 * and each projected frame only swaps which tile shows and jumps it to a
 * seeded offset: opacity and transform writes on a timer at `fps`, so the
 * compositor does the work, nothing is painted per frame, and a page can
 * carry many grained sections with no WebGL context at all.
 *
 * With `blend="dual"` dark specks sit in a multiply layer and light specks
 * in a screen layer, so the grain reads on a light page, on a dark one, and
 * most of all in the midtones. Optional flaws: gate weave (the section
 * drifts a fraction of a pixel on a smooth seeded walk), faint scratches
 * that live a frame or three, a multiply vignette and a wavering lamp. The
 * first time it is in view the projector spins up from 4 fps; under the
 * mouse, and around a focused control, the grain clears in a soft patch that
 * follows on the glide spring. The timer runs only on screen, in a visible
 * tab, with motion allowed; reduced motion holds one still frame.
 */
export function FilmGrain({
  children,
  intensity = 0.5,
  size = 1,
  fps = 18,
  blend = "dual",
  weave = 0,
  scratches = 0.2,
  vignette = 0.3,
  flicker = 0.2,
  calm = 0.5,
  calmRadius = 140,
  intro = true,
  interactive = true,
  paused = false,
  seed = 24,
  dpr = 2,
  className,
}: FilmGrainProps) {
  const motionSafe = useMotionSafe();
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const contentRef = React.useRef<HTMLDivElement | null>(null);
  const darkRef = React.useRef<HTMLDivElement | null>(null);
  const lightRef = React.useRef<HTMLDivElement | null>(null);
  const lampRef = React.useRef<HTMLDivElement | null>(null);
  const shadeRef = React.useRef<HTMLDivElement | null>(null);

  const patchX = useMotionValue(0);
  const patchY = useMotionValue(0);
  const patchR = useMotionValue(calmRadius);
  const patchOn = useMotionValue(0);

  const grain = clamp(size, 0.5, 3);
  const dual = blend === "dual";

  const params = React.useRef({
    fps,
    weave,
    scratches,
    flicker,
    vignette,
    calm,
    calmRadius,
    intro,
    interactive,
    paused,
    seed,
    grain,
    dpr,
    motionSafe,
  });
  React.useEffect(() => {
    params.current = {
      fps,
      weave,
      scratches,
      flicker,
      vignette,
      calm,
      calmRadius,
      intro,
      interactive,
      paused,
      seed,
      grain,
      dpr,
      motionSafe,
    };
  });

  const api = React.useRef<{
    wake: () => void;
    still: () => void;
    layout: () => void;
  } | null>(null);

  // The tiles: made (or found) once per seed, then laid on the layers.
  React.useEffect(() => {
    let live = true;
    void grainTiles(seed).then((tiles) => {
      if (!live) return;
      const lay = (host: HTMLDivElement | null, urls: string[]) => {
        if (!host) return;
        Array.from(host.children).forEach((layer, i) => {
          if (!(layer instanceof HTMLElement) || !layer.dataset.grain) return;
          const url = urls[i % Math.max(1, urls.length)];
          layer.style.backgroundImage = url ? `url("${url}")` : "none";
        });
        host.style.visibility = "visible";
      };
      lay(darkRef.current, dual ? tiles.dark : tiles.signed);
      lay(lightRef.current, dual ? tiles.light : []);
      api.current?.still();
    });
    return () => {
      live = false;
    };
  }, [seed, dual]);

  React.useEffect(() => {
    const root = rootRef.current;
    const content = contentRef.current;
    const dark = darkRef.current;
    const light = lightRef.current;
    const lamp = lampRef.current;
    const shade = shadeRef.current;
    if (!root || !content || !dark || !light || !lamp || !shade) return;
    const layersOf = (host: HTMLDivElement) =>
      Array.from(host.children).filter(
        (c): c is HTMLElement =>
          c instanceof HTMLElement && Boolean(c.dataset.grain),
      );
    const scratchesOf = (host: HTMLDivElement) =>
      Array.from(host.children).filter(
        (c): c is HTMLElement =>
          c instanceof HTMLElement && Boolean(c.dataset.scratch),
      );
    const grains = [layersOf(dark), layersOf(light)];
    const lines = [...scratchesOf(dark), ...scratchesOf(light)];
    const life = new Int8Array(lines.length);

    let tileCss = 128;
    // One grain pixel per device pixel (up to `dpr`), times `size`.
    const layout = () => {
      const p = params.current;
      const ratio = Math.min(
        2,
        Math.max(1, p.dpr),
        window.devicePixelRatio || 1,
      );
      tileCss = r2((TILE / ratio) * p.grain);
      for (const layers of grains) {
        for (const layer of layers) {
          layer.style.left = `${-tileCss}px`;
          layer.style.top = `${-tileCss}px`;
          layer.style.backgroundSize = `${tileCss}px ${tileCss}px`;
        }
      }
    };
    layout();

    let timer = 0;
    let frame = 0;
    let inView = false;
    let started = false;
    let startAt = 0;

    /** One projected frame: which tile, where, and the flaws. */
    const project = (still: boolean) => {
      const p = params.current;
      const s = p.seed;
      const tile = tileCss;
      grains.forEach((layers, g) => {
        const pick = still ? 0 : hash(frame * 4 + g, s) < 0.5 ? 0 : 1;
        layers.forEach((layer, i) => {
          if (i === pick) {
            const x = still
              ? 0
              : Math.round(hash(frame * 4 + g + 1, s + 3) * tile * 2) / 2;
            const y = still
              ? 0
              : Math.round(hash(frame * 4 + g + 2, s + 5) * tile * 2) / 2;
            layer.style.transform = `translate3d(${x}px, ${y}px, 0)`;
            layer.style.opacity = "1";
          } else {
            layer.style.opacity = "0";
          }
        });
      });
      // Gate weave: a smooth seeded walk, a fraction of a pixel.
      const amount = clamp(p.weave, 0, 2);
      if (!still && amount > 0) {
        const a = hash(1, s) * 6.28;
        const b = hash(2, s) * 6.28;
        const wx =
          amount *
          (0.6 * Math.sin(frame * 0.37 + a) + 0.4 * Math.sin(frame * 1.13 + b));
        const wy =
          amount *
          0.6 *
          (0.6 * Math.sin(frame * 0.29 + b) + 0.4 * Math.sin(frame * 0.91 + a));
        content.style.transform = `translate(${r2(wx)}px, ${r2(wy)}px)`;
      } else {
        content.style.transform = "";
      }
      // The lamp: a little brighter or dimmer each frame, more while the
      // projector is still spinning up.
      const spin = started
        ? 1 - smoothstep(0, STARTUP, performance.now() - startAt)
        : 0;
      const waver = clamp(p.flicker, 0, 1) * (1 + 2.5 * spin);
      lamp.style.opacity = still
        ? "0"
        : String(r2(waver * (0.015 + 0.05 * hash(frame, s + 9))));
      shade.style.opacity = still
        ? "1"
        : String(r2(1 - waver * 0.25 * hash(frame, s + 11)));
      // Scratches: a few live a frame or three, then go.
      const rate = clamp(p.scratches, 0, 1);
      const w = root.clientWidth;
      lines.forEach((line, i) => {
        if (still || rate <= 0) {
          life[i] = 0;
          line.style.opacity = "0";
          return;
        }
        if ((life[i] ?? 0) > 0) {
          life[i] = (life[i] ?? 0) - 1;
          if (life[i] === 0) line.style.opacity = "0";
          return;
        }
        if (hash(frame * 13 + i, s + 17) > rate * 0.16) return;
        life[i] = 1 + Math.floor(hash(frame * 13 + i, s + 19) * 3);
        const x = Math.round(hash(frame * 13 + i, s + 23) * w);
        const top = hash(frame * 13 + i, s + 29) * 0.5;
        const span = 0.35 + hash(frame * 13 + i, s + 31) * 0.65;
        line.style.transform = `translate(${x}px, ${r2(top * 100)}%) scaleY(${r2(span)})`;
        line.style.opacity = String(r2(0.18 + 0.4 * hash(frame, s + 37 + i)));
      });
    };

    const tick = () => {
      timer = 0;
      const p = params.current;
      if (!inView || document.hidden || p.paused || !p.motionSafe) return;
      frame += 1;
      project(false);
      const target = clamp(p.fps, 1, 30);
      const now = performance.now();
      const rate = started
        ? REST_FPS + (target - REST_FPS) * smoothstep(0, STARTUP, now - startAt)
        : target;
      timer = window.setTimeout(tick, 1000 / Math.max(1, rate));
    };

    const wake = () => {
      const p = params.current;
      if (!p.motionSafe || p.paused) {
        if (timer) window.clearTimeout(timer);
        timer = 0;
        project(true);
        return;
      }
      if (timer || !inView || document.hidden) return;
      tick();
    };

    api.current = {
      wake,
      still: () => project(!params.current.motionSafe || params.current.paused),
      layout: () => {
        layout();
        project(!params.current.motionSafe || params.current.paused);
      },
    };

    project(true);
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      if (!entry) return;
      inView = entry.isIntersecting;
      if (!inView) {
        if (timer) window.clearTimeout(timer);
        timer = 0;
        return;
      }
      if (!started && params.current.intro && params.current.motionSafe) {
        started = true;
        startAt = performance.now();
      }
      wake();
    });
    watcher.observe(root);
    const onVisibility = () => {
      if (document.hidden) {
        if (timer) window.clearTimeout(timer);
        timer = 0;
      } else {
        wake();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    // The clear patch: one mask written to both grain layers from the
    // patch's motion values.
    const masks = [dark, light];
    const writeMask = () => {
      const on = patchOn.get();
      const keep = Math.round(
        (1 - clamp(params.current.calm, 0, 1) * on) * 100,
      );
      const value =
        on < 0.01 || keep >= 100
          ? "none"
          : `radial-gradient(circle ${r2(patchR.get())}px at ${r2(patchX.get())}px ${r2(patchY.get())}px, color-mix(in oklab, black ${keep}%, transparent) 0%, color-mix(in oklab, black ${keep}%, transparent) 30%, black 100%)`;
      for (const host of masks) {
        host.style.maskImage = value;
        host.style.setProperty("-webkit-mask-image", value);
      }
    };
    const unsubscribe = [patchX, patchY, patchR, patchOn].map((mv) =>
      mv.on("change", writeMask),
    );

    return () => {
      if (timer) window.clearTimeout(timer);
      timer = 0;
      watcher.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      for (const off of unsubscribe) off();
      content.style.transform = "";
      api.current = null;
    };
  }, [patchX, patchY, patchR, patchOn]);

  React.useEffect(() => {
    api.current?.wake();
  }, [fps, weave, scratches, flicker, paused, motionSafe]);
  React.useEffect(() => {
    api.current?.layout();
  }, [grain, dpr]);

  const local = (event: { clientX: number; clientY: number }) => {
    const rect = rootRef.current?.getBoundingClientRect();
    return rect
      ? { x: event.clientX - rect.left, y: event.clientY - rect.top }
      : { x: 0, y: 0 };
  };
  /** Moves the clear patch: glides there, or jumps under reduced motion. */
  const clearAt = (x: number, y: number, radius: number, jump: boolean) => {
    if (jump || !motionSafe) {
      patchX.jump(r2(x));
      patchY.jump(r2(y));
      patchR.jump(r2(radius));
    } else {
      animate(patchX, r2(x), springs.glide);
      animate(patchY, r2(y), springs.glide);
      animate(patchR, r2(radius), springs.glide);
    }
    if (patchOn.get() < 0.999) {
      if (motionSafe) {
        animate(patchOn, 1, { duration: durations.base, ease: easings.enter });
      } else {
        patchOn.jump(1);
      }
    }
  };
  const release = () => {
    if (motionSafe) {
      animate(patchOn, 0, { duration: durations.slow, ease: easings.exit });
    } else {
      patchOn.jump(0);
    }
  };
  const inside = React.useRef(false);

  const layer = "absolute bg-repeat opacity-0 will-change-transform";
  // Placed and sized once the device's pixel ratio is known (after mount).
  const layerStyle: React.CSSProperties = { right: 0, bottom: 0 };
  const scratch = "absolute top-0 left-0 h-full w-px origin-top opacity-0";
  const strength = clamp(intensity, 0, 1);

  return (
    <div
      ref={rootRef}
      onPointerEnter={(event) => {
        if (!interactive || event.pointerType === "touch") return;
        inside.current = true;
        const at = local(event);
        clearAt(at.x, at.y, calmRadius, true);
      }}
      onPointerMove={(event) => {
        if (!interactive || event.pointerType === "touch") return;
        inside.current = true;
        const at = local(event);
        clearAt(at.x, at.y, calmRadius, false);
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === "touch") return;
        inside.current = false;
        release();
      }}
      onFocus={(event) => {
        if (!interactive) return;
        const target = event.target as HTMLElement;
        if (!target.matches(":focus-visible")) return;
        const outer = rootRef.current?.getBoundingClientRect();
        const box = target.getBoundingClientRect();
        if (!outer) return;
        clearAt(
          box.left + box.width / 2 - outer.left,
          box.top + box.height / 2 - outer.top,
          Math.max(calmRadius, Math.hypot(box.width, box.height) / 2 + 24),
          false,
        );
      }}
      onBlur={(event) => {
        const next = event.relatedTarget as Node | null;
        if (next && rootRef.current?.contains(next)) return;
        if (!inside.current) release();
      }}
      className={cn("relative isolate", className)}
    >
      <div ref={contentRef} className="relative h-full w-full">
        {children}
      </div>
      <div
        ref={shadeRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-[inherit]"
        style={{
          mixBlendMode: "multiply",
          backgroundImage: `radial-gradient(ellipse 120% 105% at 50% 46%, transparent 52%, color-mix(in oklab, black ${Math.round(clamp(vignette, 0, 1) * 55)}%, transparent) 100%)`,
        }}
      />
      <div
        ref={darkRef}
        aria-hidden
        className="pointer-events-none invisible absolute inset-0 overflow-hidden rounded-[inherit] transition-opacity duration-500"
        style={{
          mixBlendMode: dual ? "multiply" : blend,
          opacity: r2(strength * (dual ? 0.85 : 1)),
        }}
      >
        <div data-grain="a" className={layer} style={layerStyle} />
        <div data-grain="b" className={layer} style={layerStyle} />
        {Array.from({ length: SCRATCHES }, (_, i) => (
          <div
            key={i}
            data-scratch=""
            className={scratch}
            style={{
              backgroundImage:
                "linear-gradient(to bottom, transparent, black 18%, black 70%, transparent)",
            }}
          />
        ))}
      </div>
      <div
        ref={lightRef}
        aria-hidden
        className={cn(
          "pointer-events-none invisible absolute inset-0 overflow-hidden rounded-[inherit] transition-opacity duration-500",
          !dual && "hidden",
        )}
        style={{ mixBlendMode: "screen", opacity: r2(strength * 0.7) }}
      >
        <div data-grain="a" className={layer} style={layerStyle} />
        <div data-grain="b" className={layer} style={layerStyle} />
        {Array.from({ length: SCRATCHES }, (_, i) => (
          <div
            key={i}
            data-scratch=""
            className={scratch}
            style={{
              backgroundImage:
                "linear-gradient(to bottom, transparent, white 25%, white 65%, transparent)",
            }}
          />
        ))}
      </div>
      <div
        ref={lampRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-[inherit] bg-white opacity-0"
        style={{ mixBlendMode: "soft-light" }}
      />
    </div>
  );
}
