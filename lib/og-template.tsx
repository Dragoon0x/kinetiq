import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { ImageResponse } from "next/og";

import { sectionFamilyOf } from "@/content/block-categories";
import {
  categoryBySlug,
  categoryOf,
  type Category,
  type CategorySlug,
} from "@/content/categories";
import type { GuideMeta } from "@/content/guides";
import type { LabMeta } from "@/content/labs";
import {
  catalogBlocks,
  catalogComponents,
  catalogPages,
  catalogTemplates,
} from "@/content/manifest";
import type { KinetiqItem } from "@/content/manifest/types";
import { pageFamilyOf } from "@/content/page-categories";
import type { Showcase } from "@/content/showcases";
import { templateKindOf } from "@/content/template-categories";
import type { SpringName } from "@/registry/lib/motion";

import { SPRING_NAMES, springTrace, windowFor } from "./og-curve";
import { siteConfig } from "./site-config";

/*
 * The share card.
 *
 * A screenshot of an animated component is a still of the wrong moment. The
 * card shows the physics instead: the spring the page runs on, integrated
 * from the real calibration and drawn as a trace, next to a title sized to
 * read from a feed. Registry items carry the one-line install so the card
 * answers "how do I get this" before the click; everything else carries its
 * address.
 *
 * Every literal painted here must stay ASCII (validate:integrity enforces
 * it): the mono face is a subset and draws anything else as a box. Marks are
 * drawn, not typed, and prose that flows through is set in the full sans.
 */

export const OG_SIZE = { width: 1200, height: 630 };

const BENCH = "#10131a";
const INK = "#f2f4f9";
const INK_2 = "#a8afc0";
const INK_3 = "#8b93a7";
const HAIRLINE = "rgba(226,232,244,0.14)";
const HAIRLINE_STRONG = "rgba(226,232,244,0.3)";
const MONO = "MartianMono";
const SANS = "InstrumentSans";

const ACCENT_RGB = {
  cobalt: [88, 101, 242],
  sky: [76, 201, 240],
  mint: [61, 220, 151],
  amber: [245, 185, 66],
  coral: [255, 107, 107],
  violet: [167, 139, 250],
} as const;

export type Accent = keyof typeof ACCENT_RGB;

const rgba = (accent: Accent, alpha = 1) => {
  const [r, g, b] = ACCENT_RGB[accent];
  return `rgba(${r},${g},${b},${alpha})`;
};

/** Each spring's own colour, for the five-curve overlay. */
const SPRING_ACCENT: Record<SpringName, Accent> = {
  flick: "cobalt",
  snap: "sky",
  glide: "mint",
  drift: "violet",
  recoil: "coral",
};

/** The spring a category is known for, and the colour it wears on a card. */
const CATEGORY_LOOK: Record<
  CategorySlug,
  { spring: SpringName; accent: Accent }
> = {
  inputs: { spring: "flick", accent: "cobalt" },
  selection: { spring: "snap", accent: "sky" },
  navigation: { spring: "snap", accent: "cobalt" },
  overlays: { spring: "glide", accent: "violet" },
  data: { spring: "glide", accent: "sky" },
  feedback: { spring: "recoil", accent: "mint" },
  agent: { spring: "glide", accent: "sky" },
  layout: { spring: "glide", accent: "cobalt" },
  motion: { spring: "snap", accent: "cobalt" },
  text: { spring: "flick", accent: "amber" },
  backgrounds: { spring: "drift", accent: "violet" },
  vignettes: { spring: "drift", accent: "violet" },
  cursor: { spring: "flick", accent: "amber" },
  effects: { spring: "recoil", accent: "coral" },
  physics: { spring: "recoil", accent: "coral" },
  spatial: { spring: "drift", accent: "violet" },
  delight: { spring: "recoil", accent: "amber" },
  game: { spring: "flick", accent: "coral" },
};

export type OgItemKind = "components" | "blocks" | "pages" | "templates";

const KIND_LABEL: Record<OgItemKind, string> = {
  components: "COMPONENT",
  blocks: "BLOCK",
  pages: "PAGE",
  templates: "TEMPLATE",
};

const KIND_NOUN: Record<OgItemKind, string> = {
  components: "component",
  blocks: "section",
  pages: "page",
  templates: "site template",
};

const KIND_LOOK: Record<
  Exclude<OgItemKind, "components">,
  { spring: SpringName; accent: Accent }
