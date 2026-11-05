import { readCoordinate } from "./route-geometry";
import { distanceInMeters, type Coordinate } from "../data/scenic-spots";
import { createRetryableLoader, ScriptLoadError } from "./retryable-loader";
import { routeEndpointsMatch } from "./navigation-progress";

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

let callbackSequence = 0;
let scriptLoader: ReturnType<typeof createRetryableLoader<AMapAPI>> | null = null;
export async function loadAMap(): Promise<AMapAPI> {
  if (!window.isSecureContext) throw new MapServiceError("insecure");
  const legacy = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
  const key = (process.env.NEXT_PUBLIC_AMAP_KEY || legacy?.VITE_AMAP_KEY)?.trim();
  if (!key) throw new MapServiceError("config");
  const serviceHost = process.env.NEXT_PUBLIC_AMAP_SERVICE_HOST?.trim();
  const securityJsCode = process.env.NEXT_PUBLIC_AMAP_SECURITY_CODE?.trim();
  if (serviceHost) window._AMapSecurityConfig = { serviceHost };
  else if (securityJsCode) window._AMapSecurityConfig = { securityJsCode };
  // The stock Loader caches failures and shares one callback across attempts.
  // Use a fresh callback per script request so retry and late-response ownership are explicit.
  scriptLoader ??= createRetryableLoader<AMapAPI>((complete, fail) => {
    const callback = `__brijingAMapReady_${++callbackSequence}`;
    const globals = window as unknown as Record<string, unknown>;
    const script = document.createElement("script");
    script.async = true;
    globals[callback] = (error?: unknown) => {
      const api = globals.AMap as AMapAPI | undefined;
      if (error || !api?.Geolocation || !api?.Walking) fail();
      else complete(api);
    };
    script.onerror = fail;
    script.src = `https://webapi.amap.com/maps?${new URLSearchParams({ key, v: "2.0", plugin: "AMap.Geolocation,AMap.Walking", callback })}`;
    document.head.appendChild(script);
    return () => {
      // A removed script may already be executing. Leave a harmless callback tombstone.
      globals[callback] = () => undefined;
      script.onerror = null;
      script.remove();
    };
  });
  try { return await scriptLoader(); }
  catch (error) { throw new MapServiceError(error instanceof ScriptLoadError ? error.code : "load"); }
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

export function parseWalkingRoute(result: unknown, origin: Coordinate, destination: Coordinate): WalkingRoute | null {
  try {
    if (!result || typeof result !== "object") return null;
    const routes = (result as { routes?: unknown }).routes;
    if (!Array.isArray(routes) || !routes[0] || typeof routes[0] !== "object") return null;
    const route = routes[0] as { distance?: number; time?: number; steps?: unknown };
    if (!Number.isFinite(route.distance) || route.distance! < 0 || !Number.isFinite(route.time) || route.time! < 0 || !Array.isArray(route.steps) || !route.steps.length) return null;
    const steps: WalkingStep[] = [];
    for (const raw of route.steps) {
      if (!raw || typeof raw !== "object") return null;
      const step = raw as { instruction?: unknown; distance?: number; path?: unknown };
      if (typeof step.instruction !== "string" || !Array.isArray(step.path) || step.path.length < 2 || !Number.isFinite(step.distance) || step.distance! < 0) return null;
      const instruction = step.instruction.replace(/<[^>]*>/g, "").trim();
      const coordinates = step.path.map(readCoordinate);
      if (!instruction || coordinates.some((point) => point === null)) return null;
      steps.push({ instruction, distance: step.distance!, path: coordinates as Coordinate[] });
    }
    const path = steps.flatMap((step) => step.path);
    const planned = { distance: route.distance!, seconds: route.time!, steps, path };
    if (!routeEndpointsMatch(planned, origin, destination)
      || !path.some((point, index) => index > 0 && distanceInMeters(path[index - 1], point) > 0.01)
      || steps.some((step, index) => index > 0 && distanceInMeters(steps[index - 1].path.at(-1)!, step.path[0]) > 30)) return null;
    return planned;
  } catch { return null; }
}

export async function planWalkingRoute(origin: Coordinate, destination: Coordinate): Promise<WalkingRoute> {
  const api = await loadAMap();
  return bounded(new Promise<WalkingRoute>((resolve, reject) => {
    new api.Walking().search(origin, destination, (status, result) => {
      const planned = status === "complete" ? parseWalkingRoute(result, origin, destination) : null;
      if (!planned) { reject(new MapServiceError("route")); return; }
      resolve(planned);
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
