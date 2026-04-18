import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  const orgName = process.env.NEXT_PUBLIC_ORG_NAME || "試合管理";

  return {
    name: `${orgName} - 試合管理 & AI アナウンス`,
    short_name: `${orgName}大会`,
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#1e3a5f",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
