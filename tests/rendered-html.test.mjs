import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render(pathname) {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-${pathname}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${pathname}`, {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

async function htmlFor(pathname) {
  const response = await render(pathname);
  assert.equal(response.status, 200, pathname);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  return response.text();
}

test("home contains only the two audience entry choices", async () => {
  const html = await htmlFor("/");

  assert.match(html, /<title>西湖无障碍导览 \| Accessible West Lake Guide<\/title>/i);
  assert.match(html, /选择导览/);
  assert.match(html, /href="\/visual"/);
  assert.match(html, /href="\/hearing"/);
  assert.match(html, /视障导览/);
  assert.match(html, /听障导览/);
  assert.match(html, /Switch to English/);
  assert.doesNotMatch(html, /<small\b/i);
});

test("visual and hearing guides have separate ten-scene pages", async () => {
  const [visual, hearing] = await Promise.all([
    htmlFor("/visual"),
    htmlFor("/hearing"),
  ]);

  assert.match(visual, /href="\/visual\/quyuan-fenghe"/);
  assert.match(hearing, /href="\/hearing\/quyuan-fenghe"/);
  assert.equal((visual.match(/>去这里<\/button>/g) ?? []).length, 1);
  assert.equal((hearing.match(/>去这里<\/button>/g) ?? []).length, 1);

  const scenes = [
    "曲院风荷",
    "苏堤春晓",
    "平湖秋月",
    "断桥残雪",
    "柳浪闻莺",
    "花港观鱼",
    "双峰插云",
    "三潭印月",
    "雷峰夕照",
    "南屏晚钟",
  ];

  for (const scene of scenes) {
    assert.match(visual, new RegExp(scene));
    assert.match(hearing, new RegExp(scene));
  }

  assert.match(visual, /开启定位/);
  assert.match(hearing, /开启定位/);
  assert.doesNotMatch(visual, /到点自动导览/);
  assert.doesNotMatch(hearing, /到点自动导览/);
  assert.match(visual, /aria-live="polite"/);
  assert.match(hearing, /aria-live="polite"/);

  assert.doesNotMatch(visual, /<small\b/i);
  assert.doesNotMatch(hearing, /<small\b/i);
});

test("third-level pages diverge by audience need", async () => {
  const [visual, hearing] = await Promise.all([
    htmlFor("/visual/quyuan-fenghe"),
    htmlFor("/hearing/quyuan-fenghe"),
  ]);

  assert.match(visual, /你面向一片开阔的湖面/);
  assert.match(visual, /朗读/);
  assert.match(hearing, /视频制作中/);
  assert.match(hearing, /Video coming soon/);
  assert.doesNotMatch(visual, /视频制作中/);
  assert.doesNotMatch(hearing, /你面向一片开阔的湖面/);
  assert.doesNotMatch(visual, /<small\b/i);
  assert.doesNotMatch(hearing, /<small\b/i);
});

test("source keeps distinct route files", async () => {
  const paths = [
    "../app/page.tsx",
    "../app/visual/page.tsx",
    "../app/hearing/page.tsx",
    "../app/visual/quyuan-fenghe/page.tsx",
    "../app/hearing/quyuan-fenghe/page.tsx",
    "../app/components/LocationGuide.tsx",
    "../app/components/WalkingGuide.tsx",
    "../app/components/LegacyPwaCleanup.tsx",
    "../app/data/scenic-spots.ts",
  ];

  for (const path of paths) {
    const source = await readFile(new URL(path, import.meta.url), "utf8");
    assert.ok(source.length > 0, path);
  }
});

test("source includes complete English guide content", async () => {
  const sources = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/components/SceneGrid.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/components/LocationGuide.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/visual/quyuan-fenghe/page.tsx", import.meta.url), "utf8"),
  ]);
  const source = sources.join("\n");
  assert.match(source, /Choose a guide/);
  assert.match(source, /Ten West Lake Scenes/);
  assert.match(source, /Start location guide/);
  assert.match(source, /You are facing an open stretch of water/);
});

test("Quyuan card provides an in-page AMap walking voice guide", async () => {
  const [source, googleRouteSource, sceneGridSource] = await Promise.all([
    readFile(
      new URL("../app/components/WalkingGuide.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/components/google-walking-route.ts", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../app/components/SceneGrid.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(source, /AMap\.Walking/);
  assert.match(source, /speechSynthesis/);
  assert.match(source, /POSITION_INTERVAL_MS = 8_000/);
  assert.match(source, /AMAP_ROUTE_TIMEOUT_MS = 8_000/);
  assert.match(source, /AMap route timeout/);
  assert.match(source, /tryGoogleRoute/);
  assert.match(source, /tryGoogleFromBrowserLocation/);
  assert.match(source, /NEXT_PUBLIC_GOOGLE_MAPS_API_KEY/);
  assert.match(source, /Google 备用服务未配置/);
  assert.match(googleRouteSource, /Route\.computeRoutes/);
  assert.match(googleRouteSource, /travelMode: "WALKING"/);
  assert.match(
    googleRouteSource,
    /fields: \["distanceMeters", "durationMillis", "legs"\]/,
  );
  assert.doesNotMatch(source, /accessibility-verified route/);
  assert.match(sceneGridSource, /scenicSpotZones\[0\]/);
});

test("location guide uses the temporary NUS Elm test geofence", async () => {
  const scenicSpotSource = await readFile(
    new URL("../app/data/scenic-spots.ts", import.meta.url),
    "utf8",
  );
  const locationGuideSource = await readFile(
    new URL("../app/components/LocationGuide.tsx", import.meta.url),
    "utf8",
  );

  assert.match(scenicSpotSource, /Elm College centre at NUS University Town/);
  assert.match(scenicSpotSource, /coordinate: \[103\.7723762, 1\.3063908\]/);
  assert.match(scenicSpotSource, /triggerRadiusMeters: 100/);
  assert.match(locationGuideSource, /GUIDE_OPEN_DELAY_MS = 3_000/);
  assert.match(locationGuideSource, /3秒后打开导览/);
  assert.match(locationGuideSource, /停止定位.*distanceMeters/);
  assert.match(locationGuideSource, /Stop location.*distanceMeters/);
  assert.match(locationGuideSource, /clearTimeout\(navigationTimeoutRef\.current\)/);
});

test("GitHub Pages build targets the organization root site", async () => {
  const [nextConfigSource, packageSource] = await Promise.all([
    readFile(new URL("../next.config.ts", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(nextConfigSource, /process\.env\.NEXT_PUBLIC_BASE_PATH \?\? ""/);
  assert.doesNotMatch(nextConfigSource, /\/WestLakeProject/);
  assert.doesNotMatch(packageSource, /NEXT_PUBLIC_BASE_PATH=\/WestLakeProject/);
});
