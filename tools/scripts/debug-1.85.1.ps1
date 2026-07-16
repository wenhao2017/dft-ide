$ErrorActionPreference = "Stop"

$Root = (Resolve-Path "$PSScriptRoot\..\..").Path

$CodeExe = Join-Path $Root "tools\vscode-1.85.1\Code.exe"

$UserDataDir = Join-Path $Root ".vscode-test\user-data-1.85.1"
$ExtensionsDir = Join-Path $Root ".vscode-test\extensions-1.85.1"

if (!(Test-Path $CodeExe)) {
    throw "Code.exe not found: $CodeExe"
}

$CodeArgs = @(
    "--extensionDevelopmentPath=$Root"
    "--user-data-dir=$UserDataDir"
    "--extensions-dir=$ExtensionsDir"
    "--inspect-extensions=9333"
    "--disable-workspace-trust"
    "--enable-proposed-api=w00445630.dft-ide"
    "--new-window"
)

& $CodeExe @CodeArgs
