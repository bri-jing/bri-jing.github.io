import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
import test from "node:test";

const slugs = ["quyuan-fenghe", "sudi-chunxiao", "pinghu-qiuyue", "duanqiao-canxue", "liulang-wenying", "huagang-guanyu", "shuangfeng-chayun", "santan-yinyue", "leifeng-xizhao", "nanping-wanzhong"];
const htmlFor = (path = "") => readFile(new URL(`../out/${path ? `${path}/` : ""}index.html`, import.meta.url), "utf8");

test("deployed homepage goes directly to ten complete audio scenes", async () => {
  for (const path of ["", "visual", "hearing"]) {
    const html = await htmlFor(path);
    assert.match(html, /<h1>西湖十景<\/h1>/);
    assert.doesNotMatch(html, /选择导览|听障导览|尚未开放|href="\/hearing/);
    assert.equal((html.match(/class="scene-go"/g) ?? []).length, 10);
    assert.match(html, /跳到主要内容/);
    assert.match(html, /id="main-content"/);
    for (const slug of slugs) assert.ok(html.includes(`href="/visual/${slug}/"`), `${path}: ${slug}`);
  }
});

test("all ten exported detail pages provide labelled images, speech, navigation and transcripts", async () => {
  for (const slug of slugs) {
    const html = await htmlFor(`visual/${slug}`);
    assert.match(html, /role="img" aria-label="[^"]+"/);
    assert.match(html, /播放介绍/);
    assert.match(html, /重播/);
    assert.match(html, /阅读文字讲解/);
    assert.match(html, /role="status"/);
    assert.match(html, /步行去/);
    assert.doesNotMatch(html, /视频制作中|尚未开放/);
    assert.ok((html.match(/<p>/g) ?? []).length >= 6);
  }
  const island = await htmlFor("visual/santan-yinyue");
  assert.match(island, /花港观鱼码头/);
  assert.match(island, /不能从湖岸一路步行抵达/);
});

test("legacy hearing detail URL serves the complete audio guide", async () => {
  const html = await htmlFor("hearing/quyuan-fenghe");
  assert.match(html, /播放介绍/);
  assert.doesNotMatch(html, /视频制作中|听障导览/);
});

test("exported same-origin image, script and stylesheet references exist", async () => {
  for (const path of ["", ...slugs.map((slug) => `visual/${slug}`)]) {
    const html = await htmlFor(path);
    const assets = [...html.matchAll(/(?:src|href)="(\/[^"?]+\.(?:js|css|jpg|svg))"/g)].map((match) => match[1]);
    assert.ok(assets.length > 0);
    for (const asset of assets) await access(new URL(`../out${asset}`, import.meta.url));
    const image = html.match(/background-image:url\((\/[^)]+\.jpg)\)/)?.[1];
    assert.ok(image, path);
    await access(new URL(`../out${image}`, import.meta.url));
  }
});
