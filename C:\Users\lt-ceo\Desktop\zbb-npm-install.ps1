# ZBB: pnpm -> npm migration script
# Run in PowerShell (Run as Administrator not required)
# Date: 2026-06-19
# Branch: refactor/notification-monitor @ 66907fb

$ErrorActionPreference = 'Stop'

# 1) Clean pnpm leftovers
Set-Location 'D:\projects\project_coze0520'
Write-Host '[1/4] Removing pnpm lock + workspace + node_modules...' -ForegroundColor Cyan
if (Test-Path 'pnpm-lock.yaml')     { Remove-Item 'pnpm-lock.yaml' -Force }
if (Test-Path 'pnpm-workspace.yaml'){ Remove-Item 'pnpm-workspace.yaml' -Force }
if (Test-Path 'node_modules')        { Remove-Item 'node_modules' -Recurse -Force }
if (Test-Path 'client\node_modules') { Remove-Item 'client\node_modules' -Recurse -Force }
if (Test-Path 'server\node_modules') { Remove-Item 'server\node_modules' -Recurse -Force }
Write-Host '  [OK] pnpm leftovers removed' -ForegroundColor Green

# 2) Set env vars
Write-Host '[2/4] Setting JAVA_HOME + ANDROID_HOME + PATH...' -ForegroundColor Cyan
$env:JAVA_HOME  = 'D:\software\Java\jdk-17'
$env:ANDROID_HOME = 'C:\Users\lt-ceo\AppData\Local\Android\Sdk'
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
$env:PATH = 'C:\Windows\System32;D:\software\Java\jdk-17\bin;C:\Users\lt-ceo\AppData\Local\Android\Sdk\platform-tools;' + $env:PATH
Write-Host '  [OK] env set' -ForegroundColor Green

# 3) npm install (workspaces: client, server)
Write-Host '[3/4] npm install (this takes 5-10 min, do not interrupt)...' -ForegroundColor Cyan
npm install --legacy-peer-deps
if ($LASTEXITCODE -ne 0) {
  Write-Host '  [FAIL] npm install failed' -ForegroundColor Red
  exit 1
}
Write-Host '  [OK] npm install done' -ForegroundColor Green

# 4) Build verification
Write-Host '[4/4] gradle assembleDebug (x86_64 only, takes 5-15 min)...' -ForegroundColor Cyan
Set-Location 'D:\projects\project_coze0520\client\android'
& '.\gradlew.bat' :app:assembleDebug --no-daemon -PreactNativeArchitectures=x86_64
if ($LASTEXITCODE -ne 0) {
  Write-Host '  [FAIL] gradle build failed' -ForegroundColor Red
  exit 1
}
Write-Host ''
Write-Host '[DONE] build OK. APK at client\android\app\build\outputs\apk\debug\app-debug.apk' -ForegroundColor Green
Write-Host 'Next: adb -s emulator-5554 install -r app\build\outputs\apk\debug\app-debug.apk' -ForegroundColor Yellow
