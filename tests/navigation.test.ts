import assert from "node:assert/strict";
import test from "node:test";
import { stat } from "node:fs/promises";
import { confidentlyNear, readCoordinate, routeProgress, usableAccuracy } from "../app/components/route-geometry";
import { distanceInMeters, scenicSpotZones, type Coordinate } from "../app/data/scenic-spots";
import { visualGuides } from "../app/data/visual-guides";
import { visitNotes } from "../app/data/visit-notes";
import { bounded, MapServiceError, parseWalkingRoute, type WalkingRoute } from "../app/components/amap-service";
import { NavigationProgress, officialWalkingLink, MAX_TRACKING_GAP_MS } from "../app/components/navigation-progress";

test("bad or uncertain positions cannot confirm arrival", () => {
  const target: Coordinate = [120.14, 30.24];
  for (const accuracy of [undefined, NaN, Infinity, -1]) {
    assert.equal(usableAccuracy(accuracy), false);
    assert.equal(confidentlyNear(target, target, accuracy, 35), false);
  }
  for (const accuracy of [31, 43, 50]) assert.equal(usableAccuracy(accuracy), true);
  for (const accuracy of [51, 500]) assert.equal(usableAccuracy(accuracy), false);
  assert.equal(confidentlyNear(target, target, 5, 35), true);
  assert.equal(confidentlyNear(target, target, 31, 35), false);
  assert.equal(confidentlyNear(target, target, 43, 35), false);
  assert.equal(confidentlyNear([120.1403, 30.24], target, 15, 35), false);
});

const origin: Coordinate = [120.130333, 30.249287];
const destination: Coordinate = [120.133333, 30.249287];
const walking: WalkingRoute = { distance: 300, seconds: 240, path: [origin, [120.131333, 30.249287], [120.132333, 30.249287], destination], steps: [
  { instruction: "第一段", distance: 100, path: [origin, [120.131333, 30.249287]] },
  { instruction: "第二段", distance: 100, path: [[120.131333, 30.249287], [120.132333, 30.249287]] },
  { instruction: "第三段", distance: 100, path: [[120.132333, 30.249287], destination] },
] };
const fix = (coordinate: Coordinate = origin, accuracy = 5) => ({ coordinate, accuracy });

test("poor stationary and off-route fixes cannot advance or resume directions", () => {
  const tracker = new NavigationProgress(walking, fix(), 0);
  assert.equal(tracker.update(fix(), 0).kind, "active");
  for (const time of [8000, 16000, 24000]) assert.deepEqual(tracker.update(fix(origin, 500), time), { kind: "paused", reason: "accuracy" });
  assert.deepEqual(tracker.update(fix([origin[0], origin[1] + 0.003], 500), 32000), { kind: "paused", reason: "accuracy" });
  assert.deepEqual(tracker.update(fix(), 33000), { kind: "paused", reason: "confirming" });
  assert.deepEqual(tracker.update(fix(), 34000), { kind: "active", along: 0, remaining: routeProgress(origin, walking.path).total, stepIndex: 0 });
});

test("a confirmed fix beyond a missed endpoint updates steps instead of sticking", () => {
  const tracker = new NavigationProgress(walking, fix(), 0);
  const passed = fix([120.131833, 30.249287]);
  assert.deepEqual(tracker.update(passed, 8000), { kind: "paused", reason: "confirming" });
  const result = tracker.update(passed, 16000);
  assert.equal(result.kind, "active");
  if (result.kind === "active") { assert.equal(result.stepIndex, 1); assert.ok(result.remaining < 150); }
});

test("being near a short step endpoint while stationary is not passing it", () => {
  const short: WalkingRoute = { ...walking, steps: [{ ...walking.steps[0], path: [origin, [origin[0] + 0.0001, origin[1]]] }, { ...walking.steps[1], path: [[origin[0] + 0.0001, origin[1]], destination] }] };
  const tracker = new NavigationProgress(short, fix(), 0);
  for (const time of [0, 8000, 16000]) {
    const result = tracker.update(fix(), time);
    assert.equal(result.kind, "active");
    if (result.kind === "active") assert.equal(result.stepIndex, 0);
  }
});

test("confirmed forward skips can cross several boundaries, reverse and stale fixes require replan", () => {
  const tracker = new NavigationProgress(walking, fix(), 0);
  const skipped = fix([120.132833, 30.249287]);
  assert.equal(tracker.update(skipped, 8000).kind, "paused");
  const result = tracker.update(skipped, 16000);
  assert.equal(result.kind, "active");
  if (result.kind === "active") assert.equal(result.stepIndex, 2);
  assert.deepEqual(tracker.update(fix([120.131833, 30.249287]), 24000), { kind: "replan", reason: "reverse" });
  assert.deepEqual(new NavigationProgress(walking, fix(), 0).update(fix(), MAX_TRACKING_GAP_MS + 1), { kind: "replan", reason: "stale" });
});

test("a crossing at the current position cannot teleport to a distant return leg", () => {
  const path: Coordinate[] = [origin, [origin[0], origin[1] + 0.002], [origin[0] + 0.002, origin[1] + 0.002], [origin[0] + 0.002, origin[1]], origin];
  const route = { distance: 800, seconds: 600, path, steps: path.slice(1).map((p, i) => ({ instruction: `段${i}`, distance: 200, path: [path[i], p] })) };
  const tracker = new NavigationProgress(route, fix(), 0);
  const result = tracker.update(fix(), 8000);
  assert.equal(result.kind, "active");
  if (result.kind === "active") { assert.equal(result.stepIndex, 0); assert.equal(result.along, 0); }
});

