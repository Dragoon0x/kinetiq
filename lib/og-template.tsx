import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { ImageResponse } from "next/og";

export const OG_SIZE = { width: 1200, height: 630 };

/** Engineering grid as an SVG data URI (satori-safe background). */
const GRID_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96">
<path d="M24 0V96M48 0V96M72 0V96M0 24H96M0 48H96M0 72H96" stroke="rgba(226,232,244,0.05)" stroke-width="1"/>
<path d="M96 0V96M0 96H96" stroke="rgba(226,232,244,0.09)" stroke-width="1"/>
</svg>`;

const gridDataUri = `data:image/svg+xml,${encodeURIComponent(GRID_SVG)}`;

/**
 * Shared OG card: navy bench, engineering grid, serial eyebrow, title,
 * tagline, and the wordmark rail. Fonts read from assets/fonts at build time.
 */
export async function ogCard({
  serial,
  title,
  tagline,
}: {
  serial: string;
  title: string;
  tagline: string;
}) {
  const [mono, sans] = await Promise.all([
    readFile(join(process.cwd(), "assets/fonts/MartianMono-Medium.ttf")),
    readFile(join(process.cwd(), "assets/fonts/InstrumentSans-SemiBold.ttf")),
  ]);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          backgroundColor: "#10131a",
          backgroundImage: `url("${gridDataUri}")`,
          backgroundSize: "96px 96px",
          padding: 72,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span
            style={{
              fontFamily: "MartianMono",
              fontSize: 24,
              letterSpacing: "0.1em",
              color: "#8b93a7",
            }}
          >
            {serial}
          </span>
          <span
            style={{
              fontFamily: "MartianMono",
              fontSize: 20,
              letterSpacing: "0.1em",
              color: "#5865f2",
            }}
          >
            ● CALIBRATED
          </span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <span
            style={{
              fontFamily: "InstrumentSans",
              fontSize: 84,
              fontWeight: 600,
              color: "#f2f4f9",
              letterSpacing: "-0.02em",
            }}
          >
            {title}
          </span>
          <span
            style={{
              fontFamily: "InstrumentSans",
              fontSize: 32,
              color: "#a8afc0",
            }}
          >
            {tagline}
          </span>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            borderTop: "1px solid rgba(226,232,244,0.14)",
            paddingTop: 28,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 40,
                height: 40,
                borderRadius: 4,
                border: "1px solid rgba(226,232,244,0.2)",
                color: "#6d7cff",
                fontFamily: "MartianMono",
                fontSize: 22,
              }}
            >
              K
            </div>
            <span
              style={{
                fontFamily: "InstrumentSans",
                fontSize: 28,
                color: "#f2f4f9",
              }}
            >
              Kinetiq
            </span>
          </div>
          <span
            style={{
              fontFamily: "MartianMono",
              fontSize: 20,
              letterSpacing: "0.08em",
              color: "#8b93a7",
            }}
          >
            MOTION, CALIBRATED.
          </span>
        </div>
      </div>
    ),
    {
      ...OG_SIZE,
      fonts: [
        { name: "MartianMono", data: mono, weight: 500 as const },
        { name: "InstrumentSans", data: sans, weight: 600 as const },
      ],
    },
  );
}
