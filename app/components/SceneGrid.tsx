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
        <h1><T zh="西湖十景" en="Ten West Lake Scenes" /></h1>
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
      </main>
      {destination && <WalkingGuide key={destination.id} spot={destination} onClose={() => setDestination(null)} />}
    </div>
  );
}
