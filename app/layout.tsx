import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "本地订阅转换。",
  description: "在 iPhone 与 Mac 浏览器中本地解析并转换代理订阅。",
  applicationName: "流转",
  manifest: "./manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "流转" },
  icons: { icon: "./icon-192.png", apple: "./icon-192.png" },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#14231d" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><head>
    <meta property="og:title" content="本地订阅转换。" />
    <meta property="og:description" content="订阅只在你的设备上转换" />
    <meta property="og:image" content="./og.png" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:image" content="./og.png" />
  </head><body>{children}</body></html>;
}
