# 西湖无障碍导览

面向视障与听障游客的西湖十景导览 Demo。首页只提供两种导览入口，选择后分别进入独立页面。

2026 Asian Undergraduate Symposium seed funding project, improving access to Hangzhou West Lake for visually impaired and hearing impaired visitors.

## 页面结构

```text
首页
├─ 视障导览
│  └─ 西湖十景
│     └─ 曲院风荷：情景描述与朗读
└─ 听障导览
   └─ 西湖十景
      └─ 曲院风荷：视频页面
```

其余九景已保留入口位置，但尚未开放。

## 当前功能

- 视障导览：曲院风荷情景描述与浏览器语音朗读。
- 听障导览：曲院风荷独立视频页；当前仅保留视频位置，不包含视频文件。
- 定位导览：到达测试区域后自动打开曲院风荷介绍。
- 站内导航：高德路线优先，失败或超时后可切换 Google 备用路线。
- 响应式布局：支持桌面和移动端浏览。

## 页面路由

| 路由 | 页面 |
| --- | --- |
| `/` | 导览类型选择 |
| `/visual` | 视障导览 · 西湖十景 |
| `/visual/quyuan-fenghe` | 曲院风荷情景描述与朗读 |
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
