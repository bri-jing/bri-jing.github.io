"use client";

import { useEffect, useRef, useState } from "react";
import { distanceInMeters, type ScenicSpotZone } from "../data/scenic-spots";
import { visitNotes } from "../data/visit-notes";
import { useI18n } from "../i18n";
import { getLocation, mapErrorMessage, planWalkingRoute, type WalkingRoute } from "./amap-service";
import { confidentlyNear, MAX_NAVIGATION_ACCURACY, usableAccuracy } from "./route-geometry";
import { NavigationProgress, officialWalkingLink } from "./navigation-progress";

type State = "idle" | "loading" | "active" | "uncertain" | "off-route" | "arrived" | "error";

export default function WalkingGuide({ spot, onClose }: { spot: ScenicSpotZone; onClose: () => void }) {
  const { locale } = useI18n();
  const destination = spot.walkingDestination ?? spot;
  const dialog = useRef<HTMLDialogElement>(null);
  const generation = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const speechTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const speechGeneration = useRef(0);
  const lastSpoken = useRef("");
  const [state, setState] = useState<State>("idle");
  const [message, setMessage] = useState("");
  const [route, setRoute] = useState<WalkingRoute | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [speechError, setSpeechError] = useState(false);
  const [accuracy, setAccuracy] = useState<number | undefined>();
  const localized = (zh: string, en: string) => locale === "zh" ? zh : en;

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const session = generation;
    const speechSession = speechGeneration;
    const modal = dialog.current;
    modal?.showModal();
    modal?.querySelector<HTMLButtonElement>(".walking-guide-actions button")?.focus();
    const pauseForBackground = () => {
      if (!document.hidden) return;
      session.current++;
      speechSession.current++;
      if (timer.current) clearTimeout(timer.current);
      if (speechTimer.current) clearTimeout(speechTimer.current);
      window.speechSynthesis?.cancel();
      setState("uncertain"); setRemaining(null);
      setMessage(locale === "zh" ? "页面已进入后台，方向指引已暂停。返回前台后请重新规划。" : "Directions paused in the background. Replan when you return.");
    };
    document.addEventListener("visibilitychange", pauseForBackground);
    return () => {
      session.current++;
      speechSession.current++;
      if (timer.current) clearTimeout(timer.current);
      if (speechTimer.current) clearTimeout(speechTimer.current);
      document.removeEventListener("visibilitychange", pauseForBackground);
      window.speechSynthesis?.cancel();
      modal?.close();
      previousFocus?.focus();
    };
  }, [locale]);

  const speak = (text: string) => {
    const speechRun = ++speechGeneration.current;
    if (speechTimer.current) clearTimeout(speechTimer.current);
    if (!("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) { setSpeechError(true); return; }
    lastSpoken.current = text;
    window.speechSynthesis.cancel();
    try {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = /[\u3400-\u9fff]/.test(text) ? "zh-CN" : "en-US";
      utterance.rate = 0.9;
      utterance.onend = () => { if (speechRun === speechGeneration.current && speechTimer.current) clearTimeout(speechTimer.current); };
      utterance.onerror = (event) => {
        if (speechRun !== speechGeneration.current) return;
        if (speechTimer.current) clearTimeout(speechTimer.current);
        if (!["canceled", "interrupted"].includes(event.error)) setSpeechError(true);
      };
      speechTimer.current = setTimeout(() => {
        if (speechRun !== speechGeneration.current) return;
        speechGeneration.current++; window.speechSynthesis.cancel(); setSpeechError(true);
      }, 60_000);
      setSpeechError(false);
      window.speechSynthesis.speak(utterance);
    } catch { if (speechTimer.current) clearTimeout(speechTimer.current); setSpeechError(true); }
  };

  const announce = (text: string) => { setMessage(text); if (text !== lastSpoken.current) speak(text); };
  const start = async () => {
    if (document.hidden) return;
    const run = ++generation.current;
    if (timer.current) clearTimeout(timer.current);
    lastSpoken.current = "";
    setState("loading"); setRoute(null); setRemaining(null); setCurrentStep(0); setAccuracy(undefined); setSpeechError(false);
    announce(localized("请先在安全位置停下。正在定位并规划普通步行路线…", "Stop somewhere safe. Finding your position and planning a standard walking route…"));
    try {
      let fix = await getLocation();
      if (generation.current !== run) return;
      setAccuracy(fix.accuracy);
      for (let retry = 0; retry < 2 && !usableAccuracy(fix.accuracy); retry++) {
        announce(localized("正在尝试获取更精确的位置，请稍候。", "Trying to get a more accurate location. Please wait."));
        await new Promise<void>((resolve) => setTimeout(resolve, 1_500));
        if (generation.current !== run) return;
        fix = await getLocation();
        if (generation.current !== run) return;
        setAccuracy(fix.accuracy);
      }
      if (!usableAccuracy(fix.accuracy)) {
        setState("error");
        announce(localized(`定位精度不足，需要误差不超过 ${MAX_NAVIGATION_ACCURACY} 米。请在手机设置中允许浏览器使用精确位置，到开阔处重新规划，或点下方链接用高德地图导航。`, `Directions require a location accurate to within ${MAX_NAVIGATION_ACCURACY} m. Allow precise location for your browser and replan outdoors, or open AMap below.`));
        return;
      }
      const planned = await planWalkingRoute(fix.coordinate, destination.coordinate);
      if (generation.current !== run) return;
      setRoute(planned);
      const tracker = new NavigationProgress(planned, fix);
      let arrivalCount = 0;
      const applyFix = (next: typeof fix) => {
        const progress = tracker.update(next);
        if (progress.kind !== "active") {
          arrivalCount = 0; setRemaining(null);
          setState(progress.kind === "replan" ? "off-route" : "uncertain");
          const text = progress.reason === "accuracy"
            ? localized("定位精度不足，方向指引已暂停。请在安全处停下，正在重新确认位置。", "Accuracy dropped. Directions paused; stop somewhere safe while position is checked.")
            : progress.reason === "reverse"
              ? localized("检测到可能折返，方向指引已暂停。请在安全处停下并重新规划。", "You may be going back. Directions paused; stop somewhere safe and replan.")
              : progress.reason === "off-route"
                ? localized("已偏离路线，方向指引已暂停。请在安全处停下并重新规划。", "You are off route. Directions paused; stop somewhere safe and replan.")
                : progress.reason === "stale"
                  ? localized("定位中断过久，方向指引已暂停。请重新规划。", "Position was lost for too long. Directions paused; replan.")
                  : localized("位置变化或路线匹配尚未确认，方向指引已暂停。请在安全处停下，正在重新确认位置。", "Position or route match is uncertain. Directions paused; stop safely while it is checked.");
          announce(text);
          return progress.kind !== "replan";
        }
        const total = planned.path.reduce((sum, point, index) => index ? sum + distanceInMeters(planned.path[index - 1], point) : 0, 0);
        setRemaining(Math.round(progress.remaining / Math.max(1, total) * planned.distance));
        const near = confidentlyNear(next.coordinate, destination.coordinate, next.accuracy, 35) && progress.remaining < 60;
        arrivalCount = near ? arrivalCount + 1 : 0;
        if (arrivalCount >= 2) {
          setState("arrived"); setRemaining(0);
          announce(spot.walkingDestination ? localized("已到花港观鱼码头附近，尚未抵达三潭印月。请向工作人员确认乘船安排。", "You are near Huagang Guanyu pier, not the island. Ask staff about your boat.") : localized(`已到${spot.name}附近，请核对现场入口。`, `You are near ${spot.nameEn}. Confirm the entrance on site.`)); return false;
        }
        setCurrentStep(progress.stepIndex); setState("active");
        announce(planned.steps[progress.stepIndex].instruction);
        return true;
      };
      const check = async () => {
        try {
          const next = await getLocation();
          if (generation.current !== run) return;
          setAccuracy(next.accuracy);
          if (applyFix(next)) timer.current = setTimeout(check, 8_000);
        } catch (error) {
          if (generation.current !== run) return;
          setState("error"); setRemaining(null); announce(mapErrorMessage(error, locale));
        }
      };
      if (applyFix(fix)) timer.current = setTimeout(check, 8_000);
    } catch (error) {
      if (generation.current !== run) return;
      setState("error"); setRemaining(null); announce(mapErrorMessage(error, locale));
    }
  };

  return <dialog ref={dialog} className="walking-guide-panel" aria-labelledby={`walking-title-${spot.id}`} onCancel={(event) => { event.preventDefault(); onClose(); }}>
    <div className="walking-guide-copy">
      <h2 id={`walking-title-${spot.id}`}>{localized(`前往${destination.name}`, `To ${destination.nameEn}`)}</h2>
      <p className="walking-note">{localized("普通步行路线，未核验盲道、台阶和临时障碍。请结合日常出行辅助与现场指引，保持页面在前台。", "Standard walking data does not verify tactile paving, steps or temporary obstacles. Use your usual mobility support and on-site guidance; keep this page in the foreground.")}</p>
      <p className="walking-note">{visitNotes[spot.id]?.[locale]}</p>
      <p role="status" lang={state === "active" ? "zh-CN" : undefined}>{message || localized("点击“开始导航”后请求定位；请先在安全处停下。", "Select Start navigation to request location; first stop somewhere safe.")}</p>
      {remaining !== null && <p className="walking-guide-meta">{localized(`沿路线剩余约 ${remaining} 米`, `About ${remaining} m along the route`)}{route && ` · ${localized(`全程预计 ${Math.max(1, Math.ceil(route.seconds / 60))} 分钟`, `Initial estimate: ${Math.max(1, Math.ceil(route.seconds / 60))} min`)}`}</p>}
      {accuracy !== undefined && Number.isFinite(accuracy) && <p className="walking-guide-meta">{localized(`定位精度约 ${Math.round(accuracy)} 米`, `Location accuracy: about ${Math.round(accuracy)} m`)}</p>}
      {speechError && <p role="status">{localized("语音暂不可用，请查看文字步骤或使用屏幕阅读器，也可点击重复提示重试。", "Audio is unavailable; use written steps or your screen reader, or Repeat to retry.")}</p>}
      {route && <details><summary>{localized("查看全部步行步骤", "All walking steps (Chinese)")}</summary><ol className="route-steps" lang="zh-CN">{route.steps.map((step, index) => <li key={index} aria-current={index === currentStep && state === "active" ? "step" : undefined}>{step.instruction}</li>)}</ol></details>}
      <a className="map-link" href={officialWalkingLink(destination)} target="_blank" rel="noreferrer">{localized("在高德地图中打开（新窗口）", "Open in AMap (new window)")}</a>
      <p className="walking-note">{localized("高德地图将使用当前位置；电脑端请在地图中补充起点。", "AMap will use your current position; on desktop, enter a starting point in the map.")}</p>
    </div>
    <div className="walking-guide-actions">
      {state !== "loading" && state !== "arrived" && <button type="button" onClick={start}>{state === "idle" ? localized("开始导航", "Start navigation") : localized("重新规划", "Replan")}</button>}
      {message && state !== "loading" && <button type="button" onClick={() => speak(message)}>{localized("重复提示", "Repeat")}</button>}
      <button type="button" className="walking-guide-stop" onClick={onClose}>{localized("停止并关闭", "Stop and close")}</button>
    </div>
  </dialog>;
}