test("indistinguishable parallel legs pause instead of guessing a step", () => {
  const path: Coordinate[] = [origin, [origin[0], origin[1] + 0.0006], [origin[0] + 0.0002, origin[1] + 0.0006], [origin[0] + 0.0002, origin[1]], origin];
  const route = { distance: 172, seconds: 150, path, steps: path.slice(1).map((p, i) => ({ instruction: `段${i}`, distance: 40, path: [path[i], p] })) };
  const tracker = new NavigationProgress(route, fix(), 0);
  tracker.update(fix(path[1]), 8000); tracker.update(fix(path[1]), 16000);
  assert.deepEqual(tracker.update(fix([origin[0] + 0.0001, origin[1] + 0.0003], 15), 24000), { kind: "paused", reason: "ambiguous" });
});

test("route parser rejects distant endpoints, broken geometry and malformed responses", () => {
  const response = (route = walking) => ({ routes: [{ distance: route.distance, time: route.seconds, steps: route.steps.map(s => ({ ...s, path: s.path.map(([lng, lat]) => ({ lng, lat })) })) }] });
  assert.ok(parseWalkingRoute(response(), origin, destination));
  const distant = { ...walking, steps: [{ instruction: "走", distance: 500, path: [origin, [destination[0] + 0.002, destination[1]] as Coordinate] }] };
  assert.equal(parseWalkingRoute(response(distant), origin, destination), null);
  assert.equal(parseWalkingRoute(response(), [origin[0] - 0.002, origin[1]], destination), null);
  const broken = response(); broken.routes[0].steps[1].path[0].lat += 0.002;
  assert.equal(parseWalkingRoute(broken, origin, destination), null);
  const invalid = response(); invalid.routes[0].steps[0].path[0].lng = NaN;
  assert.equal(parseWalkingRoute(invalid, origin, destination), null);
  for (const bad of [null, {}, { routes: [{}] }, { routes: [{ distance: 10, time: 10, steps: "bad" }] }]) assert.equal(parseWalkingRoute(bad, origin, destination), null);
});

test("official map links use a fresh starting point instead of a stored origin", () => {
  const link = new URL(officialWalkingLink({ coordinate: destination, name: "曲院风荷" }));
  assert.equal(link.searchParams.has("from"), false);
  assert.equal(link.searchParams.get("coordinate"), "gaode");
  assert.equal(link.searchParams.get("mode"), "walk");
  assert.ok(link.searchParams.get("to")?.includes("曲院风荷"));
});

test("narration is framed as imagination, with no unverified live position or left/right", () => {
  for (const guide of Object.values(visualGuides)) assert.doesNotMatch(guide.paragraphs.zh.join(""), /你现在正站|你现在所处|你的左手边|你的右手边/);
});

test("invalid coordinate data is rejected without turning it into zero", () => {
  for (const input of [null, {}, { lng: NaN, lat: 30 }, { lng: 181, lat: 30 }, { lng: 120, lat: 91 }, { lng: "120", lat: 30 }]) assert.equal(readCoordinate(input), null);
  assert.deepEqual(readCoordinate({ getLng: () => 120, getLat: () => 30 }), [120, 30]);
});

test("remaining distance follows the road around a bend rather than cutting across it", () => {
  const start: Coordinate = [120.14, 30.24];
  const end: Coordinate = [120.142, 30.24];
  const path: Coordinate[] = [start, [120.14, 30.242], [120.142, 30.242], end];
  const first = routeProgress(start, path);
  assert.ok(first.remaining > distanceInMeters(start, end) * 2);
  assert.equal(first.deviation, 0);
  assert.equal(routeProgress(end, path).remaining, 0);
  const middle = routeProgress([120.141, 30.242], path);
  assert.ok(middle.remaining > 250 && middle.remaining < first.remaining);
  assert.ok(routeProgress([120.15, 30.25], path).deviation > 500);
});

test("a visitor on the mainland cannot be considered to have reached the island", () => {
  const island = scenicSpotZones.find((spot) => spot.id === "santan-yinyue")!;
  assert.equal(island.walkingDestination?.poiId, "B023B18MLB");
  assert.ok(distanceInMeters(island.coordinate, island.walkingDestination!.coordinate) > 500);
  assert.equal(confidentlyNear(island.walkingDestination!.coordinate, island.coordinate, 5, island.triggerRadiusMeters), false);
});

test("all ten scenes have local photographs, Chinese narration, notes and destinations", async () => {
  const guides = Object.values(visualGuides);
  assert.equal(guides.length, 10);
  assert.equal(scenicSpotZones.length, 10);
  assert.equal(new Set(scenicSpotZones.map((spot) => spot.id)).size, 10);
  for (const guide of guides) {
    assert.ok(guide.paragraphs.zh.length >= 6, guide.slug);
    assert.ok(guide.paragraphs.zh.join("").length > 450, guide.slug);
    assert.ok(guide.imageAltZh && guide.imageAltEn);
    assert.ok((await stat(new URL(`../public/${guide.image}`, import.meta.url))).size > 1000);
    assert.ok(visitNotes[guide.slug]?.zh);
    assert.equal(scenicSpotZones.find((spot) => spot.id === guide.slug)?.routes.visual, `/visual/${guide.slug}`);
  }
});

test("map operations finish, fail or time out instead of leaving the user waiting forever", async () => {
  assert.equal(await bounded(Promise.resolve(42), 20), 42);
  await assert.rejects(bounded(Promise.reject(new Error("service failure")), 20), /service failure/);
  await assert.rejects(bounded(new Promise(() => {}), 10), (error: unknown) => error instanceof MapServiceError && error.code === "timeout");
});
