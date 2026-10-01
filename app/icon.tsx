import { ImageResponse } from "next/og";

import { LOGO_PATH, LOGO_VIEWBOX } from "@/lib/logo";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

/** The mark in white on the site's night, as the favicon. */
export default function Icon() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#10131a",
        borderRadius: 7,
      }}
    >
      <svg width={22} height={19} viewBox={LOGO_VIEWBOX} fill="#ffffff">
        <path d={LOGO_PATH} />
      </svg>
    </div>,
    size,
  );
}
