"use client";

import { useEffect, useState } from "react";
import type { VisualGuide } from "../data/visual-guides";
import { T, useI18n } from "../i18n";
import { publicAsset } from "../site-path";
import SiteHeader from "./SiteHeader";

type VisualSceneGuideProps = {
  guide: VisualGuide;
};

function speakDescription(
  description: string,
  language: string,
  onStart: () => void,
  onFinish: () => void,
) {
  if (!("speechSynthesis" in window)) return;

  const utterance = new SpeechSynthesisUtterance(description);
  utterance.lang = language;
  utterance.rate = 0.88;
  utterance.onstart = onStart;
  utterance.onend = onFinish;
  utterance.onerror = onFinish;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}

export default function VisualSceneGuide({ guide }: VisualSceneGuideProps) {
  const { locale } = useI18n();
  const [isReading, setIsReading] = useState(false);
  const hasEnglishGuide = Boolean(guide.paragraphs.en);
  const sceneParagraphs =
    locale === "en" && guide.paragraphs.en
      ? guide.paragraphs.en
      : guide.paragraphs.zh;
  const sceneDescription = sceneParagraphs.join("\n\n");
  const narrationLanguage =
    locale === "en" && hasEnglishGuide ? "en-US" : "zh-CN";
  const imageAlt =
    locale === "en"
      ? guide.imageAltEn ?? guide.titleEn
      : guide.imageAltZh ?? guide.titleZh;

  useEffect(() => {
    const shouldAutoplay =
      new URLSearchParams(window.location.search).get("autoplay") === "1";
    if (shouldAutoplay) {
      speakDescription(
        sceneDescription,
        narrationLanguage,
        () => setIsReading(true),
        () => setIsReading(false),
      );
    }

    return () => window.speechSynthesis?.cancel();
  }, [narrationLanguage, sceneDescription]);

  const playDescription = () => {
    speakDescription(
      sceneDescription,
      narrationLanguage,
      () => setIsReading(true),
      () => setIsReading(false),
    );
  };

  const stopDescription = () => {
    window.speechSynthesis?.cancel();
    setIsReading(false);
  };

  return (
    <div className="page-shell detail-page visual-detail">
      <SiteHeader
        backHref="/visual"
        backLabel="西湖十景"
        backLabelEn="Ten scenes"
      />
      <main className="visual-detail-main">
        <div
          className={`detail-photo${guide.image ? "" : " detail-photo-placeholder"}`}
          role="img"
          aria-label={imageAlt}
          style={
            guide.image
              ? { backgroundImage: `url(${publicAsset(guide.image)})` }
              : undefined
          }
        >
          {!guide.image && <span aria-hidden="true">{guide.titleZh}</span>}
        </div>
        <article className="description-panel">
          <h1><T zh={guide.titleZh} en={guide.titleEn} /></h1>
          <div className="audio-controls">
            <button
              type="button"
              className="read-button"
              onClick={isReading ? stopDescription : playDescription}
            >
              <span aria-hidden="true">{isReading ? "■" : "▶"}</span>
              {isReading ? <T zh="停止" en="Stop" /> : <T zh="播放介绍" en="Play guide" />}
            </button>
            <button
              type="button"
              className="replay-button"
              onClick={playDescription}
            >
              <span aria-hidden="true">↻</span>
              <T zh="重播" en="Replay" />
            </button>
          </div>
          <p
            className="sr-only"
            role="status"
            aria-live="polite"
          >
            {isReading
              ? <T zh="介绍正在播放" en="The guide is playing" />
              : <T zh="介绍已停止" en="The guide has stopped" />}
          </p>
        </article>
      </main>
    </div>
  );
}
