"use client";

import { useEffect, useRef, useState } from "react";
import {
  distanceInMeters,
  type ScenicSpotZone,
} from "../data/scenic-spots";
import { useI18n } from "../i18n";
import { planGoogleWalkingRoute } from "./google-walking-route";

type LngLatLike = {
  lng?: number;
  lat?: number;
  getLng?: () => number;
  getLat?: () => number;
};

type GeolocationResult = {
  accuracy?: number;
  info?: string;
  message?: string;
  originMessage?: string;
  position?: LngLatLike;
};

type GeolocationService = {
  getCurrentPosition: (
    callback: (status: string, result: GeolocationResult) => void,
  ) => void;
};

type WalkStep = {
  instruction?: string;
  distance?: number;
  end_location?: LngLatLike;
};

type WalkingResult = {
  info?: string;
  message?: string;
  routes?: Array<{
    distance?: number;
    time?: number;
    steps?: WalkStep[];
  }>;
};

type AMapNamespace = {
  Geolocation: new (options: {
    enableHighAccuracy: boolean;
    timeout: number;
  }) => GeolocationService;
  LngLat: new (longitude: number, latitude: number) => LngLatLike;
  Walking: new () => {
    search: (
      origin: LngLatLike,
      destination: LngLatLike,
      callback: (status: string, result: WalkingResult) => void,
    ) => void;
  };
};

declare global {
  interface Window {
    _AMapSecurityConfig?: { securityJsCode: string };
  }
}

const POSITION_INTERVAL_MS = 8_000;
const AMAP_ROUTE_TIMEOUT_MS = 8_000;
const STEP_REACHED_METERS = 25;
const DESTINATION_REACHED_METERS = 35;

function readCoordinate(value?: LngLatLike) {
  if (!value) return null;
  const longitude = value.getLng?.() ?? value.lng;
  const latitude = value.getLat?.() ?? value.lat;

  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return null;
  return [longitude as number, latitude as number] as const;
}

