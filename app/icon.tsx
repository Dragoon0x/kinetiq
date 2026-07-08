import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

/** The K specimen tile as the favicon. */
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#10131a",
          border: "2px solid rgba(226,232,244,0.25)",
          borderRadius: 6,
          color: "#6d7cff",
          fontSize: 20,
          fontWeight: 700,
          fontFamily: "monospace",
        }}
      >
        K
      </div>
    ),
    size,
  );
}
