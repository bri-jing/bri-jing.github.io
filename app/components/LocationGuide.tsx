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
        if (!usableAccuracy(fix.accuracy, 50)) {
          setNearby(null);
          setMessage(locale === "zh" ? "定位精度不足，正在继续确认；请到开阔处，暂不判断到达。" : "Location accuracy is low. Move to an open area; arrival is not confirmed.");
        } else {
          const nearest = scenicSpotZones.map((spot) => ({ spot, distance: distanceInMeters(fix.coordinate, spot.coordinate) })).sort((a, b) => a.distance - b.distance)[0];
          const isNear = confidentlyNear(fix.coordinate, nearest.spot.coordinate, fix.accuracy, nearest.spot.triggerRadiusMeters);
          setNearby(isNear ? nearest.spot : null);
          setMessage(locale === "zh" ? `最近景点：${nearest.spot.name}，直线约 ${Math.round(nearest.distance)} 米。定位精度约 ${Math.round(fix.accuracy!)} 米。${isNear ? "已在附近，可打开讲解。" : ""}` : `Nearest scene: ${nearest.spot.nameEn}, about ${Math.round(nearest.distance)} m in a straight line. Accuracy: ${Math.round(fix.accuracy!)} m.${isNear ? " You are nearby; open the guide when ready." : ""}`);
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
    <button type="button" className={running ? "location-stop" : "location-start"} onClick={running ? stop : start}>{running ? (locale === "zh" ? "停止定位" : "Stop location") : (locale === "zh" ? "开启定位 · 找附近景点" : "Find nearby scenes")}</button>
    <p role="status">{message || (locale === "zh" ? "定位后提示附近景点，由你决定何时打开讲解。" : "Find nearby scenes and choose when to open a guide.")}</p>
    {nearby && <Link className="back-link" href={`${nearby.routes.visual}/?autoplay=1`}>{locale === "zh" ? `听${nearby.name}介绍` : `Listen to ${nearby.nameEn}`}</Link>}
  </section>;
}
