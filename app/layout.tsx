import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "本地订阅转换",
  description: "在 iPhone 与 Mac 浏览器中本地解析并转换代理订阅。",
  applicationName: "流转",
  manifest: "./manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "流转" },
  icons: {
    icon: [
      { url: "./favicon-flow-32.png", sizes: "32x32", type: "image/png" },
      { url: "./favicon-flow-48.png", sizes: "48x48", type: "image/png" },
      { url: "./icon-flow-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: { url: "./apple-touch-icon-flow.png", sizes: "180x180", type: "image/png" },
  },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#14231d" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><head>
    <meta property="og:title" content="本地订阅转换" />
    <meta property="og:description" content="订阅只在你的设备上转换" />
    <meta property="og:image" content="https://kunlun7210.github.io/subflow/icon-flow-512.png" />
    <meta property="og:image:width" content="512" />
    <meta property="og:image:height" content="512" />
    <meta name="twitter:card" content="summary" />
    <meta name="twitter:image" content="https://kunlun7210.github.io/subflow/icon-flow-512.png" />
  </head><body>{children}</body></html>;
}
