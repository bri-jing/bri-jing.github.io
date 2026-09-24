import { distanceInMeters, type Coordinate } from "../data/scenic-spots";

export function readCoordinate(value: unknown): Coordinate | null {
  if (!value || typeof value !== "object") return null;
  const point = value as { lng?: number; lat?: number; getLng?: () => number; getLat?: () => number };
  const lng = point.getLng?.() ?? point.lng;
  const lat = point.getLat?.() ?? point.lat;
  if (typeof lng !== "number" || typeof lat !== "number" || !Number.isFinite(lng) || !Number.isFinite(lat) || Math.abs(lng) > 180 || Math.abs(lat) > 90) return null;
  return [lng, lat];
}

export function usableAccuracy(accuracy: number | undefined, maximum = 30) {
  return typeof accuracy === "number" && Number.isFinite(accuracy) && accuracy >= 0 && accuracy <= maximum;
}

// Project onto road segments, not a straight line to the destination.
export function routeProgress(current: Coordinate, path: readonly Coordinate[]) {
  let total = 0;
  let along = 0;
  let deviation = Infinity;
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
    if (distance < deviation) { deviation = distance; along = total + fraction * segment; }
    total += segment;
  }
  return { deviation, remaining: Math.max(0, total - along), total, along };
}

export function confidentlyNear(current: Coordinate, destination: Coordinate, accuracy: number | undefined, radius: number) {
  return usableAccuracy(accuracy) && distanceInMeters(current, destination) + accuracy! <= radius;
}
