$ErrorActionPreference = "Stop"

$Root = Resolve-Path "$PSScriptRoot\..\.."

$CodeCmd = Join-Path $Root "tools\vscode-1.85.1\bin\code.cmd"
$UserDataDir = Join-Path $Root ".vscode-test\user-data-1.85.1"
$ExtensionsDir = Join-Path $Root ".vscode-test\extensions-1.85.1"
$VsixDir = Join-Path $Root "offline-vsix"

New-Item -ItemType Directory -Force -Path $UserDataDir | Out-Null
New-Item -ItemType Directory -Force -Path $ExtensionsDir | Out-Null

Get-ChildItem "$VsixDir\*.vsix" | ForEach-Object {
    Write-Host "Installing VSIX $($_.Name) ..."

    & $CodeCmd `
        --user-data-dir "$UserDataDir" `
        --extensions-dir "$ExtensionsDir" `
        --install-extension "$($_.FullName)" `
        --force

    if ($LASTEXITCODE -ne 0) {
        throw "Failed to install $($_.Name)"
    }
}

Write-Host ""
Write-Host "Installed extensions:"
& $CodeCmd `
    --extensions-dir "$ExtensionsDir" `
    --list-extensions

Write-Host ""
Write-Host "Done."
