"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  distanceInMeters,
  scenicSpotZones,
  type GuideMode,
} from "../data/scenic-spots";
import { useI18n } from "../i18n";

type AMapPosition = {
  lng?: number;
  lat?: number;
  getLng?: () => number;
  getLat?: () => number;
};

type AMapGeolocationResult = {
  accuracy?: number;
  message?: string;
  position?: AMapPosition;
};

type AMapGeolocation = {
  getCurrentPosition: (
    callback: (status: string, result: AMapGeolocationResult) => void,
  ) => void;
};

type AMapNamespace = {
  Geolocation: new (options: {
    enableHighAccuracy: boolean;
    timeout: number;
  }) => AMapGeolocation;
};

declare global {
  interface Window {
    _AMapSecurityConfig?: { securityJsCode: string };
  }
}

const LOCATION_INTERVAL_MS = 12_000;
const MAX_ACCEPTED_ACCURACY_METERS = 100;
const GUIDE_OPEN_DELAY_MS = 3_000;

function readCoordinate(position?: AMapPosition) {
  if (!position) return null;
  const longitude = position.getLng?.() ?? position.lng;
  const latitude = position.getLat?.() ?? position.lat;

  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return null;
  return [longitude as number, latitude as number] as const;
}

export default function LocationGuide({ mode }: { mode: GuideMode }) {
  const { locale } = useI18n();
  const router = useRouter();
  const geolocationRef = useRef<AMapGeolocation | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const navigationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const triggeredRef = useRef(false);
  const [state, setState] = useState<"idle" | "loading" | "running" | "error">(
    "idle",
  );
  const [distanceMeters, setDistanceMeters] = useState<number | null>(null);
  const [message, setMessage] = useState({ zh: "点击后允许定位，到达景点时自动打开介绍。", en: "Allow location to open a guide when you arrive." });

  const clearTracking = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (navigationTimeoutRef.current) {
      clearTimeout(navigationTimeoutRef.current);
    }
    intervalRef.current = null;
    navigationTimeoutRef.current = null;
    geolocationRef.current = null;
  };

  const stop = () => {
    clearTracking();
    triggeredRef.current = false;
    setState("idle");
    setDistanceMeters(null);
    setMessage({ zh: "定位导览已停止。", en: "Location guide stopped." });
  };

  const fail = (zh: string, en: string) => {
    clearTracking();
    setState("error");
    setDistanceMeters(null);
    setMessage({ zh, en });
  };

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (navigationTimeoutRef.current) {
        clearTimeout(navigationTimeoutRef.current);
      }
    };
  }, []);

  const checkPosition = () => {
    geolocationRef.current?.getCurrentPosition((status, result) => {
      if (status !== "complete") {
        fail("无法取得位置，请检查定位权限后重试。", "Location unavailable. Check permission and try again.");
        return;
      }

      const coordinate = readCoordinate(result.position);
      if (!coordinate) {
        fail("定位结果无效，请稍后重试。", "The location result is invalid. Please try again.");
        return;
      }

      const accuracy = result.accuracy ?? Number.POSITIVE_INFINITY;
      if (accuracy > MAX_ACCEPTED_ACCURACY_METERS) {
        setState("running");
        setMessage({ zh: "定位信号较弱，正在继续确认位置。", en: "Location signal is weak. Checking again." });
        return;
      }

      const nearest = scenicSpotZones
        .filter((spot) => Boolean(spot.routes[mode]))
        .map((spot) => ({ spot, distance: distanceInMeters(coordinate, spot.coordinate) }))
        .sort((first, second) => first.distance - second.distance)[0];

      if (!nearest) return;
      const route = nearest.spot.routes[mode];
      if (!route) return;
      const roundedDistance = Math.round(nearest.distance);
      setDistanceMeters(roundedDistance);
      if (nearest.distance <= nearest.spot.triggerRadiusMeters && !triggeredRef.current) {
        triggeredRef.current = true;
        setMessage({ zh: `已到达${nearest.spot.name}，3秒后打开导览。`, en: `You have reached ${nearest.spot.nameEn}. Opening the guide in 3 seconds.` });
        navigationTimeoutRef.current = setTimeout(() => {
          navigationTimeoutRef.current = null;
          router.push(`${route}?autoplay=1`);
        }, GUIDE_OPEN_DELAY_MS);
        return;
      }

      setState("running");
      setMessage({ zh: `定位已开启，距${nearest.spot.name}约${roundedDistance}米。`, en: `Location is on. ${nearest.spot.nameEn} is about ${roundedDistance} metres away.` });
    });
  };

  const start = async () => {
    const legacyEnvironment = (import.meta as ImportMeta & {
      env?: Record<string, string | undefined>;
    }).env;
    const key = (
      process.env.NEXT_PUBLIC_AMAP_KEY ?? legacyEnvironment?.VITE_AMAP_KEY
    )?.trim();
    if (!key) {
      setState("error");
      setMessage({ zh: "尚未配置高德定位服务，请联系网站维护人员。", en: "The location service is not configured." });
      return;
    }

    setState("loading");
    setDistanceMeters(null);
    setMessage({ zh: "正在请求定位权限…", en: "Requesting location permission…" });

    try {
      const securityCode = process.env.NEXT_PUBLIC_AMAP_SECURITY_CODE?.trim();
      if (securityCode) window._AMapSecurityConfig = { securityJsCode: securityCode };

      const { load } = await import("@amap/amap-jsapi-loader");
      const AMap = (await load({
        key,
        version: "2.0",
        plugins: ["AMap.Geolocation"],
      })) as AMapNamespace;

      geolocationRef.current = new AMap.Geolocation({
        enableHighAccuracy: true,
        timeout: 10_000,
      });
      setState("running");
      checkPosition();
      intervalRef.current = setInterval(checkPosition, LOCATION_INTERVAL_MS);
    } catch {
      fail("高德定位服务加载失败，请检查网络后重试。", "The AMap location service failed to load. Check your connection.");
    }
  };

  const running = state === "running";

  const buttonLabel = running
    ? locale === "zh"
      ? `停止定位${distanceMeters === null ? "" : ` · ${distanceMeters} 米`}`
      : `Stop location${distanceMeters === null ? "" : ` · ${distanceMeters} m`}`
    : state === "loading"
      ? locale === "zh"
        ? "正在定位…"
        : "Locating…"
      : state === "error"
        ? locale === "zh"
          ? "重试定位"
          : "Try location again"
        : locale === "zh"
          ? "开启定位"
          : "Start location guide";

  return (
    <div className="location-guide">
      <span className="sr-only" role="status" aria-live="polite">
        {message[locale]}
      </span>
      <button
        type="button"
        className={running ? "location-stop" : "location-start"}
        onClick={running ? stop : start}
        disabled={state === "loading"}
      >
        {buttonLabel}
      </button>
    </div>
  );
}
