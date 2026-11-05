import assert from "node:assert/strict";
import test from "node:test";
import { createRetryableLoader, ScriptLoadError } from "../app/components/retryable-loader";
import { loadAMap, MapServiceError } from "../app/components/amap-service";

test("SDK failures retry, concurrent callers share one request, and late callbacks are ignored", async () => {
  const attempts: Array<{ complete: (value: string) => void; fail: () => void }> = [];
  let cleaned = 0;
  const load = createRetryableLoader<string>((complete, fail) => { attempts.push({ complete, fail }); return () => { cleaned++; }; }, 1000);
  const first = load(); assert.equal(load(), first);
  await Promise.resolve(); assert.equal(attempts.length, 1);
  attempts[0].fail(); await assert.rejects(first, error => error instanceof ScriptLoadError && error.code === "load");
  const second = load(); await Promise.resolve(); assert.equal(attempts.length, 2);
  let settled = false; void second.then(() => { settled = true; });
  attempts[0].complete("old SDK"); await Promise.resolve(); assert.equal(settled, false);
  attempts[1].complete("new SDK"); assert.equal(await second, "new SDK");
  assert.equal(await load(), "new SDK"); assert.equal(attempts.length, 2); assert.equal(cleaned, 2);
});

test("SDK timeout and synchronous setup failure both allow a new attempt", async () => {
  const callbacks: Array<(value: number) => void> = [];
  const load = createRetryableLoader<number>((complete) => { callbacks.push(complete); return () => undefined; }, 15);
  await assert.rejects(load(), error => error instanceof ScriptLoadError && error.code === "timeout");
  const retry = load(); await Promise.resolve(); callbacks[0](1); callbacks[1](2); assert.equal(await retry, 2);
  let count = 0;
  const setup = createRetryableLoader<number>((complete) => { if (++count === 1) throw new Error("script setup failed"); complete(42); return () => undefined; });
  await assert.rejects(setup()); assert.equal(await setup(), 42);
});

test("AMap script retries use different callbacks and remove failed scripts", async () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  const originalKey = process.env.NEXT_PUBLIC_AMAP_KEY;
  const globals: Record<string, unknown> = { isSecureContext: true };
  const scripts: Array<{ src: string; onerror?: (() => void) | null; removed: boolean; remove: () => void }> = [];
  process.env.NEXT_PUBLIC_AMAP_KEY = "QA_SIMULATED_KEY_NOT_A_CREDENTIAL";
  Object.defineProperty(globalThis, "window", { configurable: true, value: globals });
  Object.defineProperty(globalThis, "document", { configurable: true, value: { createElement: () => { const script = { src: "", removed: false, remove() { this.removed = true; } }; return script; }, head: { appendChild: (s: typeof scripts[number]) => { scripts.push(s); } } } });
  try {
    const first = loadAMap(); await Promise.resolve();
    const callback1 = new URL(scripts[0].src).searchParams.get("callback")!;
    scripts[0].onerror!(); await assert.rejects(first, error => error instanceof MapServiceError && error.code === "load");
    assert.equal(scripts[0].removed, true);
    const retry = loadAMap(); await Promise.resolve();
    const callback2 = new URL(scripts[1].src).searchParams.get("callback")!;
    assert.notEqual(callback1, callback2);
    const api = { Geolocation: class {}, Walking: class {} }; globals.AMap = api;
    (globals[callback1] as () => void)();
    (globals[callback2] as () => void)();
    assert.equal(await retry, api); assert.equal(scripts[1].removed, true);
  } finally {
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow); else Reflect.deleteProperty(globalThis, "window");
    if (originalDocument) Object.defineProperty(globalThis, "document", originalDocument); else Reflect.deleteProperty(globalThis, "document");
    if (originalKey === undefined) delete process.env.NEXT_PUBLIC_AMAP_KEY; else process.env.NEXT_PUBLIC_AMAP_KEY = originalKey;
  }
});
