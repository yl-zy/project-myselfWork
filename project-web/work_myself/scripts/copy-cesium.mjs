// 将 Cesium 运行时静态资源从 node_modules 拷贝到 public/cesium
// 背景：Cesium 的 Workers/Assets/Widgets/ThirdParty 会在运行时按 CESIUM_BASE_URL 动态加载，
// 必须以真实静态文件存在；曾用 vite-plugin-static-copy，但其 dev 服务在 Vite 8 下失效
// （请求落入 SPA 回退返回 index.html，Worker 启动失败导致三维场景黑屏）。
// public 目录由 Vite 原生服务，dev/build 行为一致；产物已 gitignore，版本变化时自动重拷。
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const cesiumDir = join(root, 'node_modules', 'cesium')
const { version } = JSON.parse(readFileSync(join(cesiumDir, 'package.json'), 'utf8'))

const dest = join(root, 'public', 'cesium')
const versionFile = join(dest, '.cesium-version')

if (existsSync(versionFile) && readFileSync(versionFile, 'utf8') === version) {
  console.log(`[copy-cesium] ${version} 已拷贝，跳过`)
  process.exit(0)
}

rmSync(dest, { recursive: true, force: true })
mkdirSync(dest, { recursive: true })
for (const dir of ['Workers', 'ThirdParty', 'Assets', 'Widgets']) {
  cpSync(join(cesiumDir, 'Build', 'Cesium', dir), join(dest, dir), { recursive: true })
}
writeFileSync(versionFile, version)
console.log(`[copy-cesium] Cesium ${version} 静态资源已拷贝到 public/cesium`)