export default function WalkingGuide({ spot }: { spot: ScenicSpotZone }) {
  const { locale } = useI18n();
  const geolocationRef = useRef<GeolocationService | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const routeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stepsRef = useRef<WalkStep[]>([]);
  const stepIndexRef = useRef(0);
  const [state, setState] = useState<
    "idle" | "loading" | "active" | "arrived" | "error"
  >("idle");
  const [instruction, setInstruction] = useState("");
  const [distanceMeters, setDistanceMeters] = useState<number | null>(null);
  const [durationMinutes, setDurationMinutes] = useState<number | null>(null);
  const [routeProvider, setRouteProvider] = useState<"amap" | "google" | null>(
    null,
  );

  const destination = spot.coordinate;

  const speak = (zh: string, en: string) => {
    if (!("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) {
      return;
    }

    window.speechSynthesis.cancel();
    const text = locale === "zh" ? zh : en;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = /[\u3400-\u9fff]/.test(text) ? "zh-CN" : "en-US";
    utterance.rate = 0.9;
    window.speechSynthesis.speak(utterance);
  };

  const clearTracking = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (routeTimeoutRef.current) clearTimeout(routeTimeoutRef.current);
    intervalRef.current = null;
    routeTimeoutRef.current = null;
    geolocationRef.current = null;
  };

  const stop = () => {
    clearTracking();
    window.speechSynthesis?.cancel();
    stepsRef.current = [];
    stepIndexRef.current = 0;
    setState("idle");
    setInstruction("");
    setDistanceMeters(null);
    setDurationMinutes(null);
    setRouteProvider(null);
  };

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (routeTimeoutRef.current) clearTimeout(routeTimeoutRef.current);
      window.speechSynthesis?.cancel();
    };
  }, []);

  const updateProgressFrom = (current: readonly [number, number]) => {
      const destinationDistance = Math.round(
        distanceInMeters(current, destination),
      );
      setDistanceMeters(destinationDistance);

      if (destinationDistance <= DESTINATION_REACHED_METERS) {
        clearTracking();
        setState("arrived");
        const text = locale === "zh" ? `已到达${spot.name}` : `You have arrived at ${spot.nameEn}`;
        setInstruction(text);
        speak(`已到达${spot.name}`, `You have arrived at ${spot.nameEn}`);
        return;
      }

      const currentStep = stepsRef.current[stepIndexRef.current];
      const stepEnd = readCoordinate(currentStep?.end_location);
      if (!stepEnd || distanceInMeters(current, stepEnd) > STEP_REACHED_METERS) {
        return;
      }

      const nextIndex = stepIndexRef.current + 1;
      const nextStep = stepsRef.current[nextIndex];
      if (!nextStep?.instruction) return;

      stepIndexRef.current = nextIndex;
      setInstruction(nextStep.instruction);
      speak(nextStep.instruction, nextStep.instruction);
  };

  const updateProgress = () => {
    if (geolocationRef.current) {
      geolocationRef.current.getCurrentPosition((status, result) => {
        if (status !== "complete") return;
        const current = readCoordinate(result.position);
        if (current) updateProgressFrom(current);
      });
      return;
    }

    navigator.geolocation?.getCurrentPosition((position) => {
      updateProgressFrom([
        position.coords.longitude,
        position.coords.latitude,
      ]);
    });
  };

  const beginRoute = ({
    steps,
    distance,
    duration,
    provider,
  }: {
    steps: WalkStep[];
    distance: number;
    duration: number;
    provider: "amap" | "google";
  }) => {
    stepsRef.current = steps;
    stepIndexRef.current = 0;
    setState("active");
    setRouteProvider(provider);
    setDistanceMeters(distance);
    setDurationMinutes(duration);
    setInstruction(steps[0].instruction ?? "");
    speak(
      `路线已开始。${steps[0].instruction}`,
      `Route started. ${steps[0].instruction}`,
    );
    intervalRef.current = setInterval(updateProgress, POSITION_INTERVAL_MS);
  };

  const tryGoogleRoute = async (
    origin: readonly [number, number],
    amapDetail?: string,
  ) => {
    const googleKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim();
    if (!googleKey) {
      setState("error");
      setInstruction(
        locale === "zh"
          ? `高德路线不可用${amapDetail ? `：${amapDetail}` : ""}，Google 备用服务未配置`
          : `AMap route unavailable${amapDetail ? `: ${amapDetail}` : ""}. Google fallback is not configured`,
      );
      speak("暂时无法规划步行路线", "Walking route unavailable");
      return;
    }

    setInstruction(
      locale === "zh"
        ? "高德路线不可用，正在尝试 Google…"
        : "AMap route unavailable. Trying Google…",
    );

    try {
      const route = await planGoogleWalkingRoute({
        key: googleKey,
        origin,
        destination,
        language: locale === "zh" ? "zh-CN" : "en",
      });
      if (!route) throw new Error("No Google walking route");

      beginRoute({
        steps: route.steps.map((step) => ({
          instruction: step.instruction,
          distance: step.distance,
          end_location: step.endLocation,
        })),
        distance: route.distanceMeters,
        duration: route.durationMinutes,
        provider: "google",
      });
    } catch {
      setState("error");
      setRouteProvider(null);
      setInstruction(
        locale === "zh"
          ? "高德和 Google 暂时都无法规划路线"
          : "AMap and Google routes are currently unavailable",
      );
      speak("暂时无法规划步行路线", "Walking route unavailable");
    }
  };

  const tryGoogleFromBrowserLocation = (amapDetail?: string) => {
    geolocationRef.current = null;
    if (!navigator.geolocation) {
      setState("error");
      setInstruction(
        locale === "zh"
          ? "浏览器不支持定位，无法尝试 Google 路线"
          : "Browser location is unavailable, so Google routing cannot start",
      );
      return;
    }

    setInstruction(
      locale === "zh"
        ? "正在取得位置并尝试 Google…"
        : "Getting your location and trying Google…",
    );
    navigator.geolocation.getCurrentPosition(
      (position) => {
        void tryGoogleRoute(
          [position.coords.longitude, position.coords.latitude],
          amapDetail,
        );
      },
      () => {
        setState("error");
        setInstruction(
          locale === "zh"
            ? "无法取得位置，请检查定位权限"
            : "Location unavailable. Check location permission",
        );
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  };

  const start = async () => {
    const legacyEnvironment = (import.meta as ImportMeta & {
      env?: Record<string, string | undefined>;
    }).env;
    const key = (
      process.env.NEXT_PUBLIC_AMAP_KEY ?? legacyEnvironment?.VITE_AMAP_KEY
    )?.trim();

    clearTracking();
    window.speechSynthesis?.cancel();
    setState("loading");
    setInstruction(locale === "zh" ? "正在规划路线…" : "Planning route…");
    setDistanceMeters(null);
    setDurationMinutes(null);
    setRouteProvider(null);
    speak(
      `正在规划前往${spot.name}的路线`,
      `Planning a route to ${spot.nameEn}`,
    );

    if (!key) {
      tryGoogleFromBrowserLocation("AMap is not configured");
      return;
    }

    try {
      const securityCode = process.env.NEXT_PUBLIC_AMAP_SECURITY_CODE?.trim();
      if (securityCode) {
        window._AMapSecurityConfig = { securityJsCode: securityCode };
      }

      const { load } = await import("@amap/amap-jsapi-loader");
      const AMap = (await load({
        key,
        version: "2.0",
        plugins: ["AMap.Geolocation", "AMap.Walking"],
      })) as AMapNamespace;

      const geolocation = new AMap.Geolocation({
        enableHighAccuracy: true,
        timeout: 10_000,
      });
      geolocationRef.current = geolocation;

      geolocation.getCurrentPosition((locationStatus, locationResult) => {
        const origin = readCoordinate(locationResult.position);
        if (locationStatus !== "complete" || !origin) {
          const detail =
            locationResult.message ??
            locationResult.originMessage ??
            locationResult.info;
          tryGoogleFromBrowserLocation(detail ?? locationStatus);
          return;
        }

        const walking = new AMap.Walking();
        routeTimeoutRef.current = setTimeout(() => {
          routeTimeoutRef.current = null;
          void tryGoogleRoute(origin, "AMap route timeout");
        }, AMAP_ROUTE_TIMEOUT_MS);
        walking.search(
          new AMap.LngLat(origin[0], origin[1]),
          new AMap.LngLat(destination[0], destination[1]),
          (routeStatus, routeResult) => {
            if (!routeTimeoutRef.current) return;
            clearTimeout(routeTimeoutRef.current);
            routeTimeoutRef.current = null;
            const route = routeResult.routes?.[0];
            const steps = route?.steps?.filter((step) => step.instruction) ?? [];
            if (routeStatus !== "complete" || !route || steps.length === 0) {
              void tryGoogleRoute(
                origin,
                routeResult.info ?? routeResult.message ?? routeStatus,
              );
              return;
            }

            beginRoute({
              steps,
              distance: Math.round(route.distance ?? 0),
              duration: Math.max(1, Math.round((route.time ?? 0) / 60)),
              provider: "amap",
            });
          },
        );
      });
    } catch {
      tryGoogleFromBrowserLocation("AMap failed to load");
    }
  };

  const repeat = () => {
    if (!instruction) return;
    speak(instruction, instruction);
  };

  return (
    <>
      <button
        type="button"
        className="scene-go"
        onClick={start}
        disabled={state === "loading"}
      >
        {state === "loading"
          ? locale === "zh"
            ? "规划中…"
            : "Planning…"
          : locale === "zh"
            ? "去这里"
            : "Go"}
      </button>

      {state !== "idle" ? (
        <section className="walking-guide-panel" aria-labelledby="walking-guide-title">
          <div className="walking-guide-copy">
            <h2 id="walking-guide-title">
              {locale === "zh" ? `前往${spot.name}` : `To ${spot.nameEn}`}
            </h2>
            <p role="status" aria-live="polite">
              {instruction}
            </p>
            {distanceMeters !== null ? (
              <p className="walking-guide-meta">
                {locale === "zh" ? `剩余约 ${distanceMeters} 米` : `About ${distanceMeters} m left`}
                {durationMinutes !== null
                  ? locale === "zh"
                    ? ` · 约 ${durationMinutes} 分钟`
                    : ` · About ${durationMinutes} min`
                  : ""}
                {routeProvider === "google" ? " · Google" : ""}
              </p>
            ) : null}
          </div>

          <div className="walking-guide-actions">
            {state === "error" ? (
              <button type="button" onClick={start}>
                {locale === "zh" ? "重试" : "Retry"}
              </button>
            ) : state === "active" || state === "arrived" ? (
              <button type="button" onClick={repeat}>
                {locale === "zh" ? "重复" : "Repeat"}
              </button>
            ) : null}
            <button type="button" className="walking-guide-stop" onClick={stop}>
              {locale === "zh" ? "停止" : "Stop"}
            </button>
          </div>

        </section>
      ) : null}
    </>
  );
}
