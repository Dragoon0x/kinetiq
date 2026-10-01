import { ImageResponse } from "next/og";

import { LOGO_PATH, LOGO_VIEWBOX } from "@/lib/logo";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** The mark in white on the site's night, at home-screen size. */
export default function AppleIcon() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#10131a",
      }}
    >
      <svg width={104} height={88} viewBox={LOGO_VIEWBOX} fill="#ffffff">
        <path d={LOGO_PATH} />
      </svg>
    </div>,
    size,
  );
}
