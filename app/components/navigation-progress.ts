import { distanceInMeters, type Coordinate } from "../data/scenic-spots";
import { routeProjections, usableAccuracy } from "./route-geometry";
import type { LocationFix, WalkingRoute } from "./amap-service";

export type ProgressResult =
  | { kind: "active"; along: number; remaining: number; stepIndex: number }
  | { kind: "paused"; reason: "accuracy" | "confirming" | "ambiguous" }
  | { kind: "replan"; reason: "off-route" | "reverse" | "stale" };

// These are conservative software gates, not a guarantee of an accessible road.
export const MAX_TRACKING_GAP_MS = 45_000;
export const MAX_ROUTE_ENDPOINT_OFFSET = 100;

export function routeEndpointsMatch(route: WalkingRoute, origin: Coordinate, destination: Coordinate) {
  return route.path.length >= 2
    && distanceInMeters(route.path[0], origin) <= MAX_ROUTE_ENDPOINT_OFFSET
    && distanceInMeters(route.path.at(-1)!, destination) <= MAX_ROUTE_ENDPOINT_OFFSET;
}

export function officialWalkingLink(destination: { coordinate: Coordinate; name: string }) {
  // Always let AMap obtain a fresh starting point. Never reuse the original fix.
  const parameters = new URLSearchParams({ to: `${destination.coordinate[0]},${destination.coordinate[1]},${destination.name}`, mode: "walk", coordinate: "gaode", src: "bri-jing.com", callnative: "1" });
  return `https://uri.amap.com/navigation?${parameters}`;
}

export class NavigationProgress {
  private along = 0;
  private previous: LocationFix;
  private confirmedAt: number;
  private needsConfirmation = false;
  private pending: { along: number; accuracy: number } | null = null;
  private readonly boundaries: number[];

  constructor(private readonly route: WalkingRoute, origin: LocationFix, now = Date.now()) {
    this.previous = origin;
    this.confirmedAt = now;
    let length = 0;
    let previousEnd: Coordinate | undefined;
    this.boundaries = route.steps.map((step) => {
      if (previousEnd) length += distanceInMeters(previousEnd, step.path[0]);
      for (let i = 1; i < step.path.length; i++) length += distanceInMeters(step.path[i - 1], step.path[i]);
      previousEnd = step.path.at(-1);
      return length;
    });
  }

  update(fix: LocationFix, now = Date.now()): ProgressResult {
    if (!usableAccuracy(fix.accuracy)) {
      this.needsConfirmation = true;
      this.pending = null;
      return { kind: "paused", reason: "accuracy" };
    }
    if (now - this.confirmedAt > MAX_TRACKING_GAP_MS) return { kind: "replan", reason: "stale" };
    const { candidates, total } = routeProjections(fix.coordinate, this.route.path);
    const deviation = Math.min(...candidates.map((candidate) => candidate.deviation));
    if (deviation > 45) return { kind: "replan", reason: "off-route" };

    // A nearby crossing or parallel return leg must not jump us far along the route.
    const movement = distanceInMeters(this.previous.coordinate, fix.coordinate);
    const continuity = Math.max(60, movement * 1.6 + this.previous.accuracy! + fix.accuracy!);
    const nearby = candidates.filter((candidate) => candidate.deviation <= deviation + Math.max(5, fix.accuracy!));
    const plausible = nearby.filter((candidate) => Math.abs(candidate.along - this.along) <= continuity);
    if (!plausible.length || Math.max(...plausible.map((p) => p.along)) - Math.min(...plausible.map((p) => p.along)) > 60) {
      this.needsConfirmation = true;
      this.pending = null;
      return { kind: "paused", reason: "ambiguous" };
    }
    plausible.sort((a, b) => a.deviation - b.deviation || Math.abs(a.along - this.along) - Math.abs(b.along - this.along));
    const along = plausible[0].along;
    if (along < this.along - Math.max(20, this.previous.accuracy! + fix.accuracy!)) return { kind: "replan", reason: "reverse" };

    // Large forward jumps and recovery after a poor fix need a second consistent fix.
    if (this.needsConfirmation || along - this.along > 60) {
      if (!this.pending || Math.abs(along - this.pending.along) > Math.max(30, this.pending.accuracy + fix.accuracy!)) {
        this.pending = { along, accuracy: fix.accuracy! };
        this.needsConfirmation = true;
        return { kind: "paused", reason: "confirming" };
      }
    }
    this.pending = null;
    this.needsConfirmation = false;
    this.previous = fix;
    this.confirmedAt = now;
    this.along = along;
    // Require passing the boundary beyond the error radius, not merely being nearby.
    const confirmedAlong = along - fix.accuracy!;
    let stepIndex = 0;
    while (stepIndex < this.boundaries.length - 1 && confirmedAlong > this.boundaries[stepIndex]) stepIndex++;
    return { kind: "active", along, remaining: Math.max(0, total - along), stepIndex };
  }
}
