# 网络与浏览器

## HTTP 缓存与状态码高频考点
keywords: http, 状态码, 301, 302, 304, 缓存

- 301 永久重定向（搜索引擎转移权重）/ 302 临时重定向
- 304 Not Modified：协商缓存命中，body 为空
- 强缓存不发请求，协商缓存发请求但可能不传 body，两者结合是静态资源标准方案
- HTTPS = HTTP + TLS：握手用非对称加密交换会话密钥，传输用对称加密

## 跨域的解决方案
keywords: 跨域, cors, jsonp, 代理, 同源策略, preflight, options

同源策略是浏览器限制，解决方案按场景：

- 开发期：dev server 代理（vite `server.proxy`），浏览器看到的是同源
- 生产期：服务端 CORS 响应头（Access-Control-Allow-Origin 等）；带 cookie 要前后端都开 credentials 且 Origin 不能为 `*`
- 预检请求：非简单请求（自定义头、JSON body）先发 OPTIONS，可在服务端缓存预检结果减少开销
- 历史方案 JSONP 只支持 GET，已基本淘汰

## 浏览器从输入 URL 到渲染经历了什么
keywords: url, 渲染, dns, tcp, 解析, 重绘, 回流, 渲染管线

1. 网络：DNS 解析 → TCP 三次握手 →（HTTPS 加 TLS 握手）→ 发请求收 HTML
2. 解析：HTML → DOM，CSS → CSSOM，合并成 Render Tree；JS 阻塞解析（async/defer 区别是高频追问）
3. 渲染：Layout（回流，算几何）→ Paint（重绘，画像素）→ Composite（合成层）
4. 性能启示：改几何属性触发回流，改颜色只触发重绘，transform/opacity 走合成器最省钱
