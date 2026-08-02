# 西湖无障碍导览

面向视障与听障游客的西湖十景导览 Demo。首页只提供两种导览入口，选择后分别进入独立页面。

2026 Asian Undergraduate Symposium seed funding project, improving access to Hangzhou West Lake for visually impaired and hearing impaired visitors.

## 页面结构

```text
首页
├─ 视障导览
│  └─ 西湖十景
│     ├─ 曲院风荷：情景描述与朗读
│     ├─ 苏堤春晓：情景描述与朗读
│     ├─ 平湖秋月：情景描述与朗读
│     └─ 断桥残雪：情景描述与朗读
└─ 听障导览
   └─ 西湖十景
      └─ 曲院风荷：视频页面
```

视障导览的其余六景，以及听障导览除曲院风荷外的九景，已保留入口位置但尚未开放。

## 当前功能

- 视障导览：曲院风荷、苏堤春晓、平湖秋月和断桥残雪的完整语音导览；详情页不展示长篇正文，提供播放、停止和重播控制。
- 听障导览：曲院风荷独立视频页；当前仅保留视频位置，不包含视频文件。
- 定位导览：进入四个已开放景点的 100 米范围后，等待 3 秒自动打开对应介绍。
- 站内导航：四个已开放景点均提供“去这里”，高德路线优先，失败或超时后可切换 Google 备用路线。
- 响应式布局：支持桌面和移动端浏览。

## 页面路由

| 路由 | 页面 |
| --- | --- |
| `/` | 导览类型选择 |
| `/visual` | 视障导览 · 西湖十景 |
| `/visual/quyuan-fenghe` | 曲院风荷语音导览 |
| `/visual/sudi-chunxiao` | 苏堤春晓语音导览 |
| `/visual/pinghu-qiuyue` | 平湖秋月语音导览 |
| `/visual/duanqiao-canxue` | 断桥残雪语音导览 |
| `/hearing` | 听障导览 · 西湖十景 |
| `/hearing/quyuan-fenghe` | 曲院风荷视频页 |

## 本地运行

```bash
npm ci
npm run dev
```

需要 Node.js 22.13.0 或更高版本。默认开发地址以终端输出为准。

## 验证

```bash
npm run lint
npm test
npm run build
```

## 图片来源

- `quyuan-lake.jpg`：J. Patrick Fischer，Wikimedia Commons，CC BY-SA 3.0。
- `quyuan-fenghe.jpg`：Mywood，Wikimedia Commons，Public Domain。
- `sudi-chunxiao.jpg`：[DXR，Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Su_Causeway_near_West_Lake,_looking_towards_north_20120529_1.jpg)，[CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/)（网页使用缩放版本）。
- `pinghu-qiuyue.jpg`：[Jeff chenqinyi，Wikimedia Commons](https://commons.wikimedia.org/wiki/File:%E8%A5%BF%E6%B9%96%E5%B9%B3%E6%B9%96%E7%A7%8B%E6%9C%88.JPG)，[CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/)（网页使用缩放版本）。
- `duanqiao-canxue.jpg`：[94rain，Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Duanqiao_on_a_snowy_day,_Westlake,_Hangzhou_-_20181209.jpg)，[CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/)。
