"use client";

import Link from "next/link";
import { ENGLISH_READY, T, useI18n } from "../i18n";

type SiteHeaderProps = {
  backHref?: string;
  backLabel?: string;
  backLabelEn?: string;
};

export default function SiteHeader({ backHref, backLabel = "返回", backLabelEn = "Back" }: SiteHeaderProps) {
  const { locale, setLocale } = useI18n();
  return (
    <header className="minimal-header">
      <a className="skip-link" href="#main-content">{locale === "zh" ? "跳到主要内容" : "Skip to content"}</a>
      <Link className="minimal-brand" href="/" aria-label={locale === "zh" ? "西湖无障碍导览首页" : "Accessible West Lake Guide home"}>
        <span aria-hidden="true">湖</span>
        <strong><T zh="西湖无障碍导览" en="Accessible West Lake" /></strong>
      </Link>
      <div className="header-actions">
        {backHref ? (
          <Link className="back-link" href={backHref}>
            <span aria-hidden="true">←</span> {locale === "zh" ? backLabel : backLabelEn}
          </Link>
        ) : null}
        <button disabled={!ENGLISH_READY} title={ENGLISH_READY ? undefined : "英文完整讲解校验后开放"} className="language-switch" type="button" onClick={() => setLocale(locale === "zh" ? "en" : "zh")} aria-label={!ENGLISH_READY ? "英文讲解准备中，暂不可切换" : locale === "zh" ? "Switch to English" : "切换到中文"}>
          {locale === "zh" ? "EN" : "中"}
        </button>
      </div>
    </header>
  );
}
