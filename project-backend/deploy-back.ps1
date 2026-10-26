# ============================================================
#  后端一键部署脚本
#  用法：在本后端项目根目录（project-backend）执行
#        powershell -ExecutionPolicy Bypass -File .\deploy-back.ps1               # 仅更新代码并重启
#        powershell -ExecutionPolicy Bypass -File .\deploy-back.ps1 -InstallDeps  # 依赖有变化时
#        powershell -ExecutionPolicy Bypass -File .\deploy-back.ps1 -Migrate      # 改过 models/表结构 时
#  流程：打包源码 -> 上传 -> 解压覆盖 -> [可选]装依赖/跑迁移 -> 重启服务
# ============================================================
param(
    [switch]$InstallDeps,   # 依赖有变化时加此开关（对应 pip install -e .）
    [switch]$Migrate        # 改过 models（表结构）时加此开关（对应 alembic upgrade head）
)
$ErrorActionPreference = "Stop"

# ---- 可按需修改的配置 ----
$SshKey    = "D:\Users\85053\Documents\Trae-CN\default\.deploy\portfolio_ed25519"
$Server    = "root@43.129.241.216"
$RemoteDir = "/opt/portfolio/project-backend"
$TarName   = "backend.tar.gz"

# 校验：必须在后端项目根目录（存在 pyproject.toml）
if (-not (Test-Path "pyproject.toml")) {
    Write-Error "请在后端项目根目录执行本脚本（未找到 pyproject.toml）"
    exit 1
}

Write-Host "`n[1/4] 打包源码（不含 .env/.venv/缓存）..." -ForegroundColor Cyan
if (Test-Path $TarName) { Remove-Item $TarName -Force }
tar -czf $TarName app alembic alembic.ini scripts pyproject.toml
if ($LASTEXITCODE -ne 0) { Write-Error "打包失败"; exit 1 }

Write-Host "`n[2/4] 上传到服务器..." -ForegroundColor Cyan
scp -i $SshKey $TarName "${Server}:/tmp/$TarName"
if ($LASTEXITCODE -ne 0) { Write-Error "上传失败"; exit 1 }

Write-Host "`n[3/4] 解压覆盖源码（不触碰 .env / .venv）" -ForegroundColor Cyan
$steps = "cd $RemoteDir && tar -xzf /tmp/$TarName && rm -f /tmp/$TarName"

if ($InstallDeps) {
    Write-Host "     (含依赖安装：.venv/bin/pip install -e .)" -ForegroundColor Yellow
    $steps += " && .venv/bin/pip install -e ."
}
if ($Migrate) {
    Write-Host "     (含数据库迁移：.venv/bin/alembic upgrade head)" -ForegroundColor Yellow
    $steps += " && .venv/bin/alembic upgrade head"
}

Write-Host "`n[4/4] 重启服务 portfolio-backend..." -ForegroundColor Cyan
$steps += " && systemctl restart portfolio-backend && echo DEPLOY_OK"
ssh -i $SshKey $Server $steps
if ($LASTEXITCODE -ne 0) { Write-Error "服务器更新失败"; exit 1 }

if (Test-Path $TarName) { Remove-Item $TarName -Force }

Write-Host "`n后端部署完成！当前服务状态：" -ForegroundColor Green
ssh -i $SshKey $Server "systemctl is-active portfolio-backend; systemctl status portfolio-backend --no-pager -n 3"