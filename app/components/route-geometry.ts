import { distanceInMeters, type Coordinate } from "../data/scenic-spots";

export function readCoordinate(value: unknown): Coordinate | null {
  if (!value || typeof value !== "object") return null;
  const point = value as { lng?: number; lat?: number; getLng?: () => number; getLat?: () => number };
  const lng = point.getLng?.() ?? point.lng;
  const lat = point.getLat?.() ?? point.lat;
  if (typeof lng !== "number" || typeof lat !== "number" || !Number.isFinite(lng) || !Number.isFinite(lat) || Math.abs(lng) > 180 || Math.abs(lat) > 90) return null;
  return [lng, lat];
}

export const MAX_NAVIGATION_ACCURACY = 50;

export function usableAccuracy(accuracy: number | undefined, maximum = MAX_NAVIGATION_ACCURACY) {
  return typeof accuracy === "number" && Number.isFinite(accuracy) && accuracy >= 0 && accuracy <= maximum;
}

// Project onto road segments, not a straight line to the destination.
export function routeProjections(current: Coordinate, path: readonly Coordinate[]) {
  let total = 0;
  const candidates: Array<{ along: number; deviation: number }> = [];
  for (let index = 1; index < path.length; index++) {
    const a = path[index - 1];
    const b = path[index];
    const scale = Math.cos(current[1] * Math.PI / 180);
    const dx = (b[0] - a[0]) * scale;
    const dy = b[1] - a[1];
    const square = dx * dx + dy * dy;
    const fraction = square ? Math.max(0, Math.min(1, (((current[0] - a[0]) * scale) * dx + (current[1] - a[1]) * dy) / square)) : 0;
    const projected: Coordinate = [a[0] + (b[0] - a[0]) * fraction, a[1] + (b[1] - a[1]) * fraction];
    const segment = distanceInMeters(a, b);
    const distance = distanceInMeters(current, projected);
    if (segment > 0.01) candidates.push({ deviation: distance, along: total + fraction * segment });
    total += segment;
  }
  return { candidates, total };
}

export function routeProgress(current: Coordinate, path: readonly Coordinate[]) {
  const { candidates, total } = routeProjections(current, path);
  const nearest = candidates.reduce((best, candidate) => candidate.deviation < best.deviation ? candidate : best, { along: 0, deviation: Infinity });
  const { along, deviation } = nearest;
  return { deviation, remaining: Math.max(0, total - along), total, along };
}

export function confidentlyNear(current: Coordinate, destination: Coordinate, accuracy: number | undefined, radius: number) {
  return usableAccuracy(accuracy, 30) && distanceInMeters(current, destination) + accuracy! <= radius;
}
