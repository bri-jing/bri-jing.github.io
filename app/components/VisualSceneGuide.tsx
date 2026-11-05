"use client";

import { useEffect, useRef, useState } from "react";
import type { VisualGuide } from "../data/visual-guides";
import { visitNotes } from "../data/visit-notes";
import { imageCredits } from "../data/image-credits";
import { scenicSpotZones } from "../data/scenic-spots";
import { T, useI18n } from "../i18n";
import { publicAsset } from "../site-path";
import SiteHeader from "./SiteHeader";
import WalkingGuide from "./WalkingGuide";

type Playback = "idle" | "reading" | "finished" | "unavailable" | "error";

export default function VisualSceneGuide({ guide }: { guide: VisualGuide }) {
  const { locale } = useI18n();
  const [playback, setPlayback] = useState<Playback>("idle");
  const [paragraph, setParagraph] = useState(0);
  const [walking, setWalking] = useState(false);
  const runRef = useRef(0);
  const speechRef = useRef<SpeechSynthesisUtterance | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const transcriptRef = useRef<HTMLDetailsElement>(null);
  const paragraphs = locale === "en" && guide.paragraphs.en ? guide.paragraphs.en : guide.paragraphs.zh;
  const language = locale === "en" && guide.paragraphs.en ? "en-US" : "zh-CN";
  const credit = imageCredits[guide.slug];
  const spot = scenicSpotZones.find((item) => item.id === guide.slug);
  const title = locale === "zh" ? guide.titleZh : guide.titleEn;

  useEffect(() => {
    const cleanup = () => {
      runRef.current++;
      if (timerRef.current) clearTimeout(timerRef.current);
      window.speechSynthesis?.cancel();
      speechRef.current = null;
    };
    // A tap is still needed on browsers that block speech after navigation.
    const timer = setTimeout(() => { cleanup(); setPlayback("idle"); setParagraph(0); }, 0);
    return () => { clearTimeout(timer); cleanup(); };
  }, [language, guide.slug]);

  const stop = () => {
    runRef.current++;
    if (timerRef.current) clearTimeout(timerRef.current);
    window.speechSynthesis?.cancel(); speechRef.current = null;
    setPlayback("idle");
  };
  const play = () => {
    stop();
    if (!("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) { setPlayback("unavailable"); return; }
    const run = ++runRef.current;
    // Short chunks avoid the long-utterance cutoff on mobile speech engines.
    const chunks = paragraphs.flatMap((text, index) =>
      (text.match(/[^。！？.!?]+[。！？.!?]?/g) ?? [text]).flatMap((sentence) =>
        (sentence.match(/[\s\S]{1,140}/g) ?? [sentence]).map((text) => ({ text, index })),
      ),
    );
    chunks.unshift({ text: locale === "zh" ? `请先在安全位置停下。这是情景讲解，不代表你的当前位置、朝向或实时路况。${visitNotes[guide.slug]?.zh ?? ""}` : `Stop somewhere safe. This narration does not identify your position, orientation or live road conditions. ${visitNotes[guide.slug]?.en ?? ""}`, index: -1 });
    const read = (index: number) => {
      if (run !== runRef.current) return;
      if (index >= chunks.length) { setPlayback("finished"); speechRef.current = null; return; }
      try {
      const chunk = chunks[index];
      const utterance = new SpeechSynthesisUtterance(chunk.text);
      speechRef.current = utterance;
      utterance.lang = language; utterance.rate = 0.88;
      const voice = window.speechSynthesis.getVoices().find((voice) => voice.lang.toLowerCase().startsWith(language.slice(0, 2)));
      if (voice) utterance.voice = voice;
      setPlayback("reading"); setParagraph(chunk.index + 1);
      timerRef.current = setTimeout(() => {
        if (run !== runRef.current) return;
        runRef.current++; window.speechSynthesis.cancel(); setPlayback("error");
      }, 60_000);
      utterance.onend = () => { if (run !== runRef.current) return; if (timerRef.current) clearTimeout(timerRef.current); read(index + 1); };
      utterance.onerror = () => { if (run !== runRef.current) return; if (timerRef.current) clearTimeout(timerRef.current); runRef.current++; setPlayback("error"); };
      window.speechSynthesis.speak(utterance);
      } catch { if (timerRef.current) clearTimeout(timerRef.current); runRef.current++; setPlayback("error"); }
    };
    read(0);
  };
  const messages: Record<Playback, { zh: string; en: string }> = {
    idle: { zh: "尚未播放", en: "Not playing" },
    reading: { zh: paragraph === 0 ? "正在播放通行提示" : `正在播放，第 ${paragraph} / ${paragraphs.length} 段`, en: paragraph === 0 ? "Playing visit guidance" : `Playing paragraph ${paragraph} of ${paragraphs.length}` },
    finished: { zh: "播放完毕", en: "Finished" },
    unavailable: { zh: "浏览器不支持语音播放，请阅读文字讲解或使用屏幕阅读器。", en: "Speech is unavailable. Read the transcript or use your screen reader." },
    error: { zh: "播放失败，请重试或阅读文字讲解。", en: "Playback failed. Retry or read the transcript." },
  };
  return <div className="page-shell detail-page visual-detail">
    <SiteHeader backHref="/" backLabel="西湖十景" backLabelEn="Ten scenes" />
    <main id="main-content" className="visual-detail-main">
      <div className="detail-photo" role="img" aria-label={(locale === "zh" ? guide.imageAltZh : guide.imageAltEn) ?? title} style={{ backgroundImage: `url(${publicAsset(guide.image!)})` }} />
      <article className="description-panel">
        <h1>{title}</h1>
        <p className="visit-note"><T zh="请先在安全位置停下。情景讲解不代表你的当前位置、朝向或实时路况。" en="Stop somewhere safe. The narration is not your live position, orientation or road conditions." />{visitNotes[guide.slug]?.[locale]}</p>
        <div className="audio-controls">
          <button type="button" className="read-button" onClick={playback === "reading" ? stop : play}><span aria-hidden="true">{playback === "reading" ? "■" : "▶"}</span>{playback === "reading" ? <T zh="停止" en="Stop" /> : <T zh="播放介绍" en="Play guide" />}</button>
          <button type="button" className="replay-button" onClick={play}><span aria-hidden="true">↻</span><T zh="重播" en="Replay" /></button>
        </div>
        <p className="playback-status" role="status">{messages[playback][locale]}</p>
        {(playback === "error" || playback === "unavailable") && <div className="playback-recovery">
          {playback === "error" && <button type="button" onClick={play}><T zh="重试播放" en="Retry playback" /></button>}
          <button type="button" onClick={() => { if (transcriptRef.current) { transcriptRef.current.open = true; transcriptRef.current.querySelector("summary")?.focus(); } }}><T zh="打开文字讲解" en="Open transcript" /></button>
        </div>}
        {spot && <button type="button" className="location-start" onClick={() => { stop(); setWalking(true); }}>{spot.walkingDestination ? <T zh="步行去乘船码头" en="Walk to the boat pier" /> : <T zh="步行去这里" en="Walk here" />}</button>}
        <details ref={transcriptRef} className="guide-transcript"><summary><T zh="阅读文字讲解" en="Read the transcript" /></summary><div className="guide-copy" lang={language}>{paragraphs.map((text, index) => <p key={index}>{text}</p>)}</div></details>
        {credit && <details className="image-credit"><summary><T zh="图片来源" en="Photo credit" /></summary><p><a href={credit.source}>{credit.author}</a> · <a href={credit.licenseUrl}>{credit.license}</a></p></details>}
      </article>
    </main>
    {walking && spot && <WalkingGuide spot={spot} onClose={() => setWalking(false)} />}
  </div>;
}
