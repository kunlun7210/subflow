import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "本地订阅转换",
    short_name: "流转",
    description: "在 iPhone 与 Mac 浏览器中本地解析并转换代理订阅。",
    start_url: "./",
    scope: "./",
    display: "standalone",
    background_color: "#f6f5ee",
    theme_color: "#14231d",
    orientation: "any",
    icons: [
      { src: "./apple-touch-icon.png?v=2", sizes: "180x180", type: "image/png" },
      { src: "./icon-192.png?v=2", sizes: "192x192", type: "image/png" },
      { src: "./icon-512.png?v=2", sizes: "512x512", type: "image/png", purpose: "any maskable" },
    ],
  };
}
