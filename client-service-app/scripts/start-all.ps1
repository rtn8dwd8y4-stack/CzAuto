# 一键启动三个服务（前端 3001 / 后端 3002 / relay 3003）
# 用法: powershell -ExecutionPolicy Bypass -File scripts\start-all.ps1
# 配置: 从项目根目录的 .env 文件读取（无则使用占位符，需手动设置）

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot

# 读取 .env 文件（key=value 格式，忽略 # 注释）
$envFile = Join-Path $Root '.env'
if (Test-Path $envFile) {
  Get-Content $envFile | Where-Object { $_ -match '^\s*[A-Za-z_][A-Za-z0-9_]*=' } | ForEach-Object {
    $line = $_.Trim()
    $idx = $line.IndexOf('=')
    $key = $line.Substring(0, $idx).Trim()
    $val = $line.Substring($idx + 1).Trim().Trim('"').Trim("'")
    [Environment]::SetEnvironmentVariable($key, $val, 'Process')
  }
  Write-Host "[start-all] 已从 .env 加载配置" -ForegroundColor Green
} else {
  Write-Host "[start-all] 未找到 .env，使用默认本地配置" -ForegroundColor Yellow
  # 本地开发默认值（不含真实密码，仅占位）
  $env:INBOUND_IMAP_HOST = 'CHANGE_ME'
  $env:INBOUND_IMAP_PORT = '993'
  $env:INBOUND_IMAP_USER = 'CHANGE_ME'
  $env:INBOUND_IMAP_PASS = 'CHANGE_ME'
  $env:INBOUND_ALLOWED_SENDERS = 'CHANGE_ME'
  $env:SMTP_HOST = 'CHANGE_ME'
  $env:SMTP_PORT = '465'
  $env:SMTP_USER = 'CHANGE_ME'
  $env:SMTP_PASS = 'CHANGE_ME'
  $env:SMTP_FROM = 'CHANGE_ME'
  $env:IMAP_HOST = 'CHANGE_ME'
  $env:IMAP_PORT = '993'
  $env:IMAP_USER = 'CHANGE_ME'
  $env:IMAP_PASS = 'CHANGE_ME'
  $env:SUPPORT_EMAIL = 'CHANGE_ME'
  $env:FALLBACK_EMAIL = 'CHANGE_ME'
  $env:RELAY_SMTP_HOST = 'CHANGE_ME'
  $env:RELAY_SMTP_PORT = '465'
  $env:RELAY_SMTP_USER = 'CHANGE_ME'
  $env:RELAY_SMTP_PASS = 'CHANGE_ME'
  $env:RELAY_TO = 'CHANGE_ME'
  $env:RELAY_SMTP_FROM = 'CHANGE_ME'
  $env:RELAY_PORT = '3003'
}

$env:ALLOWED_ORIGINS = 'http://localhost:3001,http://localhost:3002'

$LogDir = Join-Path $Root 'logs'
if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir | Out-Null }

$Procs = @(
  @{ Name = 'backend'; Port = 3002; Cmd = 'node_modules\.bin\tsx.cmd src/server/index.ts'; Log = Join-Path $LogDir 'backend.log' },
  @{ Name = 'relay';   Port = 3003; Cmd = 'node_modules\.bin\tsx.cmd relay-server/index.ts';   Log = Join-Path $LogDir 'relay.log' },
  @{ Name = 'frontend'; Port = 3001; Cmd = 'node_modules\.bin\vite.cmd --force';                Log = Join-Path $LogDir 'vite.log' }
)

foreach ($p in $Procs) {
  $exists = Get-NetTCPConnection -LocalPort $p.Port -State Listen -ErrorAction SilentlyContinue
  if ($exists) {
    Write-Host "[$($p.Name)] 端口 $($p.Port) 已在监听，跳过" -ForegroundColor Yellow
  } else {
    $out = "$($p.Log).out"
    Start-Process -FilePath 'cmd.exe' -ArgumentList "/c", "cd /d $Root && $($p.Cmd) >> `"$out`" 2>&1" -WindowStyle Minimized
    Write-Host "[$($p.Name)] 已启动 (端口 $($p.Port), 日志: $out)" -ForegroundColor Green
  }
}

Write-Host ''
Write-Host '服务清单:' -ForegroundColor Cyan
Write-Host '  前端表单:      http://localhost:3001' -ForegroundColor White
Write-Host '  管理后台:      http://localhost:3002/admin' -ForegroundColor White
Write-Host '  relay 投递员:  http://localhost:3003' -ForegroundColor White
