"use client";

import Link from "next/link";
import LocationGuide from "./LocationGuide";
import SiteHeader from "./SiteHeader";
import WalkingGuide from "./WalkingGuide";
import { scenicSpotZones } from "../data/scenic-spots";
import { T, useI18n } from "../i18n";
import { publicAsset } from "../site-path";

const scenes = [
  { zh: "曲院风荷", en: "Breeze-ruffled Lotus at Quyuan Garden", visualSlug: "quyuan-fenghe", hearingSlug: "quyuan-fenghe", image: "quyuan-lake.jpg" },
  { zh: "苏堤春晓", en: "Spring Dawn at Su Causeway", visualSlug: "sudi-chunxiao", image: "sudi-chunxiao.jpg" },
  { zh: "平湖秋月", en: "Autumn Moon over the Calm Lake", visualSlug: "pinghu-qiuyue", image: "pinghu-qiuyue.jpg" },
  { zh: "断桥残雪", en: "Lingering Snow on Broken Bridge", visualSlug: "duanqiao-canxue", image: "duanqiao-canxue.jpg" },
  { zh: "柳浪闻莺", en: "Orioles Singing in the Willows" },
  { zh: "花港观鱼", en: "Viewing Fish at Flower Harbor" },
  { zh: "双峰插云", en: "Twin Peaks Piercing the Clouds" },
  { zh: "三潭印月", en: "Three Pools Mirroring the Moon" },
  { zh: "雷峰夕照", en: "Leifeng Pagoda in Evening Glow" },
  { zh: "南屏晚钟", en: "Evening Bell at Nanping Hill" },
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
          {scenes.map((sceneData, index) => {
            const scene = locale === "zh" ? sceneData.zh : sceneData.en;
            const number = String(index + 1).padStart(2, "0");
            const slug = mode === "visual"
              ? sceneData.visualSlug
              : sceneData.hearingSlug;

            if (slug) {
              return (
                <li key={scene}>
                  <article
                    className="scene-card active-scene"
                    style={sceneData.image ? { backgroundImage: `url(${publicAsset(sceneData.image)})` } : undefined}
                  >
                    <span>{number}</span>
                    <Link className="scene-title-link" href={`/${mode}/${slug}`}>
                      <strong>{scene}</strong>
                    </Link>
                    <div className="scene-actions">
                      <Link className="scene-detail-link" href={`/${mode}/${slug}`}>
                        {locale === "zh" ? "介绍" : "Guide"}
                      </Link>
                      {slug === "quyuan-fenghe" && (
                        <WalkingGuide spot={scenicSpotZones[0]} />
                      )}
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
