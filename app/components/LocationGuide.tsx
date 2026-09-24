"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { distanceInMeters, scenicSpotZones, type ScenicSpotZone } from "../data/scenic-spots";
import { useI18n } from "../i18n";
import { getLocation, mapErrorMessage } from "./amap-service";
import { confidentlyNear, usableAccuracy } from "./route-geometry";

export default function LocationGuide() {
  const { locale } = useI18n();
  const generation = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState("");
  const [nearby, setNearby] = useState<ScenicSpotZone | null>(null);
  useEffect(() => () => { generation.current++; if (timer.current) clearTimeout(timer.current); }, []);

  const stop = () => {
    generation.current++;
    if (timer.current) clearTimeout(timer.current);
    setRunning(false); setNearby(null);
    setMessage(locale === "zh" ? "定位已停止。" : "Location stopped.");
  };
  const start = () => {
    const run = ++generation.current;
    setRunning(true); setNearby(null);
    setMessage(locale === "zh" ? "正在定位，请允许浏览器访问位置…" : "Locating. Allow your browser to access location…");
    const check = async () => {
      try {
        const fix = await getLocation();
        if (run !== generation.current) return;
        if (usableAccuracy(fix.accuracy)) {
          const nearest = scenicSpotZones.map((spot) => ({ spot, distance: distanceInMeters(fix.coordinate, spot.coordinate) })).sort((a, b) => a.distance - b.distance)[0];
          const isNear = confidentlyNear(fix.coordinate, nearest.spot.coordinate, fix.accuracy, nearest.spot.triggerRadiusMeters);
          setNearby(isNear ? nearest.spot : null);
          setMessage(locale === "zh" ? `最近：${nearest.spot.name}，约 ${Math.round(nearest.distance)} 米` : `Nearest: ${nearest.spot.nameEn}, about ${Math.round(nearest.distance)} m`);
        } else {
          setNearby(null);
          setMessage(locale === "zh" ? "定位失败，请重试" : "Location failed. Try again.");
        }
        timer.current = setTimeout(check, 12_000);
      } catch (error) {
        if (run !== generation.current) return;
        setRunning(false); setNearby(null); setMessage(mapErrorMessage(error, locale));
      }
    };
    void check();
  };
  return <section className="location-guide" aria-label={locale === "zh" ? "附近景点" : "Nearby scenes"}>
    <button type="button" className={running ? "location-stop" : "location-start"} onClick={running ? stop : start}>{running ? (locale === "zh" ? "停止定位" : "Stop location") : (locale === "zh" ? "定位找附近景点" : "Find nearby scenes")}</button>
    {message && <p role="status">{message}</p>}
    {nearby && <Link className="back-link" href={`${nearby.routes.visual}/?autoplay=1`}>{locale === "zh" ? `听${nearby.name}介绍` : `Listen to ${nearby.nameEn}`}</Link>}
  </section>;
}
