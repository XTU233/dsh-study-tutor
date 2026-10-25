# 学习教练插件 · 安装 / 停用 / 回滚
#
# 用法（在**已完全退出** DSH 桌面端的 PowerShell 里跑）：
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1 -Action status
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1 -Action install
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1 -Action disable
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1 -Action rollback
#
# 安全约定：
#   * 只改 %USERPROFILE%\.dsh\profiles\<Profile>\ 下的两处：
#       package.json 的 dependencies（加/删一条 link: 依赖）
#       cordis.patch.yml（加/删一条 study-tutor 注册项）
#   * 每次改动前把原文件备份到 <Profile>\.study-tutor-backup\<时间戳>\，
#     rollback 直接还原备份，不猜测。
#   * 绝不碰会话数据、不碰其它插件、不删任何用户文件。

param(
  [ValidateSet('status', 'install', 'disable', 'rollback')]
  [string]$Action = 'status',
  [string]$Profile = 'desktop',
  # Defaults to the directory this script lives in, so the repo works from any
  # clone location without editing a hard-coded path.
  [string]$PluginDir = $PSScriptRoot
)

$ErrorActionPreference = 'Stop'

$home_ = if ($env:DSH_HOME) { $env:DSH_HOME } else { Join-Path $env:USERPROFILE '.dsh' }
$profileDir = Join-Path $home_ "profiles\$Profile"
$manifest = Join-Path $profileDir 'package.json'
$patch = Join-Path $profileDir 'cordis.patch.yml'
$backupRoot = Join-Path $profileDir '.study-tutor-backup'
$pluginName = '@local/dsh-study-tutor'

function Write-Step($text) { Write-Host "== $text" -ForegroundColor Cyan }

function Assert-Profile {
  if (-not (Test-Path $manifest)) {
    throw "找不到 profile 清单：$manifest`n请先启动一次 DSH 桌面版让它初始化 profile。"
  }
}

function New-Backup($label) {
  $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
  $dir = Join-Path $backupRoot "$stamp-$label"
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
  Copy-Item $manifest (Join-Path $dir 'package.json')
  if (Test-Path $patch) { Copy-Item $patch (Join-Path $dir 'cordis.patch.yml') }
  Write-Host "  备份 → $dir"
  return $dir
}

function Set-Utf8($path, $text) {
  # 保留 LF；DSH 的 loader 两者都接受，但保持原样更稳。
  $normalized = $text -replace "`r`n", "`n"
  [System.IO.File]::WriteAllText($path, $normalized, (New-Object System.Text.UTF8Encoding($false)))
}

function Get-Manifest {
  Get-Content $manifest -Raw | ConvertFrom-Json
}

function Save-Manifest($object) {
  Set-Utf8 $manifest ($object | ConvertTo-Json -Depth 20)
}

function Test-Installed {
  if (-not (Test-Path $manifest)) { return $false }
  $doc = Get-Manifest
  return [bool]$doc.dependencies.PSObject.Properties.Name -contains $pluginName
}

function Test-Registered {
  if (-not (Test-Path $patch)) { return $false }
  return [bool](Select-String -Path $patch -Pattern 'id:\s*study-tutor' -Quiet)
}

switch ($Action) {
  'status' {
    Write-Step "profile: $profileDir"
    Write-Step "DSH_HOME: $home_"
    "  插件目录存在 : $(Test-Path $PluginDir)"
    "  已加入依赖   : $(Test-Installed)"
    "  已在 patch 注册: $(Test-Registered)"
    $nodeModules = Join-Path $profileDir "node_modules\@local\dsh-study-tutor"
    "  已链接到 node_modules: $(Test-Path $nodeModules)"
    $backups = if (Test-Path $backupRoot) { (Get-ChildItem $backupRoot -Directory | Measure-Object).Count } else { 0 }
    "  可用备份     : $backups"
  }

  'install' {
    Assert-Profile
    if (-not (Test-Path $PluginDir)) { throw "插件目录不存在：$PluginDir" }
    Write-Step '备份当前 profile'
    New-Backup 'install' | Out-Null
    Write-Step "加入依赖 $pluginName"
    if (-not (Test-Installed)) {
      $doc = Get-Manifest
      $spec = 'link:' + ($PluginDir -replace '\\', '/')
      $doc.dependencies | Add-Member -NotePropertyName $pluginName -NotePropertyValue $spec -Force
      Save-Manifest $doc
      Write-Host "  dependencies += $pluginName : $spec"
    } else {
      Write-Host '  已存在，跳过'
    }
    Write-Step '加入 profile bundles'
    # The package declares `dsh.bundle.patch`, so it is activated as a bundle
    # layer (its own cordis.patch.yml supplies the `insert` row). Adding it
    # only to dependencies would install the code without loading it.
    $doc = Get-Manifest
    $bundles = @($doc.dsh.profile.bundles)
    if ($bundles -notcontains $pluginName) {
      $doc.dsh.profile.bundles = @($bundles + $pluginName)
      Save-Manifest $doc
      Write-Host "  bundles += $pluginName"
    } else {
      Write-Host '  已在 bundles 中，跳过'
    }
    Write-Step '检查 profile 用户层'
    if (Test-Registered) {
      Write-Host '  cordis.patch.yml 里已有 study-tutor 条目（bundle 自带，通常不需要手工再加）'
    } else {
      Write-Host '  未在用户层注册：bundle 自带的 patch 会在加载时提供该条目，属正常。'
    }
    Write-Step '下一步'
    Write-Host '  完全退出并重新启动 DSH 桌面版，插件才会加载。'
    Write-Host '  重启后新开一个会话，会话视图会多出「学习」页签。'
    Write-Host "  出问题时：.\install.ps1 -Action rollback"
  }

  'disable' {
    Assert-Profile
    Write-Step '备份当前 profile'
    New-Backup 'disable' | Out-Null
    Write-Step '停用（只加 disabled，不删依赖）'
    $text = Get-Content $patch -Raw
    if ($text -match '(?m)^\s*- id:\s*study-tutor') {
      # 已有注册项：把 disabled: true 塞到该条目的 config 之前。
      $text = $text -replace "(?m)^(\s*)- id:\s*study-tutor\s*$", "`$1- id: study-tutor`n`$1  disabled: true"
      Set-Utf8 $patch $text
      Write-Host '  已为该条目加上 disabled: true'
    } else {
      Write-Host '  patch 里没有该条目，无需处理'
    }
    Write-Host '  重启 DSH 后生效。'
  }

  'rollback' {
    Assert-Profile
    if (-not (Test-Path $backupRoot)) { throw "没有可回滚的备份：$backupRoot" }
    $latest = Get-ChildItem $backupRoot -Directory | Sort-Object Name -Descending | Select-Object -First 1
    if (-not $latest) { throw "备份目录为空：$backupRoot" }
    Write-Step "回滚到 $($latest.Name)"
    Copy-Item (Join-Path $latest.FullName 'package.json') $manifest -Force
    Write-Host '  已还原 package.json'
    $patchBackup = Join-Path $latest.FullName 'cordis.patch.yml'
    if (Test-Path $patchBackup) {
      Copy-Item $patchBackup $patch -Force
      Write-Host '  已还原 cordis.patch.yml'
    }
    Write-Host '  重启 DSH 后生效。'
  }
}
