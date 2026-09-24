import assert from "node:assert/strict";
import test from "node:test";
import { stat } from "node:fs/promises";
import { confidentlyNear, readCoordinate, routeProgress, usableAccuracy } from "../app/components/route-geometry";
import { distanceInMeters, scenicSpotZones, type Coordinate } from "../app/data/scenic-spots";
import { visualGuides } from "../app/data/visual-guides";
import { visitNotes } from "../app/data/visit-notes";
import { bounded, MapServiceError } from "../app/components/amap-service";

test("bad or uncertain positions cannot confirm arrival", () => {
  const target: Coordinate = [120.14, 30.24];
  for (const accuracy of [undefined, NaN, Infinity, -1, 31, 500]) {
    assert.equal(usableAccuracy(accuracy), false);
    assert.equal(confidentlyNear(target, target, accuracy, 35), false);
  }
  assert.equal(confidentlyNear(target, target, 5, 35), true);
  assert.equal(confidentlyNear([120.1403, 30.24], target, 15, 35), false);
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
