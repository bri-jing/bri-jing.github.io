"use client";

import { useEffect, useRef, useState } from "react";
import { distanceInMeters, type Coordinate, type ScenicSpotZone } from "../data/scenic-spots";
import { useI18n } from "../i18n";
import { getLocation, mapErrorMessage, planWalkingRoute, type WalkingRoute } from "./amap-service";
import { confidentlyNear, routeProgress, usableAccuracy } from "./route-geometry";

type State = "idle" | "loading" | "active" | "uncertain" | "off-route" | "arrived" | "error";

export default function WalkingGuide({ spot, onClose }: { spot: ScenicSpotZone; onClose: () => void }) {
  const { locale } = useI18n();
  const destination = spot.walkingDestination ?? spot;
  const dialog = useRef<HTMLDialogElement>(null);
  const generation = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSpoken = useRef("");
  const [state, setState] = useState<State>("idle");
  const [message, setMessage] = useState("");
  const [route, setRoute] = useState<WalkingRoute | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [origin, setOrigin] = useState<Coordinate | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [speechError, setSpeechError] = useState(false);
  const [accuracy, setAccuracy] = useState<number | undefined>();
  const localized = (zh: string, en: string) => locale === "zh" ? zh : en;

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const session = generation;
    dialog.current?.showModal();
    return () => {
      session.current++;
      if (timer.current) clearTimeout(timer.current);
      window.speechSynthesis?.cancel();
      previousFocus?.focus();
    };
  }, []);

  const speak = (text: string) => {
    if (!("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) { setSpeechError(true); return; }
    lastSpoken.current = text;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = /[\u3400-\u9fff]/.test(text) ? "zh-CN" : "en-US";
    utterance.rate = 0.9;
    const run = generation.current;
    utterance.onerror = (event) => { if (run === generation.current && !["canceled", "interrupted"].includes(event.error)) setSpeechError(true); };
    window.speechSynthesis.speak(utterance);
  };

  const announce = (text: string) => { setMessage(text); if (text !== lastSpoken.current) speak(text); };
  const start = async () => {
    const run = ++generation.current;
    if (timer.current) clearTimeout(timer.current);
    window.speechSynthesis?.cancel();
    setState("loading"); setRoute(null); setRemaining(null); setOrigin(null); setCurrentStep(0); setAccuracy(undefined); setSpeechError(false);
    announce(localized("正在定位并规划步行路线…", "Finding your location and planning a walking route…"));
    try {
      const fix = await getLocation();
      if (generation.current !== run) return;
      setAccuracy(fix.accuracy);
      if (!usableAccuracy(fix.accuracy)) {
        setState("error"); announce(localized("定位失败，请重试。", "Location failed. Try again.")); return;
      }
      setOrigin(fix.coordinate);
      const planned = await planWalkingRoute(fix.coordinate, destination.coordinate);
      if (generation.current !== run) return;
      setRoute(planned); setRemaining(planned.distance); setState("active");
      announce(planned.steps[0].instruction);
      let stepIndex = 0;
      let arrivalCount = 0;
      const check = async () => {
        try {
          const next = await getLocation();
          if (generation.current !== run) return;
          setAccuracy(next.accuracy);
          if (!usableAccuracy(next.accuracy)) {
            arrivalCount = 0; setState("uncertain"); setRemaining(null);
            announce(localized("定位暂时不可用，正在重试。", "Location is temporarily unavailable. Retrying."));
          } else {
            const progress = routeProgress(next.coordinate, planned.path);
            if (progress.deviation > Math.max(45, next.accuracy! * 2)) {
              setState("off-route"); setRemaining(null);
              announce(localized("已偏离路线，请重新规划。", "You are off route. Replan.")); return;
            }
            setRemaining(Math.round(progress.remaining / Math.max(1, progress.total) * planned.distance));
            const near = confidentlyNear(next.coordinate, destination.coordinate, next.accuracy, 35) && progress.remaining < 60;
            arrivalCount = near ? arrivalCount + 1 : 0;
            if (arrivalCount >= 2) {
              setState("arrived"); setRemaining(0);
              announce(spot.walkingDestination ? localized("已到花港观鱼码头附近，尚未抵达三潭印月。请向工作人员确认乘船安排。", "You are near Huagang Guanyu pier, not the island. Ask staff about your boat.") : localized(`已到${spot.name}附近，请核对现场入口。`, `You are near ${spot.nameEn}. Confirm the entrance on site.`)); return;
            }
            const step = planned.steps[stepIndex];
            if (stepIndex < planned.steps.length - 1 && distanceInMeters(next.coordinate, step.path.at(-1)!) <= Math.max(30, next.accuracy!)) stepIndex++;
            setCurrentStep(stepIndex); setState("active");
            announce(planned.steps[stepIndex].instruction);
          }
          timer.current = setTimeout(check, 8_000);
        } catch (error) {
          if (generation.current !== run) return;
          setState("error"); setRemaining(null); announce(mapErrorMessage(error, locale));
        }
      };
      timer.current = setTimeout(check, 8_000);
    } catch (error) {
      if (generation.current !== run) return;
      setState("error"); announce(mapErrorMessage(error, locale));
    }
  };

  const parameters = new URLSearchParams({ to: `${destination.coordinate[0]},${destination.coordinate[1]},${destination.name}`, mode: "walk", coordinate: "gaode", src: "bri-jing.com", callnative: "1" });
  if (origin) parameters.set("from", `${origin[0]},${origin[1]},当前位置`);
  return <dialog ref={dialog} className="walking-guide-panel" aria-labelledby={`walking-title-${spot.id}`} onCancel={(event) => { event.preventDefault(); onClose(); }}>
    <div className="walking-guide-copy">
      <h2 id={`walking-title-${spot.id}`}>{localized(`前往${destination.name}`, `To ${destination.nameEn}`)}</h2>
      <p role="status" lang={state === "active" ? "zh-CN" : undefined}>{message || localized("点击“开始导航”", "Select Start navigation")}</p>
      {remaining !== null && <p className="walking-guide-meta">{localized(`沿路线剩余约 ${remaining} 米`, `About ${remaining} m along the route`)}{route && ` · ${localized(`全程预计 ${Math.max(1, Math.ceil(route.seconds / 60))} 分钟`, `Initial estimate: ${Math.max(1, Math.ceil(route.seconds / 60))} min`)}`}</p>}
      {accuracy !== undefined && Number.isFinite(accuracy) && <p className="walking-guide-meta">{localized(`定位精度约 ${Math.round(accuracy)} 米`, `Location accuracy: about ${Math.round(accuracy)} m`)}</p>}
      {speechError && <p role="status">{localized("语音暂不可用，请查看文字步骤或使用屏幕阅读器。", "Audio is unavailable; use the written steps or your screen reader.")}</p>}
      {route && <details><summary>{localized("查看全部步行步骤", "All walking steps (Chinese)")}</summary><ol className="route-steps" lang="zh-CN">{route.steps.map((step, index) => <li key={index} aria-current={index === currentStep && state === "active" ? "step" : undefined}>{step.instruction}</li>)}</ol></details>}
      <a className="map-link" href={`https://uri.amap.com/navigation?${parameters}`} target="_blank" rel="noreferrer">{localized("在高德地图中打开（新窗口）", "Open in AMap (new window)")}</a>
    </div>
    <div className="walking-guide-actions">
      {state !== "loading" && state !== "arrived" && <button type="button" onClick={start}>{state === "idle" ? localized("开始导航", "Start navigation") : localized("重新规划", "Replan")}</button>}
      {message && state !== "loading" && <button type="button" onClick={() => speak(message)}>{localized("重复提示", "Repeat")}</button>}
      <button type="button" className="walking-guide-stop" onClick={onClose}>{localized("停止并关闭", "Stop and close")}</button>
    </div>
  </dialog>;
}
