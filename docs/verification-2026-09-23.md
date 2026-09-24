# 中文版改版验收（2026-09-23 至 09-24）

## 部署基线

- 线上仓库：`bri-jing/bri-jing.github.io`。
- GitHub Pages：workflow 模式，`main`，域名 `bri-jing.com`。
- 线上最近成功部署：[30738987362](https://github.com/bri-jing/bri-jing.github.io/actions/runs/30738987362)。
- 线上与本地修改前均为 `d12f16169560e82df0485514460229f589a9af44`。
- `https://bri-jing.com/` 返回 HTTP 200，浏览器能加载旧版首页和四景入口。
- 所有新增修改目前在本地工作区，尚未推送到生产 `main`。

## 已完成

- 去除听障/视障选择：首页直接展示十景。旧听障书签显示音频导览。
- 新增六个独立详情页、六张本地实景照片、署名许可、中文情景讲解与通行提示；原四景使用同一套播放器、文字稿和导航入口。
- 语音按短句播放，提供停止、重播、进度、失败提示；讲解前播报现场通行提示。
- 一次只开一个步行面板，原生 dialog 管理焦点；Esc 关闭后恢复到原按钮。
- 统一 GCJ-02 定位和高德步行规划；超时、无权限、低精度、服务失败、偏航和关闭后的迟到回调均有处理。
- 路线剩余距离沿道路折线计算；到达需精度合格并连续两次定位确认。
- 三潭印月步行终点为陆上的花港观鱼码头，岛上景区另设定位围栏。
- 英文完整讲解尚未完成，按钮保持禁用。

## 通过的验证

1. `npm run lint`。
2. `npx tsc --noEmit --incremental false`，生产构建也执行 TypeScript 检查。
3. `npm test`：6 项导航/内容单元测试、Next.js 静态构建、4 项发布 HTML 与资源测试。
4. 真实 Chromium：手机布局无横向溢出、播放器开始/停止/重播、文字稿展开、单一导航弹窗、码头标题、焦点进入弹窗、Esc 关闭与焦点返回，共 9 项。
5. 注入模拟 SDK 的浏览器场景：有效路线、500 米低精度拦截、路线失败可重试、取消后迟到路线不重开、定位失败可见、停止后迟到定位忽略、偏航暂停，共 7 项。**这些是软件逻辑验证，不是高德真实路线成功证明。**
6. 六张新增照片逐张检查，图片描述与实际内容一致。

本地检查证据位于忽略提交的 `output/playwright/`，包含桌面/手机版截图和脱敏测试结果。

## 真实高德接口阻塞

线上 JS SDK 可以加载，但对十个步行目的地的实际 `AMap.Walking` 请求全部返回 `error`。进一步获取脱敏错误码，结果为 `USERKEY_PLAT_NOMATCH`。现有配置可以用于 Web 服务景点查询，却不能用于当前网页的 JS 步行接口。

2026-09-24 已将本地现有 `VITE_AMAP_KEY` 通过标准输入同步到 GitHub Actions Secret，并手动触发 [Pages 部署 35894936711](https://github.com/bri-jing/bri-jing.github.io/actions/runs/35894936711)，部署成功。线上 AMap 脚本所用 Key 与本地 Key 的 SHA-256 指纹一致，证明注入已生效；重新实测路线仍返回 `USERKEY_PLAT_NOMATCH`，因此剩余问题在高德控制台的平台类型或配套安全配置，不是环境变量未注入。

官方解释：[请求 Key 与绑定平台不符](https://developer.amap.com/api/javascript-api-v2/guide/abc/errorcode)。

需要维护者提供匹配的 **Web端（JS API）Key**，设置 `.env.local` 的 `NEXT_PUBLIC_AMAP_KEY`，并按高德要求配置安全代理 `NEXT_PUBLIC_AMAP_SERVICE_HOST`，或配套 `NEXT_PUBLIC_AMAP_SECURITY_CODE`。来源限制应允许 `bri-jing.com` 和开发域名。部署时更新工作流使用的 GitHub Secret `VITE_AMAP_KEY`，及需要的安全配置。密钥不应写入报告、代码或聊天。

取得正确配置后仍须重新实测十条真实路线、设备定位权限、路线起终点与实际入口，才能将接口验收改为通过。

## 不能远程确认的事项

- 没有现场步行或视障用户实测，不能宣称路线已验证为无障碍安全路线。
- 高德标准步行数据不完整描述盲道、全部台阶、临时施工、护栏或游船登船条件。
- 游船班次、寺院鸣钟、门票及电梯开放取决于现场情况。
- 浏览器后台/锁屏及不同设备语音包，尚未经过实际 iOS/Android 设备测试。
- GitHub Pages 当前未开启强制 HTTPS（HTTPS 访问本身正常）；建议发布时开启，以免 HTTP 访问阻止精确定位。
