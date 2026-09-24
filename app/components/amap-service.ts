import { readCoordinate } from "./route-geometry";
import type { Coordinate } from "../data/scenic-spots";

export type LocationFix = { coordinate: Coordinate; accuracy?: number };
export type WalkingStep = { instruction: string; distance: number; path: Coordinate[] };
export type WalkingRoute = { distance: number; seconds: number; steps: WalkingStep[]; path: Coordinate[] };
type Geolocation = { getCurrentPosition: (callback: (status: string, result: { position?: unknown; accuracy?: number }) => void) => void };
type AMapAPI = {
  Geolocation: new (options: Record<string, unknown>) => Geolocation;
  Walking: new () => { search: (origin: Coordinate, destination: Coordinate, callback: (status: string, result: { routes?: Array<{ distance?: number; time?: number; steps?: Array<{ instruction?: string; distance?: number; path?: unknown[] }> }> }) => void) => void };
};
declare global {
  interface Window { _AMapSecurityConfig?: { securityJsCode?: string; serviceHost?: string } }
}

export class MapServiceError extends Error {
  constructor(public readonly code: "config" | "timeout" | "load" | "location" | "route" | "insecure") { super(code); }
}

export function bounded<T>(operation: Promise<T>, milliseconds = 12_000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new MapServiceError("timeout")), milliseconds);
    operation.then((value) => { clearTimeout(timer); resolve(value); }, (error) => { clearTimeout(timer); reject(error); });
  });
}

let apiPromise: Promise<AMapAPI> | null = null;
export async function loadAMap(): Promise<AMapAPI> {
  if (!window.isSecureContext) throw new MapServiceError("insecure");
  if (apiPromise) return apiPromise;
  const legacy = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
  const key = (process.env.NEXT_PUBLIC_AMAP_KEY || legacy?.VITE_AMAP_KEY)?.trim();
  if (!key) throw new MapServiceError("config");
  const serviceHost = process.env.NEXT_PUBLIC_AMAP_SERVICE_HOST?.trim();
  const securityJsCode = process.env.NEXT_PUBLIC_AMAP_SECURITY_CODE?.trim();
  if (serviceHost) window._AMapSecurityConfig = { serviceHost };
  else if (securityJsCode) window._AMapSecurityConfig = { securityJsCode };
  apiPromise = bounded(import("@amap/amap-jsapi-loader").then(({ load }) => load({ key, version: "2.0", plugins: ["AMap.Geolocation", "AMap.Walking"] }))).catch(() => {
    apiPromise = null;
    throw new MapServiceError("load");
  });
  return apiPromise;
}

export async function getLocation(): Promise<LocationFix> {
  const api = await loadAMap();
  // AMap converts GPS to GCJ-02. IP-only positioning is too coarse for walking.
  const service = new api.Geolocation({ enableHighAccuracy: true, timeout: 10_000, maximumAge: 0, convert: true, needAddress: false, GeoLocationFirst: true, noIpLocate: 3 });
  return bounded(new Promise<LocationFix>((resolve, reject) => service.getCurrentPosition((status, result) => {
    const coordinate = readCoordinate(result.position);
    if (status !== "complete" || !coordinate) { reject(new MapServiceError("location")); return; }
    resolve({ coordinate, accuracy: result.accuracy });
  })));
}

export async function planWalkingRoute(origin: Coordinate, destination: Coordinate): Promise<WalkingRoute> {
  const api = await loadAMap();
  return bounded(new Promise<WalkingRoute>((resolve, reject) => {
    new api.Walking().search(origin, destination, (status, result) => {
      const route = result?.routes?.[0];
      if (status !== "complete" || !route || !Number.isFinite(route.distance) || !Number.isFinite(route.time)) { reject(new MapServiceError("route")); return; }
      const steps = (route.steps ?? []).map((step) => ({ instruction: (step.instruction ?? "").replace(/<[^>]*>/g, "").trim(), distance: step.distance ?? 0, path: (step.path ?? []).map(readCoordinate).filter((point): point is Coordinate => point !== null) }));
      const path = steps.flatMap((step) => step.path);
      if (!steps.length || steps.some((step) => !step.instruction || step.path.length < 2) || path.length < 2 || route.distance! < 0 || route.time! < 0) { reject(new MapServiceError("route")); return; }
      resolve({ distance: route.distance!, seconds: route.time!, steps, path });
    });
  }));
}

export function mapErrorMessage(error: unknown, locale: "zh" | "en") {
  const code = error instanceof MapServiceError ? error.code : "load";
  const messages = {
    config: ["高德服务尚未配置。可用下方高德地图链接查看目的地。", "AMap is not configured. Use the map link below."],
    timeout: ["定位或路线请求超时，请检查网络后重试。", "The location or route request timed out. Check your connection and retry."],
    load: ["高德服务未能加载，请检查网络后重试。", "AMap could not load. Check your connection and retry."],
    location: ["无法取得精确位置，请检查浏览器定位权限，并到开阔处重试。", "Location unavailable. Check browser permission and retry in an open area."],
    route: ["高德未返回可用步行路线，请在高德地图中确认通行情况。", "No usable walking route was returned. Check access in AMap."],
    insecure: ["请通过 HTTPS 安全连接打开网站后使用定位。", "Open this website over HTTPS to use location."],
  };
  return messages[code][locale === "zh" ? 0 : 1];
}
