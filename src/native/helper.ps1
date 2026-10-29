# Starts the SKBox helper (controller guide button, controller count, game window / fullscreen handling).
$ErrorActionPreference = 'Stop'
Add-Type -Path (Join-Path $PSScriptRoot 'helper.cs') -Language CSharp
[SkHelper]::Run()
