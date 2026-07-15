import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "谱面练习台 · Drum Focus",
  description: "智能识别并标记架子鼓谱中的每一个小节。",
  icons: { icon: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
