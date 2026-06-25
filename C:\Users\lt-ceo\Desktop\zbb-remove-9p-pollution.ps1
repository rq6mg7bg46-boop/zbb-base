# ============================================================
# 删除 9P mount 污染的 2 个 .ps1（仓库根目录下字面 Windows 路径文件名）
# 路径： D:\projects\project_coze0520\C:\Users\...\zbb-*.ps1
# 跑前先看 git status 确认；删完再 git status 确认 untracked 消失
# ============================================================
$ErrorActionPreference = 'Stop'
Set-Location 'D:\projects\project_coze0520'

Write-Host '=== 删前 untracked .ps1 列表（git 视角）==='
git ls-files --others --exclude-standard -- '*.ps1'
Write-Host ''

Write-Host '=== 删前 untracked .ps1 列表（PowerShell Get-ChildItem 视角）==='
Get-ChildItem -File -Filter '*.ps1' | Where-Object { $_.Name -like '*zbb-*.ps1' -or $_.Name -like 'C:*' } | Select-Object FullName, Name, Length | Format-Table -AutoSize
Write-Host ''

# 通过 git ls-files 拿 PowerShell 视角真实文件路径，逐个删
$untracked = git ls-files --others --exclude-standard -- '*.ps1'
foreach ($f in $untracked) {
    Write-Host "DELETING: [$f]"
    Remove-Item -LiteralPath $f -Force -Verbose
}

Write-Host ''
Write-Host '=== 删后 git status ==='
git status --short
Write-Host ''
Write-Host '=== 完成。如果上面还有 untracked .ps1，把它的 FullName 贴给铁子 ==='