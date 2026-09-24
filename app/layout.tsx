import type { Metadata } from "next";
import "./globals.css";
import { I18nProvider } from "./i18n";
import { publicAsset } from "./site-path";
import LegacyPwaCleanup from "./components/LegacyPwaCleanup";

export const metadata: Metadata = {
  title: "西湖无障碍导览 | Accessible West Lake Guide",
  description: "面向视障游客的西湖十景语音讲解、定位与步行导览。Accessible audio guides to the ten scenes of West Lake.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <head>
        <link rel="icon" href={publicAsset("quyuan-fenghe.jpg")} type="image/jpeg" />
      </head>
      <body><I18nProvider><LegacyPwaCleanup />{children}</I18nProvider></body>
    </html>
  );
}
