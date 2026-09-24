"use client";

import Link from "next/link";
import { useState } from "react";
import LocationGuide from "./LocationGuide";
import SiteHeader from "./SiteHeader";
import WalkingGuide from "./WalkingGuide";
import { scenicSpotZones, type ScenicSpotZone } from "../data/scenic-spots";
import { visualGuides } from "../data/visual-guides";
import { T, useI18n } from "../i18n";
import { publicAsset } from "../site-path";

export default function SceneGrid() {
  const { locale } = useI18n();
  const [destination, setDestination] = useState<ScenicSpotZone | null>(null);
  return (
    <div className="page-shell scene-page visual">
      <SiteHeader />
      <main id="main-content" className="scene-main">
        <p className="eyebrow"><T zh="听见湖山 · 无障碍语音导览" en="Listen to West Lake · Accessible audio guides" /></p>
        <h1><T zh="西湖十景" en="Ten West Lake Scenes" /></h1>
        <p className="scene-intro"><T zh="选一处风景，听一段故事。十景均可播放讲解，也可查看文字。" en="Choose a scene and listen to its story, or read the guide at your own pace." /></p>
        {!destination && <LocationGuide />}
        <ol className="ten-scenes">
          {Object.values(visualGuides).map((guide, index) => {
            const name = locale === "zh" ? guide.titleZh : guide.titleEn;
            const spot = scenicSpotZones.find((item) => item.id === guide.slug);
            return (
              <li key={guide.slug}>
                <article className="scene-card active-scene" style={{ backgroundImage: `url(${publicAsset(guide.image!)})` }}>
                  <span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                  <h2><Link className="scene-title-link" href={`/visual/${guide.slug}/`}>{name}</Link></h2>
                  <div className="scene-actions">
                    <Link className="scene-detail-link" href={`/visual/${guide.slug}/`} aria-label={locale === "zh" ? `听${name}介绍` : `Listen to ${name}`}><T zh="听介绍" en="Listen" /></Link>
                    {spot && <button type="button" className="scene-go" aria-label={locale === "zh" ? `步行前往${name}${spot.walkingDestination ? "的乘船码头" : ""}` : `Walk to ${name}${spot.walkingDestination ? " boat pier" : ""}`} onClick={() => setDestination(spot)}><T zh="去这里" en="Go" /></button>}
                  </div>
                </article>
              </li>
            );
          })}
        </ol>
        <p className="site-note"><T zh="定位仅在你开启后使用。普通步行路线无法判断盲道连续性、临时围挡或所有台阶，请结合手杖、导盲犬、同行协助与现场指引。" en="Location is used only when you enable it. Standard walking routes do not verify tactile paving, temporary barriers or every step. Use your usual mobility aids and on-site guidance." /></p>
      </main>
      {destination && <WalkingGuide key={destination.id} spot={destination} onClose={() => setDestination(null)} />}
    </div>
  );
}
