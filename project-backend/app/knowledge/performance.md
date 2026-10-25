# 前端性能优化

## 首屏加载优化手段
keywords: 首屏, 加载, 优化, 白屏, 分包, 懒加载, cdn, 骨架屏

从网络、渲染、体验三层入手：

- 网络层：路由级**代码分割**（动态 import）、静态资源上 CDN、gzip/brotli、HTTP2 多路复用、preload 关键资源、图片懒加载 + WebP
- 渲染层：SSR/SSG 或骨架屏缩短白屏；减少首屏 JS 体积，第三方 SDK 延后加载
- 缓存层：静态资源强缓存（hash 文件名）+ HTML 协商缓存
- 度量：先埋点看 LCP/FCP 分布，优化要对准瓶颈而不是套清单

## Web Vitals 核心指标
keywords: web vitals, lcp, inp, fid, cls, 性能指标, 监控

Google 提出的用户体验核心指标：

- **LCP**（最大内容绘制）≤ 2.5s：衡量加载速度，优化方向是资源和渲染路径
- **INP**（交互到下次绘制）≤ 200ms：2024 起取代 FID，衡量全程交互响应，优化长任务
- **CLS**（布局偏移）≤ 0.1：图片/广告预留尺寸、字体 display swap、避免顶部插入内容
- 采集：web-vitals 库上报，配合接口耗时、错误一起构成性能看板（本站第 5 个模块就是这个）

## 长列表 / 大数据量渲染优化
keywords: 长列表, 虚拟列表, 虚拟滚动, 大数据, 卡顿, 十万条

核心思路：**只渲染可视区**。

- 虚拟列表：固定行高直接算 offset；不定高用预估 + 测量回填（如 react-virtuoso）
- 辅以：时间切片分片渲染、Canvas 渲染（表格场景）、Web Worker 处理数据
- 反面教材：一次渲染 10 万条 DOM，内存和布局计算直接卡死

## 浏览器缓存策略
keywords: 缓存, 强缓存, 协商缓存, etag, cache-control, 304

- 强缓存（不发请求）：`Cache-Control: max-age=31536000, immutable`，配 hash 文件名，HTML 绝不用强缓存
- 协商缓存（发请求验证）：ETag / If-None-Match → 304；Last-Modified 精度到秒，作降级
- 部署实践：index.html 用 `no-cache` 每次验证，带 hash 的 JS/CSS 用一年强缓存，发版只换 HTML 引用
