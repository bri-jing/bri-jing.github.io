"use client";

import Link from "next/link";
import LocationGuide from "./LocationGuide";
import SiteHeader from "./SiteHeader";
import WalkingGuide from "./WalkingGuide";
import { scenicSpotZones } from "../data/scenic-spots";
import { T, useI18n } from "../i18n";
import { publicAsset } from "../site-path";

const scenes = [
  ["曲院风荷", "Breeze-ruffled Lotus at Quyuan Garden"],
  ["苏堤春晓", "Spring Dawn at Su Causeway"],
  ["平湖秋月", "Autumn Moon over the Calm Lake"],
  ["断桥残雪", "Lingering Snow on Broken Bridge"],
  ["柳浪闻莺", "Orioles Singing in the Willows"],
  ["花港观鱼", "Viewing Fish at Flower Harbor"],
  ["双峰插云", "Twin Peaks Piercing the Clouds"],
  ["三潭印月", "Three Pools Mirroring the Moon"],
  ["雷峰夕照", "Leifeng Pagoda in Evening Glow"],
  ["南屏晚钟", "Evening Bell at Nanping Hill"],
];

type SceneGridProps = {
  mode: "visual" | "hearing";
};

export default function SceneGrid({ mode }: SceneGridProps) {
  const { locale } = useI18n();
  const modeName = mode === "visual"
    ? locale === "zh" ? "视障导览" : "Audio guide"
    : locale === "zh" ? "听障导览" : "Visual guide";

  return (
    <div className={`page-shell scene-page ${mode}`}>
      <SiteHeader backHref="/" backLabel="重新选择" backLabelEn="Choose again" />
      <main className="scene-main">
        <h1>{modeName} · <T zh="西湖十景" en="Ten West Lake Scenes" /></h1>
        <LocationGuide mode={mode} />
        <ol className="ten-scenes">
          {scenes.map(([sceneZh, sceneEn], index) => {
            const scene = locale === "zh" ? sceneZh : sceneEn;
            const number = String(index + 1).padStart(2, "0");
            if (index === 0) {
              return (
                <li key={scene}>
                  <article
                    className="scene-card active-scene"
                    style={{ backgroundImage: `url(${publicAsset("quyuan-lake.jpg")})` }}
                  >
                    <span>{number}</span>
                    <Link className="scene-title-link" href={`/${mode}/quyuan-fenghe`}>
                      <strong>{scene}</strong>
                    </Link>
                    <div className="scene-actions">
                      <Link className="scene-detail-link" href={`/${mode}/quyuan-fenghe`}>
                        {locale === "zh" ? "介绍" : "Guide"}
                      </Link>
                      <WalkingGuide spot={scenicSpotZones[0]} />
                    </div>
                  </article>
                </li>
              );
            }

            return (
              <li key={scene}>
                <div className="scene-card reserved-scene" aria-label={`${scene}, ${locale === "zh" ? "尚未开放" : "coming soon"}`}>
                  <span>{number}</span>
                  <strong>{scene}</strong>
                </div>
              </li>
            );
          })}
        </ol>
      </main>
    </div>
  );
}
