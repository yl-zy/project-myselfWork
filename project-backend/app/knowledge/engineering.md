# 前端工程化

## Vite 和 Webpack 的区别
keywords: vite, webpack, 构建, esbuild, rollup, hmr, 热更新, 打包

核心差异在**开发模式**：

- Webpack：先打包再启动，项目越大启动越慢、HMR 越慢
- Vite：利用浏览器**原生 ESM**，dev 阶段按需编译（esbuild 预构建依赖，Go 编写比 JS 快 10-100 倍），毫秒级启动；HMR 只需编译改动文件
- 生产构建：Vite 用 Rollup，产物与 Webpack 无本质差异
- 选型：新项目优先 Vite；老项目迁移注意 CommonJS 依赖和特殊 loader 的兼容

## Tree Shaking 原理与失效场景
keywords: tree shaking, 摇树, 死代码, esm, sideeffects, 体积

基于 **ESM 的静态结构**：import/export 在编译期可确定，打包器标记未被引用的导出为 dead code，压缩阶段删除。

失效场景：

- CommonJS（module.exports 动态）无法静态分析
- 有副作用的模块（polyfill、改全局）被误删或不敢删——靠 `sideEffects: false` 声明
- Babel 把 ESM 转成 CJS 后摇树失效
- 实践：组件库按需加载优先选 ESM 版本 + sideEffects 标注 CSS

## 前端监控体系怎么搭建
keywords: 监控, 埋点, 错误采集, 性能上报, sentry, sourcemap, 告警

三层采集 + 一条上报管道：

- 错误：`window.onerror` / `unhandledrejection` / 框架错误边界（Vue errorHandler、React ErrorBoundary）；JS 错误配 sourcemap 还原源码
- 性能：web-vitals 采集 LCP/INP/CLS；PerformanceObserver 拿资源和长任务；接口埋点记录耗时与状态码
- 行为：PV/UV、点击埋点（演示项目通常只做前两层）
- 上报：`sendBeacon` 防页面关闭丢失，批量合并、采样、限流；服务端聚合出 P75 指标与趋势图

## 微前端的方案与适用场景
keywords: 微前端, qiankun, module federation, 模块联邦, 沙箱, 子应用

解决的问题：**多个团队/技术栈独立开发部署**同一个大型应用，或老系统渐进重构。

- qiankun（single-spa 封装）：JS 沙箱（Proxy 快照）隔离全局变量，CSS  scoped/Shadow DOM 隔离样式，主应用按路由激活子应用
- Module Federation（Webpack5）：构建期共享，运行时远程加载模块，适合共享组件库/设计系统
- 代价：架构复杂度、通信成本、样式冲突排查成本——中小项目不要为了用而用
