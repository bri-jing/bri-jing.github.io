// Playwright CLI run-code function. Open a local dev:pages server with a dummy
// NEXT_PUBLIC_AMAP_KEY first; no map requests or real locations are permitted.
// eslint-disable-next-line @typescript-eslint/no-unused-expressions -- Playwright CLI evaluates this function expression.
async (page) => {
  const base = new URL(page.url()).origin;
  if (!['localhost', '127.0.0.1'].includes(new URL(base).hostname)) throw new Error('Run this regression against a local server only.');
  const results = [];
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const test = async (name, run) => { try { await run(); results.push({ name, status: 'passed' }); } catch (error) { results.push({ name, status: 'failed', error: String(error.message).slice(0, 500) }); } };
  const snapshot = async () => page.locator('body').ariaSnapshot();
  await page.context().clearPermissions();
  const cdp = await page.context().newCDPSession(page);
  const target = await cdp.send('Target.getTargetInfo');
  await cdp.send('Browser.setPermission', { browserContextId: target.targetInfo.browserContextId, permission: { name: 'geolocation' }, setting: 'denied', origin: base });
  await page.addInitScript(() => {
    const delay = window.setTimeout.bind(window);
    window.setTimeout = (fn, ms, ...args) => delay(fn, ms === 1500 || ms === 8000 ? 80 : ms === 12000 || ms === 60000 ? 500 : ms, ...args);
    window.__qa = { speech: [], cancellations: 0, speechMode: 'end' };
    let speechToken = 0;
    class Utterance { constructor(text) { this.text = text; } }
    Object.defineProperty(window, 'SpeechSynthesisUtterance', { configurable: true, value: Utterance });
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: {
      cancel() { speechToken++; window.__qa.cancellations++; },
      getVoices() { return []; },
      speak(u) { const token = ++speechToken; window.__qa.speech.push(u.text); if (window.__qa.speechMode === 'hang') return; delay(() => { if (token !== speechToken) return; if (window.__qa.speechMode === 'error') u.onerror?.({ error: 'synthesis-failed' }); else u.onend?.(); }, 2); }
    } });
  });
  let sdkRequests = 0;
  const mock = function (callback) {
    const point = p => ({ lng: p[0], lat: p[1] });
    window.AMap = {
      Geolocation: class { getCurrentPosition(cb) { const q = window.__qa; const n = q.geoCalls = (q.geoCalls || 0) + 1; const f = q.fixes[Math.min(n - 1, q.fixes.length - 1)]; setTimeout(() => cb(f.error ? 'error' : 'complete', f.error ? {} : { position: point(f.coordinate), accuracy: f.accuracy }), f.delay || 0); } },
      Walking: class { search(origin, destination, cb) { const q = window.__qa; q.routeCalls = (q.routeCalls || 0) + 1; q.requested = { origin, destination }; if (q.routeHang) return; setTimeout(() => cb(q.routeError ? 'error' : 'complete', q.routeError ? {} : { routes: [{ distance: 300, time: 240, steps: q.steps.map(s => ({ instruction: s.instruction, distance: 100, path: s.path.map(point) })) }] }), q.routeDelay || 0); } }
    };
    if (window.__qa.sdkHang) window.__qa.oldCallback = callback;
    else window[callback]();
  };
  await page.route('https://webapi.amap.com/**', async route => {
    if (!route.request().url().includes('/maps?')) { await route.abort(); return; }
    sdkRequests++;
    const fail = await page.evaluate(() => window.__qa.sdkFail);
    if (fail) { await route.abort('failed'); return; }
    const callback = new URL(route.request().url()).searchParams.get('callback');
    await route.fulfill({ status: 200, contentType: 'application/javascript', body: '(' + mock.toString() + ')(' + JSON.stringify(callback) + ')' });
  });
  const origin = [120.130333, 30.249287], destination = [120.133333, 30.249287];
  const fix = (coordinate = origin, accuracy = 5) => ({ coordinate, accuracy });
  const steps = [
    { instruction: '模拟第一段', path: [origin, [120.131333, origin[1]]] },
    { instruction: '模拟第二段', path: [[120.131333, origin[1]], [120.132333, origin[1]]] },
    { instruction: '模拟第三段', path: [[120.132333, origin[1]], destination] }
  ];
  const setup = async (config = {}, home = false) => {
    await page.goto(base + (home ? '/' : '/visual/quyuan-fenghe/')); await snapshot();
    await page.evaluate(q => { window.__qa = { speech: [], cancellations: 0, speechMode: 'end', ...q }; }, { fixes: [fix()], steps, ...config });
  };
  const open = async (home = false) => { await page.getByRole('button', { name: home ? '步行前往曲院风荷' : '步行去这里', exact: true }).click(); await snapshot(); };
  const begin = async () => { await page.getByRole('button', { name: '开始导航', exact: true }).click(); await snapshot(); await page.getByRole('button', { name: '重新规划', exact: true }).waitFor({ timeout: 5000 }); await snapshot(); };
  const status = () => page.getByRole('dialog').getByRole('status').first();

  await test('43m fixes can start giving directions', async () => {
    await setup({ fixes: [fix(origin, 43)] }); await open(); await begin();
    await status().filter({ hasText: '模拟第一段' }).waitFor();
  });
  await test('startup retries coarse fixes and starts when accuracy improves', async () => {
    await setup({ fixes: [fix(origin, 500), fix(origin, 51), fix(origin, 43)] }); await open(); await begin();
    await status().filter({ hasText: '模拟第一段' }).waitFor();
    assert(await page.evaluate(() => window.__qa.speech.includes('正在尝试获取更精确的位置，请稍候。')), 'no retry feedback');
  });
  await test('persistent 51m and 500m fixes do not plan or give directions', async () => {
    for (const accuracy of [51, 500]) {
      await setup({ fixes: [fix(origin, accuracy)] }); await open(); await begin();
      assert((await status().innerText()).includes('定位精度不足'), 'low accuracy not paused');
      assert(await page.locator('[aria-current=step]').count() === 0, 'step advanced');
      assert(await page.evaluate(() => !window.__qa.routeCalls), 'route was planned with poor location');
      assert(await page.evaluate(() => window.__qa.geoCalls === 3), 'did not stop after three fixes');
    }
    await page.screenshot({ path: 'output/playwright/fix-low-accuracy.png' });
  });
  await test('quality drop pauses, recovery needs two reliable fixes and updates missed endpoint', async () => {
    await setup({ fixes: [fix(), fix(origin, 500)] }); await open(); await begin();
    await status().filter({ hasText: '定位精度不足' }).waitFor();
    assert(await page.locator('[aria-current=step]').count() === 0, 'poor fix kept an active direction');
    await page.evaluate(p => { window.__qa.fixes = [p]; }, fix([120.131833, origin[1]]));
    await status().filter({ hasText: '模拟第二段' }).waitFor();
    assert((await page.locator('[aria-current=step]').textContent()) === '模拟第二段', 'missed endpoint stayed on first step');
  });
  await test('48m beyond endpoint updates after confirmation instead of sticking', async () => {
    await setup({ fixes: [fix(), fix([120.131833, origin[1]])] }); await open(); await begin();
    await status().filter({ hasText: '模拟第二段' }).waitFor();
    assert((await page.locator('[aria-current=step]').textContent()) === '模拟第二段', 'old step still active');
    await page.screenshot({ path: 'output/playwright/fix-passed-endpoint.png' });
  });
  await test('334m displacement with 500m error pauses instead of directions', async () => {
    await setup({ fixes: [fix(), fix([origin[0], origin[1] + 0.003], 500)] }); await open(); await begin();
    await status().filter({ hasText: '定位精度不足' }).waitFor();
    assert(await page.locator('[aria-current=step]').count() === 0, 'coarse off-route fix gave direction');
  });
  await test('192m wrong route endpoint is rejected before first direction', async () => {
    await setup({ steps: [{ instruction: '模拟错误终点', path: [origin, [destination[0] + 0.002, destination[1]]] }] }); await open(); await begin();
    assert((await status().innerText()).includes('未返回可用步行路线'), 'wrong endpoint accepted');
    assert(await page.evaluate(() => !window.__qa.speech.includes('模拟错误终点')), 'bad route was spoken');
  });
  await test('crossing cannot skip to a distant return leg', async () => {
    const path = [origin, [origin[0], origin[1] + 0.002], [origin[0] + 0.002, origin[1] + 0.002], [origin[0] + 0.002, origin[1]], origin, destination];
    await setup({ steps: path.slice(1).map((p, i) => ({ instruction: '模拟路段' + i, path: [path[i], p] })) }); await open(); await begin();
    await page.waitForTimeout(240);
    assert((await status().innerText()) === '模拟路段0', 'crossing jumped to later route');
  });
  await test('reverse movement pauses and requires replan', async () => {
    await setup({ fixes: [fix(), fix([120.131833, origin[1]])] }); await open(); await begin();
    await status().filter({ hasText: '模拟第二段' }).waitFor();
    await page.evaluate(p => { window.__qa.fixes = [p]; }, fix());
    await status().filter({ hasText: '可能折返' }).waitFor();
    assert(await page.locator('[aria-current=step]').count() === 0, 'reverse still gives old directions');
  });
  await test('two confirmed destination fixes arrive', async () => {
    await setup({ fixes: [fix(), fix(destination)] }); await open(); await begin();
    await status().filter({ hasText: '已到曲院风荷附近' }).waitFor();
    assert(await page.getByRole('button', { name: '重新规划' }).count() === 0, 'arrival did not stop');
  });
  await test('SDK first network failure retries without reload', async () => {
    await setup({ sdkFail: true }); const before = sdkRequests; await open(); await begin();
    assert((await status().innerText()).includes('未能加载'), 'expected SDK load failure');
    await page.evaluate(() => { window.__qa.sdkFail = false; });
    await page.getByRole('button', { name: '重新规划' }).click(); await snapshot(); await status().filter({ hasText: '模拟第一段' }).waitFor();
    assert(sdkRequests === before + 2, 'retry did not send a new SDK request');
  });
  await test('SDK timeout retry has independent callback, old callback cannot overwrite', async () => {
    await setup({ sdkHang: true }); await open(); await begin();
    assert((await status().innerText()).includes('超时'), 'SDK hanging request did not time out');
    const old = await page.evaluate(() => window.__qa.oldCallback);
    await page.evaluate(() => { window.__qa.sdkHang = false; });
    await page.getByRole('button', { name: '重新规划' }).click(); await snapshot(); await status().filter({ hasText: '模拟第一段' }).waitFor();
    await page.evaluate(cb => { window[cb]('late old failure'); }, old); await page.waitForTimeout(50);
    assert((await status().innerText()) === '模拟第一段', 'late callback overwrote retry');
  });
  await test('ordinary route failure and route timeout retain retry', async () => {
    await setup({ routeError: true }); await open(); await begin(); assert((await status().innerText()).includes('未返回'), 'route error missing');
    await page.evaluate(() => { window.__qa.routeError = false; }); await page.getByRole('button', { name: '重新规划' }).click(); await snapshot(); await status().filter({ hasText: '模拟第一段' }).waitFor();
    await setup({ routeHang: true }); await open(); await begin(); assert((await status().innerText()).includes('超时'), 'route timeout missing');
  });
  await test('close during route request ignores its late result', async () => {
    await setup({ routeDelay: 200 }); await open(); await page.getByRole('button', { name: '开始导航' }).click(); await snapshot();
    await page.waitForFunction(() => window.__qa.routeCalls === 1);
    await page.getByRole('button', { name: '停止并关闭' }).click(); await snapshot(); await page.waitForTimeout(250);
    assert(await page.locator('dialog').count() === 0, 'late response reopened dialog');
    assert(await page.evaluate(() => !window.__qa.speech.includes('模拟第一段')), 'late route spoke after close');
  });
  await test('speech errors are visible, retry and transcript controls work', async () => {
    await setup({ speechMode: 'error' }); await page.getByRole('button', { name: '播放介绍', exact: true }).click(); await snapshot();
    await page.locator('.playback-status').filter({ hasText: '播放失败' }).waitFor();
    const box = await page.locator('.playback-status').boundingBox(); assert(box.width > 1 && box.height > 1, 'speech error visually hidden');
    await page.getByRole('button', { name: '打开文字讲解', exact: true }).click(); await snapshot();
    assert(await page.locator('.guide-transcript').getAttribute('open') !== null, 'transcript recovery did not open');
    assert(await page.evaluate(() => document.activeElement.tagName === 'SUMMARY'), 'transcript focus not restored');
    await page.evaluate(() => { window.__qa.speechMode = 'end'; }); await page.getByRole('button', { name: '重试播放' }).click(); await snapshot();
    await page.locator('.playback-status').filter({ hasText: '播放完毕' }).waitFor();
    assert(await page.evaluate(() => window.__qa.speech[0].startsWith('请先在安全位置停下')), 'safety intro missing');
    await page.screenshot({ path: 'output/playwright/fix-speech-recovery.png' });
  });
  await test('missing speech API and silent timeout both provide visible transcript recovery', async () => {
    await setup(); await page.evaluate(() => { delete window.speechSynthesis; delete window.SpeechSynthesisUtterance; });
    await page.getByRole('button', { name: '播放介绍', exact: true }).click(); await snapshot(); assert((await page.locator('.playback-status').innerText()).includes('不支持'), 'unsupported state missing');
    assert(await page.getByRole('button', { name: '打开文字讲解' }).isVisible(), 'no text recovery');
    await setup({ speechMode: 'hang' }); await page.getByRole('button', { name: '播放介绍', exact: true }).click(); await snapshot();
    await page.locator('.playback-status').filter({ hasText: '播放失败' }).waitFor();
  });
  await test('replay, stop, and leaving cancel previous speech', async () => {
    await setup({ speechMode: 'hang' }); await page.getByRole('button', { name: '播放介绍', exact: true }).click(); await snapshot();
    await page.getByRole('button', { name: '重播', exact: true }).click(); await snapshot();
    await page.getByRole('button', { name: '停止', exact: true }).click(); await snapshot();
    assert((await page.locator('.playback-status').innerText()) === '尚未播放', 'stop did not reset');
    await page.getByRole('button', { name: '播放介绍', exact: true }).click(); await snapshot();
    await page.getByRole('link', { name: '西湖十景', exact: true }).click(); await page.waitForURL(base + '/'); await snapshot();
  });
  await test('background pauses and late fixes cannot restart directions', async () => {
    await setup(); await open(); await begin();
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
    await status().filter({ hasText: '进入后台' }).waitFor(); await page.waitForTimeout(200);
    assert(await page.locator('[aria-current=step]').count() === 0, 'background direction remains active');
    await page.evaluate(() => { delete document.hidden; document.dispatchEvent(new Event('visibilitychange')); });
    assert((await status().innerText()).includes('重新规划'), 'foreground silently resumed');
  });
  await test('nearby coarse fix does not claim zero metres or arrival', async () => {
    await setup({ fixes: [fix(destination, 500)] }, true); await page.getByRole('button', { name: '定位找附近景点' }).click(); await snapshot();
    await page.getByRole('status').filter({ hasText: '较粗略' }).waitFor(); assert(await page.locator('.location-guide a').count() === 0, 'coarse location confirmed arrival');
  });
  await test('modal repeats, Esc focus return, and 320px layout stay usable', async () => {
    await setup({}, true); await page.setViewportSize({ width: 320, height: 568 });
    for (let i = 0; i < 4; i++) { await open(true); assert(await page.locator('dialog[open]').count() === 1, 'multiple dialogs'); await page.keyboard.press('Escape'); await snapshot(); assert(await page.evaluate(() => document.activeElement.getAttribute('aria-label') === '步行前往曲院风荷'), 'focus did not return'); }
    await open(true); await page.getByRole('button', { name: '停止并关闭' }).scrollIntoViewIfNeeded();
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'mobile overflow');
    assert((await page.getByRole('dialog').innerText()).includes('未核验盲道'), 'navigation limitation missing');
    const link = new URL(await page.getByRole('link', { name: '在高德地图中打开（新窗口）' }).getAttribute('href'));
    assert(!link.searchParams.has('from'), 'stale start remains in map link');
    await page.screenshot({ path: 'output/playwright/fix-mobile-dialog.png' });
  });
  return { scope: 'Local code only; fake SDK and explicit public GCJ-02 coordinates; denied real location; polling and timeout accelerated', permission: await page.evaluate(async () => (await navigator.permissions.query({ name: 'geolocation' })).state), sdkRequests, passed: results.filter(r => r.status === 'passed').length, failed: results.filter(r => r.status === 'failed').length, results };
}
