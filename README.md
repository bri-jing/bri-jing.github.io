# 西湖无障碍导览

面向视障游客的西湖十景语音导览。首页直接显示十景，每景都有实景图片、中文情景讲解、文字稿、播放/停止/重播与步行导航。英文完整讲解尚未完成，语言按钮暂不开放，已有英文偏好不会切入不完整版本。

## 运行与验证

需要 Node.js 22.13.0 或更新版本。

```bash
npm ci
npm run dev:pages
npm run lint
npm test
```

`npm test` 运行导航单元测试、与 GitHub Pages 相同的静态构建，以及发布 HTML/资源检查。`npm run dev` / `npm run build` 仍保留原有 vinext 开发路径；实际域名使用 Next.js 静态输出 `out/`。

## 页面

- `/` 和 `/visual/`：十景首页。
- `/visual/<slug>/`：十个独立的语音详情页。
- `/hearing/` 与 `/hearing/quyuan-fenghe/`：兼容旧书签，呈现对应的视障导览；不再提供听障模块或模式选择。
- 语音使用与原四景相同的 Web Speech API，按短句排队，显示段落进度；不支持或播放失败时提供文字稿。需用户点击播放，避免手机浏览器自动播放限制。切换语言/页面会取消旧语音。
- 附近景点定位由用户主动开启。检测到附近景点后提供链接，避免读屏过程中突然跳转；不开启定位也可浏览全部讲解。

## 高德定位与导航

复制 `.env.example` 中需要的变量到忽略提交的 `.env.local`，通过环境变量设置，勿提交凭据。已有 `VITE_AMAP_KEY` 本地配置兼容。部署工作流继续使用 GitHub Secret `VITE_AMAP_KEY`；可选 Secret `AMAP_SECURITY_CODE` 或仓库变量 `AMAP_SERVICE_HOST`（以 `/_AMapService` 结尾）。安全密钥优先放在代理服务器，高德浏览器 Key 应设置来源限制。任何 `NEXT_PUBLIC_*` 配置均会进入浏览器构建，不应承载其他私密凭据。

- 使用 AMap JS API 2.0 的 `Geolocation` 和 `Walking`，统一使用 GCJ-02 坐标，禁止用 IP 粗略定位开始步行导航。
- SDK、定位和规划都有超时；低精度、失败和偏航都有可见状态与重试入口。停止或离页后忽略未完成请求的回调。
- 仅当精度不超过 30 米时开始方向引导；到达判定纳入精度半径，连续两次确认。剩余距离来自路线折线，不用穿过湖面的直线距离代替道路距离。
- 路线只按已确认路段端点推进；偏航后暂停并要求重新规划。不根据设备朝向推断转身方向。
- 三潭印月在岛上。其“附近景点”坐标在岛上，但步行目的地是**三潭印月花港观鱼码头**，到码头仍须现场确认游船与上岛协助。
- 双峰插云目的地是洪春桥一带的题名景区，不包含登山路径。
- 每次只开启一个导航面板。打开导航会停止附近景点定位，避免重复定位和语音冲突。
- 普通步行数据不保证盲道连续、无台阶，也无法验证临时围挡或湖岸护栏。网页导航需保持前台；后台锁屏不承诺连续语音。请结合日常出行辅助与现场指引。
- 高德失败时提供高德官方地图链接；电脑端无起点时需手动填写，手机端可使用当前位置。原 Google 模块保留在仓库，但不再进入运行路径，避免混用坐标系。

高德 POI 数据：原四景于 2026-08-02 查询；新增六景与花港观鱼码头于 2026-09-23 查询，POI ID 保存在 `app/data/scenic-spots.ts`。软件及接口验收见 `docs/verification-2026-09-23.md`。

## 部署

当前生产仓库为 `bri-jing/bri-jing.github.io`，由 `main` 的 `.github/workflows/deploy-pages.yml` 部署至 `https://bri-jing.com/`。推送 `main` 会触发上线；检查 lint、导航单元测试、静态构建与输出测试全部通过后才部署。网站没有持续运行的应用服务器，GitHub Pages 提供静态文件，定位/导航按需访问高德。

## 内容与图片

新增讲解以空间关系、感官想象、文化背景与现场通行提示组织；季节声景和灯月意境不等于实时观测。保留原四景主体，修正断桥至孤山的向西方向及白堤沿革表述。

内容核对来源：

- [杭州文旅：柳浪闻莺](https://wgly.hangzhou.gov.cn/art/2022/12/1/art_1229696389_58943144.html)
- [西湖十景景观介绍](https://z.hangzhou.com.cn/2021/syjy/content/content_8115764.html)
- [西湖景区：双峰插云](https://westlake.hangzhou.gov.cn/art/2024/3/4/art_1643935_59046173.html)
- [杭州：雷峰塔沿革](https://ywhz.hangzhou.com.cn/yjls/content/content_6218549.htm)
- [杭州政协：净慈寺遗址](https://www.hzzx.gov.cn/cshz/content/2023-02/10/content_8467917.htm)
- [高德步行路径接口](https://lbs.amap.com/api/javascript-api/reference/route-search)
- [高德定位选项](https://lbs.amap.com/api/javascript-api/reference/location)
- [高德官方导航链接](https://lbs.amap.com/api/uri-api/guide/travel/route)

既有图片：

- `quyuan-lake.jpg`：J. Patrick Fischer，Wikimedia Commons，CC BY-SA 3.0。
- `quyuan-fenghe.jpg`：Mywood，Wikimedia Commons，Public Domain。
- `sudi-chunxiao.jpg`：[DXR，Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Su_Causeway_near_West_Lake,_looking_towards_north_20120529_1.jpg)，[CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/)。
- `pinghu-qiuyue.jpg`：[Jeff chenqinyi，Wikimedia Commons](https://commons.wikimedia.org/wiki/File:%E8%A5%BF%E6%B9%96%E5%B9%B3%E6%B9%96%E7%A7%8B%E6%9C%88.JPG)，[CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/)。
- `duanqiao-canxue.jpg`：[94rain，Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Duanqiao_on_a_snowy_day,_Westlake,_Hangzhou_-_20181209.jpg)，[CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/)。

新增六张实景照片的作者、原始文件页和许可证见 `app/data/image-credits.ts`，各详情页亦展示署名及许可证链接。照片来自 Wikimedia Commons 的缩放版本，页面以背景图裁切展示；没有用生成图代替实景。
