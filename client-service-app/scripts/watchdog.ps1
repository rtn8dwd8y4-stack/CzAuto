# 服务守护进程：每 15 秒检查三个服务，挂了自动拉起
# 用法: powershell -ExecutionPolicy Bypass -File scripts\watchdog.ps1
# 配置: 从项目根目录的 .env 文件读取（无则使用占位符）

$ErrorActionPreference = 'SilentlyContinue'
$Root = Split-Path -Parent $PSScriptRoot
$CheckInterval = 15

$Services = @(
  @{ Name = 'backend';  Port = 3002; Cmd = 'node_modules\.bin\tsx.cmd src/server/index.ts';    EnvSet = $true },
  @{ Name = 'relay';    Port = 3003; Cmd = 'node_modules\.bin\tsx.cmd relay-server/index.ts';   EnvSet = $false },
  @{ Name = 'frontend'; Port = 3001; Cmd = 'node_modules\.bin\vite.cmd --force';                EnvSet = $false }
)

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
} else {
  Write-Host '[watchdog] 未找到 .env，环境变量使用占位符，服务可能无法正常启动' -ForegroundColor Yellow
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

Write-Host '[watchdog] 守护进程启动，每 15 秒检查一次...' -ForegroundColor Cyan

while ($true) {
  foreach ($svc in $Services) {
    $listening = Get-NetTCPConnection -LocalPort $svc.Port -State Listen -ErrorAction SilentlyContinue
    if (-not $listening) {
      $time = Get-Date -Format 'HH:mm:ss'
      Write-Host "[watchdog] [$($svc.Name)] 端口 $($svc.Port) 未监听，正在重启..." -ForegroundColor Yellow
      $out = Join-Path $Root "logs\$($svc.Name).log"
      $logDir = Join-Path $Root 'logs'
      if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir | Out-Null }
      $cmd = "cd /d $Root && $($svc.Cmd) >> `"$out`" 2>&1"
      Start-Process -FilePath 'cmd.exe' -ArgumentList '/c', $cmd -WindowStyle Minimized
    }
  }
  Start-Sleep -Seconds $CheckInterval
}
