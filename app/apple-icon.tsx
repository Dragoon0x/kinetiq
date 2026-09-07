import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** The K specimen tile at home-screen size. */
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
        color: "#6d7cff",
        fontSize: 112,
        fontWeight: 700,
        fontFamily: "monospace",
      }}
    >
      K
    </div>,
    size,
  );
}
