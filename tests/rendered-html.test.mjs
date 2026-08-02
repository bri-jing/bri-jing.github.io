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
  assert.match(visual, /href="\/visual\/sudi-chunxiao"/);
  assert.match(visual, /href="\/visual\/pinghu-qiuyue"/);
  assert.match(visual, /href="\/visual\/duanqiao-canxue"/);
  assert.match(hearing, /href="\/hearing\/quyuan-fenghe"/);
  assert.equal((visual.match(/>去这里<\/button>/g) ?? []).length, 4);
  assert.equal((hearing.match(/>去这里<\/button>/g) ?? []).length, 1);
  assert.doesNotMatch(hearing, /href="\/hearing\/sudi-chunxiao"/);

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

  assert.match(visual, /曲院风荷/);
  assert.match(visual, /播放介绍/);
  assert.match(visual, /重播/);
  assert.doesNotMatch(visual, /class="guide-copy"/);
  assert.match(hearing, /视频制作中/);
  assert.match(hearing, /Video coming soon/);
  assert.doesNotMatch(visual, /视频制作中/);
  assert.doesNotMatch(hearing, /你面向一片开阔的湖面/);
  assert.doesNotMatch(visual, /<small\b/i);
  assert.doesNotMatch(hearing, /<small\b/i);
});

test("four visual guide pages expose images and audio controls", async () => {
  const [quyuan, sudi, pinghu, duanqiao] = await Promise.all([
    htmlFor("/visual/quyuan-fenghe"),
    htmlFor("/visual/sudi-chunxiao"),
    htmlFor("/visual/pinghu-qiuyue"),
    htmlFor("/visual/duanqiao-canxue"),
  ]);

  assert.match(quyuan, /quyuan-lake\.jpg/);
  assert.match(sudi, /sudi-chunxiao\.jpg/);
  assert.match(pinghu, /pinghu-qiuyue\.jpg/);
  assert.match(duanqiao, /duanqiao-canxue\.jpg/);

  for (const html of [quyuan, sudi, pinghu, duanqiao]) {
    assert.match(html, /播放介绍/);
    assert.match(html, /重播/);
    assert.doesNotMatch(html, /class="guide-copy"/);
  }
});

test("audio source keeps all four supplied introductions", async () => {
  const source = await readFile(
    new URL("../app/data/visual-guides.ts", import.meta.url),
    "utf8",
  );

  assert.match(source, /曲院风荷，不只是风与荷，更是时间与美的相遇/);
  assert.match(source, /苏堤春晓，温和地讲述着苏东坡那样的人生智慧/);
  assert.match(source, /平湖秋月，是一面水做的镜子，照见湖，也照见你/);
  assert.match(source, /断桥没有断，雪终将融化/);
});

test("source keeps distinct route files", async () => {
  const paths = [
    "../app/page.tsx",
    "../app/visual/page.tsx",
    "../app/hearing/page.tsx",
    "../app/visual/quyuan-fenghe/page.tsx",
    "../app/visual/sudi-chunxiao/page.tsx",
    "../app/visual/pinghu-qiuyue/page.tsx",
    "../app/visual/duanqiao-canxue/page.tsx",
    "../app/hearing/quyuan-fenghe/page.tsx",
    "../app/components/VisualSceneGuide.tsx",
    "../app/components/LocationGuide.tsx",
    "../app/components/WalkingGuide.tsx",
    "../app/components/LegacyPwaCleanup.tsx",
    "../app/data/scenic-spots.ts",
    "../app/data/visual-guides.ts",
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
    readFile(new URL("../app/data/visual-guides.ts", import.meta.url), "utf8"),
  ]);
  const source = sources.join("\n");
  assert.match(source, /Choose a guide/);
  assert.match(source, /Ten West Lake Scenes/);
  assert.match(source, /Start location guide/);
  assert.match(source, /You are facing an open stretch of water/);
});

test("four scenic cards provide in-page AMap walking voice guides", async () => {
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
  assert.match(sceneGridSource, /scenicSpotZones\.find/);
  assert.match(sceneGridSource, /<WalkingGuide spot=\{scenicSpot\}/);
});

test("location guide uses four West Lake AMap geofences", async () => {
  const scenicSpotSource = await readFile(
    new URL("../app/data/scenic-spots.ts", import.meta.url),
    "utf8",
  );
  const locationGuideSource = await readFile(
    new URL("../app/components/LocationGuide.tsx", import.meta.url),
    "utf8",
  );
  const visualGuideSource = await readFile(
    new URL("../app/components/VisualSceneGuide.tsx", import.meta.url),
    "utf8",
  );

  assert.doesNotMatch(scenicSpotSource, /NUS|Elm College/);
  assert.match(scenicSpotSource, /coordinate: \[120\.133333, 30\.249287\]/);
  assert.match(scenicSpotSource, /coordinate: \[120\.13796, 30\.24388\]/);
  assert.match(scenicSpotSource, /coordinate: \[120\.146142, 30\.252244\]/);
  assert.match(scenicSpotSource, /coordinate: \[120\.151347, 30\.258151\]/);
  assert.equal(
    (scenicSpotSource.match(/triggerRadiusMeters: 100/g) ?? []).length,
    4,
  );
  assert.match(
    locationGuideSource,
    /filter\(\(spot\) => Boolean\(spot\.routes\[mode\]\)\)/,
  );
  assert.match(locationGuideSource, /GUIDE_OPEN_DELAY_MS = 3_000/);
  assert.match(locationGuideSource, /3秒后打开导览/);
  assert.match(locationGuideSource, /\\?autoplay=1/);
  assert.match(visualGuideSource, /get\("autoplay"\) === "1"/);
  assert.match(visualGuideSource, /speechSynthesis\.speak\(utterance\)/);
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
