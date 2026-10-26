# ============================================================
#  前端一键部署脚本
#  用法：在本前端项目根目录（work_myself）执行
#        powershell -ExecutionPolicy Bypass -File .\deploy-front.ps1
#  流程：npm run build -> 打包 dist -> 上传 -> 服务器替换（旧版自动备份，可回滚）
# ============================================================
$ErrorActionPreference = "Stop"

# ---- 可按需修改的配置 ----
$SshKey    = "D:\Users\85053\Documents\Trae-CN\default\.deploy\portfolio_ed25519"
$Server    = "root@43.129.241.216"
$RemoteDir = "/opt/portfolio/frontend"   # 服务器前端目录（dist 的父目录）
$TarName   = "frontend.tar.gz"

# 校验：必须在项目根目录（存在 package.json）
if (-not (Test-Path "package.json")) {
    Write-Error "请在前端项目根目录执行本脚本（未找到 package.json）"
    exit 1
}

Write-Host "`n[1/4] 构建前端 (npm run build)..." -ForegroundColor Cyan
npm run build
if ($LASTEXITCODE -ne 0) { Write-Error "构建失败"; exit 1 }

Write-Host "`n[2/4] 打包 dist..." -ForegroundColor Cyan
if (Test-Path $TarName) { Remove-Item $TarName -Force }
tar -czf $TarName dist
if ($LASTEXITCODE -ne 0) { Write-Error "打包失败"; exit 1 }

Write-Host "`n[3/4] 上传到服务器..." -ForegroundColor Cyan
scp -i $SshKey $TarName "${Server}:/tmp/$TarName"
if ($LASTEXITCODE -ne 0) { Write-Error "上传失败"; exit 1 }

Write-Host "`n[4/4] 服务器替换 dist（旧版备份为 dist.bak）..." -ForegroundColor Cyan
# 先删旧备份，再把当前 dist 改名成备份（保证全新解压、无残留旧文件），最后解压新包
$remote = "cd $RemoteDir && rm -rf dist.bak && (mv dist dist.bak || true) && tar -xzf /tmp/$TarName && rm -f /tmp/$TarName && echo DEPLOY_OK"
ssh -i $SshKey $Server $remote
if ($LASTEXITCODE -ne 0) { Write-Error "服务器替换失败"; exit 1 }

if (Test-Path $TarName) { Remove-Item $TarName -Force }

Write-Host "`n前端部署完成！浏览器 Ctrl+F5 硬刷新查看。" -ForegroundColor Green
Write-Host "如需回滚，服务器执行：cd $RemoteDir && rm -rf dist && mv dist.bak dist" -ForegroundColor Yellow