> = {
  blocks: { spring: "glide", accent: "cobalt" },
  pages: { spring: "glide", accent: "mint" },
  templates: { spring: "drift", accent: "amber" },
};

const HOST = siteConfig.url.replace(/^https?:\/\//, "");

type Stat = { value: string; label: string };
type Trace = { kind: "single"; spring: SpringName } | { kind: "all" };

export type OgCard = {
  /** Mono parts across the top, joined by drawn dots; the first wears the accent. */
  eyebrow: string[];
  title: string;
  tagline: string;
  accent: Accent;
  trace: Trace;
  /** The top-right pill, e.g. ["MIT", "COPY THE SOURCE"]. */
  pill: string[];
  /** The mono chip on the rail: an install command or the page's address. */
  chip: string;
  /** Big numerals under the tagline, for the landing and index cards. */
  stats?: Stat[];
};

// ── card builders ─────────────────────────────────────────────────────────

const OPEN_SOURCE = ["MIT", "COPY THE SOURCE"];

export function itemCard(item: KinetiqItem, kind: OgItemKind): OgCard {
  const family =
    kind === "components"
      ? categoryBySlug(categoryOf(item))?.label
      : kind === "blocks"
        ? sectionFamilyOf(item)?.label
        : kind === "pages"
          ? pageFamilyOf(item)?.label
          : templateKindOf(item)?.label;
  const look =
    kind === "components" ? CATEGORY_LOOK[categoryOf(item)] : KIND_LOOK[kind];
  return {
    eyebrow: [
      KIND_LABEL[kind],
      item.meta?.serial ?? "KINETIQ",
      ...(family ? [family.toUpperCase()] : []),
    ],
    title: item.title,
    tagline: item.tagline,
    accent: look.accent,
    trace: { kind: "single", spring: look.spring },
    pill: OPEN_SOURCE,
    chip: `npx shadcn add ${siteConfig.registryNamespace}/${item.name}`,
  };
}

/** The image's alt text: what a reader who cannot see it should know. */
export function itemAlt(item: KinetiqItem, kind: OgItemKind): string {
  const serial = item.meta?.serial ? ` ${item.meta.serial}` : "";
  return `${item.title}, Kinetiq ${KIND_NOUN[kind]}${serial}: ${item.tagline}`;
}

export function guideCard(guide: GuideMeta, chapter: number): OgCard {
  return {
    eyebrow: [
      "FIELD MANUAL",
      guide.serial,
      `CHAPTER ${String(chapter).padStart(2, "0")}`,
    ],
    title: guide.title,
    tagline: guide.tagline,
    accent: "cobalt",
    trace: { kind: "all" },
    pill: ["GUIDE", "FREE TO READ"],
    chip: `${HOST}/guides/${guide.slug}`,
  };
}

export function labCard(lab: LabMeta): OgCard {
  return {
    eyebrow: ["PLAYGROUND", lab.serial, "LIVE BENCH"],
    title: lab.title,
    tagline: lab.tagline,
    accent: "sky",
    trace: { kind: "all" },
    pill: ["INTERACTIVE", "NO SIGNUP"],
    chip: `${HOST}/playground/${lab.slug}`,
  };
}

export function showcaseCard(
  showcase: Showcase,
  category: Category,
  count: number,
): OgCard {
  const look = CATEGORY_LOOK[category.slug];
  return {
    eyebrow: ["SHOWCASE", category.label.toUpperCase(), `${count} INSTRUMENTS`],
    title: showcase.headline,
    tagline: showcase.deck,
    accent: look.accent,
    trace: { kind: "single", spring: look.spring },
    pill: ["LIVE", "RUN IN PLACE"],
    chip: `${HOST}/showcase/${showcase.slug}`,
  };
}

export function categoryCard(category: Category, count: number): OgCard {
  const look = CATEGORY_LOOK[category.slug];
  return {
    eyebrow: ["CATEGORY", `${count} INSTRUMENTS`],
    title: `${category.label} components`,
    tagline: category.blurb,
    accent: look.accent,
    trace: { kind: "single", spring: look.spring },
    pill: OPEN_SOURCE,
    chip: `${HOST}/components/category/${category.slug}`,
  };
}

/** An index or landing page: the section's count is the hook. */
export function indexCard({
  eyebrow,
  title,
  tagline,
  path,
  stats,
  accent = "cobalt",
}: {
  eyebrow: string[];
  title: string;
  tagline: string;
  path: string;
  stats: Stat[];
  accent?: Accent;
}): OgCard {
  return {
    eyebrow,
    title,
    tagline,
    accent,
    trace: { kind: "all" },
    pill: ["MIT", "OPEN SOURCE"],
    chip: `${HOST}${path}`,
    stats,
  };
}

/** The catalog's headline numbers, shared by the home and index cards. */
export function catalogStats(): Stat[] {
  return [
    { value: String(catalogComponents.length), label: "INSTRUMENTS" },
    { value: String(catalogBlocks.length), label: "SECTIONS" },
    {
      value: String(catalogPages.length + catalogTemplates.length),
      label: "PAGES AND SITES",
    },
  ];
}

export function homeCard(): OgCard {
  return {
    eyebrow: ["KINETIQ", "REACT MOTION LIBRARY"],
    title: siteConfig.tagline,
    tagline: `${catalogComponents.length} animated React components on five calibrated springs. Copy the source. Own the code.`,
    accent: "cobalt",
    trace: { kind: "all" },
    pill: ["MIT", "OPEN SOURCE"],
    chip: `npx shadcn add ${siteConfig.registryNamespace}/pressure-button`,
    stats: catalogStats(),
  };
}

// ── painting ──────────────────────────────────────────────────────────────

const GRID_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96">
<path d="M24 0V96M48 0V96M72 0V96M0 24H96M0 48H96M0 72H96" stroke="rgba(226,232,244,0.045)" stroke-width="1"/>
<path d="M96 0V96M0 96H96" stroke="rgba(226,232,244,0.085)" stroke-width="1"/>
</svg>`;
const gridDataUri = `data:image/svg+xml,${encodeURIComponent(GRID_SVG)}`;

let fontsPromise: Promise<{ mono: Buffer; sans: Buffer }> | undefined;
const loadFonts = () => {
  fontsPromise ??= Promise.all([
    readFile(join(process.cwd(), "assets/fonts/MartianMono-Medium.ttf")),
    readFile(join(process.cwd(), "assets/fonts/InstrumentSans-SemiBold.ttf")),
  ]).then(([mono, sans]) => ({ mono, sans }));
  return fontsPromise;
};

/** Sized to the title: short ones shout, long ones still fit on two lines. */
function titleSize(title: string, compact: boolean): number {
  const n = title.length;
  const base = n <= 14 ? 92 : n <= 22 ? 80 : n <= 34 ? 64 : 54;
  return compact ? Math.min(base, 66) : base;
}

const PANEL = { width: 420, height: 200 };

const caption = {
  display: "flex",
  alignItems: "center",
  gap: 20,
  fontFamily: MONO,
  fontSize: 14,
  letterSpacing: "0.1em",
  whiteSpace: "nowrap",
  color: INK_3,
} as const;

function Dot({ colour, size = 6 }: { colour: string; size?: number }) {
  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: 999,
        backgroundColor: colour,
      }}
    />
  );
}

function Eyebrow({ parts, accent }: { parts: string[]; accent: Accent }) {
  const nodes: React.ReactNode[] = [];
  parts.forEach((part, index) => {
    if (index > 0) nodes.push(<Dot key={`dot-${index}`} colour={INK_3} />);
    nodes.push(
      <span key={part} style={{ color: index === 0 ? rgba(accent) : INK_3 }}>
        {part}
      </span>,
    );
  });
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 16,
        fontFamily: MONO,
        fontSize: 22,
        letterSpacing: "0.12em",
      }}
    >
      {nodes}
    </div>
  );
}

function Pill({ parts, accent }: { parts: string[]; accent: Accent }) {
  const nodes: React.ReactNode[] = [];
  parts.forEach((part, index) => {
    if (index > 0) {
      nodes.push(
        <span
          key={`bar-${index}`}
          style={{ width: 1, height: 16, backgroundColor: HAIRLINE_STRONG }}
        />,
      );
    }
    nodes.push(<span key={part}>{part}</span>);
  });
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "10px 18px",
        borderRadius: 999,
        border: `1px solid ${HAIRLINE_STRONG}`,
        fontFamily: MONO,
        fontSize: 18,
        letterSpacing: "0.1em",
        color: INK_2,
      }}
    >
      <Dot colour={rgba(accent)} size={8} />
      {nodes}
    </div>
  );
}

function SinglePanel({
  spring,
  accent,
}: {
  spring: SpringName;
  accent: Accent;
}) {
  const trace = springTrace(spring, {
    ...PANEL,
    windowMs: windowFor(spring),
  });
  const colour = rgba(accent);
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 18,
        width: PANEL.width,
      }}
    >
      <svg
        width={PANEL.width}
        height={PANEL.height}
        viewBox={`0 0 ${PANEL.width} ${PANEL.height}`}
      >
        <line
          x1="0"
          y1={trace.settle.y}
          x2={PANEL.width}
          y2={trace.settle.y}
          stroke={HAIRLINE_STRONG}
          stroke-width="1"
          stroke-dasharray="6 8"
        />
        <line
          x1="0"
          y1={PANEL.height - 0.5}
          x2={PANEL.width}
          y2={PANEL.height - 0.5}
          stroke={HAIRLINE}
          stroke-width="1"
        />
        <path
          d={trace.path}
          fill="none"
          stroke={colour}
          stroke-width="14"
          stroke-opacity="0.14"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
        <path
          d={trace.path}
          fill="none"
          stroke={colour}
          stroke-width="3.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
        <circle
          cx={trace.settle.x}
          cy={trace.settle.y}
          r="14"
          fill={colour}
          fill-opacity="0.22"
        />
        <circle cx={trace.settle.x} cy={trace.settle.y} r="6" fill={colour} />
      </svg>
      <div style={caption}>
        <span style={{ color: colour }}>{spring.toUpperCase()}</span>
        <Dot colour={INK_3} size={4} />
        <span>{`DAMPING RATIO ${trace.zeta.toFixed(2)}`}</span>
      </div>
      <div style={{ ...caption, marginTop: -8 }}>
        <span>{`STIFFNESS ${trace.stiffness}`}</span>
        <Dot colour={INK_3} size={4} />
        <span>{`DAMPING ${trace.damping}`}</span>
        <Dot colour={INK_3} size={4} />
        <span>{`MASS ${trace.mass}`}</span>
      </div>
    </div>
  );
}

function AllPanel({ accent }: { accent: Accent }) {
  const windowMs = 900;
  const traces = SPRING_NAMES.map((name) => ({
    name,
    colour: rgba(SPRING_ACCENT[name]),
    trace: springTrace(name, { ...PANEL, windowMs }),
  }));
  const targetY = traces[0]?.trace.settle.y ?? 0;
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 18,
        width: PANEL.width,
      }}
    >
      <svg
        width={PANEL.width}
        height={PANEL.height}
        viewBox={`0 0 ${PANEL.width} ${PANEL.height}`}
      >
        <line
          x1="0"
          y1={targetY}
          x2={PANEL.width}
          y2={targetY}
          stroke={HAIRLINE_STRONG}
          stroke-width="1"
          stroke-dasharray="6 8"
        />
        <line
          x1="0"
          y1={PANEL.height - 0.5}
          x2={PANEL.width}
          y2={PANEL.height - 0.5}
          stroke={HAIRLINE}
          stroke-width="1"
        />
        {traces.map(({ name, colour, trace }) => (
          <path
            key={`glow-${name}`}
            d={trace.path}
            fill="none"
            stroke={colour}
            stroke-width="9"
            stroke-opacity="0.12"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        ))}
        {traces.map(({ name, colour, trace }) => (
          <path
            key={name}
            d={trace.path}
            fill="none"
            stroke={colour}
            stroke-width="2.75"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        ))}
      </svg>
      <div style={{ ...caption, gap: 0, justifyContent: "space-between" }}>
        {traces.map(({ name, colour }) => (
          <span
            key={name}
            style={{ display: "flex", alignItems: "center", gap: 8 }}
          >
            <Dot colour={colour} size={7} />
            {name.toUpperCase()}
          </span>
        ))}
      </div>
      <div style={{ ...caption, marginTop: -8, color: rgba(accent) }}>
        FIVE SPRINGS, ONE MOTION LANGUAGE.
      </div>
    </div>
  );
}

function Stats({ stats }: { stats: Stat[] }) {
  const nodes: React.ReactNode[] = [];
  stats.forEach((stat, index) => {
    if (index > 0) {
      nodes.push(
        <span
          key={`bar-${index}`}
          style={{ width: 1, height: 44, backgroundColor: HAIRLINE_STRONG }}
        />,
      );
    }
    nodes.push(
      <div
        key={stat.label}
        style={{ display: "flex", flexDirection: "column", gap: 6 }}
      >
        <span
          style={{
            fontFamily: SANS,
            fontSize: 42,
            lineHeight: 1,
            letterSpacing: "-0.02em",
            color: INK,
          }}
        >
          {stat.value}
        </span>
        <span
          style={{
            fontFamily: MONO,
            fontSize: 12,
            letterSpacing: "0.12em",
            whiteSpace: "nowrap",
            color: INK_3,
          }}
        >
          {stat.label}
        </span>
      </div>,
    );
  });
  return (
    <div
      style={{ display: "flex", alignItems: "center", gap: 22, flexShrink: 0 }}
    >
      {nodes}
    </div>
  );
}

function Rail({ chip }: { chip: string }) {
  const chipSize = chip.length > 44 ? 17 : 19;
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        borderTop: `1px solid ${HAIRLINE}`,
        paddingTop: 22,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 38,
            height: 38,
            borderRadius: 4,
            border: `1px solid ${HAIRLINE_STRONG}`,
            color: "#6d7cff",
            fontFamily: MONO,
            fontSize: 21,
          }}
        >
          K
        </div>
        <span style={{ fontFamily: SANS, fontSize: 26, color: INK }}>
          Kinetiq
        </span>
        <span
          style={{
            fontFamily: MONO,
            fontSize: 15,
            letterSpacing: "0.1em",
            color: INK_3,
            marginLeft: 6,
          }}
        >
          MOTION, CALIBRATED.
        </span>
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "10px 16px",
          borderRadius: 8,
          border: `1px solid ${HAIRLINE_STRONG}`,
          backgroundColor: "rgba(226,232,244,0.05)",
          fontFamily: MONO,
          fontSize: chipSize,
          color: INK,
        }}
      >
        <span style={{ color: INK_3 }}>{">"}</span>
        <span>{chip}</span>
      </div>
    </div>
  );
}

/** Paints a card to a 1200 by 630 PNG. */
export async function renderCard(card: OgCard) {
  const { mono, sans } = await loadFonts();
  const compact = Boolean(card.stats);
  const size = titleSize(card.title, compact);

  return new ImageResponse(
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        backgroundColor: BENCH,
        backgroundImage: `url("${gridDataUri}")`,
        backgroundSize: "96px 96px",
        padding: "52px 64px 44px",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: -260,
          right: -200,
          width: 820,
          height: 820,
          borderRadius: 999,
          backgroundImage: `radial-gradient(circle, ${rgba(card.accent, 0.22)} 0%, ${rgba(card.accent, 0)} 62%)`,
        }}
      />

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <Eyebrow parts={card.eyebrow} accent={card.accent} />
        <Pill parts={card.pill} accent={card.accent} />
      </div>

      <div
        style={{
          display: "flex",
          flex: 1,
          alignItems: "center",
          gap: 44,
          marginTop: 20,
          marginBottom: 20,
        }}
      >
        <div
          style={{
            display: "flex",
            flex: 1,
            minWidth: 0,
            flexDirection: "column",
            gap: compact ? 16 : 20,
          }}
        >
          <div
            style={{
              display: "flex",
              fontFamily: SANS,
              fontSize: size,
              fontWeight: 600,
              lineHeight: 1.02,
              letterSpacing: "-0.025em",
              color: INK,
            }}
          >
            {card.title}
          </div>
          <div
            style={{
              display: "flex",
              maxWidth: 620,
              fontFamily: SANS,
              fontSize: compact ? 26 : 30,
              lineHeight: 1.3,
              color: INK_2,
            }}
          >
            {card.tagline}
          </div>
          {card.stats ? <Stats stats={card.stats} /> : null}
        </div>
        <div style={{ display: "flex", flexShrink: 0 }}>
          {card.trace.kind === "single" ? (
            <SinglePanel spring={card.trace.spring} accent={card.accent} />
          ) : (
            <AllPanel accent={card.accent} />
          )}
        </div>
      </div>

      <Rail chip={card.chip} />
    </div>,
    {
      ...OG_SIZE,
      fonts: [
        { name: MONO, data: mono, weight: 500 as const },
        { name: SANS, data: sans, weight: 600 as const },
      ],
    },
  );
}
