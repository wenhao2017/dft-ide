import argparse
import json
import shutil
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def run(command: list[str], cwd: Path = ROOT) -> None:
    print(f"> {' '.join(command)}")
    subprocess.run(command, cwd=cwd, check=True)


def copy_tree(source: Path, target: Path) -> None:
    if target.exists():
        shutil.rmtree(target)
    shutil.copytree(source, target)


def find_code_cli(vscode_dir: Path) -> Path:
    candidates = [
        vscode_dir / "bin" / "code.cmd",
        vscode_dir / "bin" / "code",
        vscode_dir / "Code.exe",
        vscode_dir / "code",
    ]
    for candidate in candidates:
        if candidate.exists():
            return candidate
    raise FileNotFoundError(f"Cannot find VS Code CLI under {vscode_dir}")


def find_latest_vsix() -> Path:
    vsix_files = sorted(ROOT.glob("*.vsix"), key=lambda item: item.stat().st_mtime, reverse=True)
    if not vsix_files:
        raise FileNotFoundError("No VSIX file found in project root")
    return vsix_files[0]


def build_vsix(skip_vsix: bool, existing_vsix: str | None) -> Path:
    if existing_vsix:
        vsix = Path(existing_vsix).resolve()
        if not vsix.exists():
            raise FileNotFoundError(vsix)
        return vsix

    if not skip_vsix:
        run(["npm", "install"])
        run(["npm", "run", "compile"])
        run(["npx", "@vscode/vsce", "package"])

    return find_latest_vsix()


def write_settings(output_dir: Path, api_base: str) -> None:
    user_dir = output_dir / "data" / "user-data" / "User"
    user_dir.mkdir(parents=True, exist_ok=True)

    settings = {
        "workbench.startupEditor": "none",
        "window.commandCenter": False,
        "workbench.layoutControl.enabled": False,
        "breadcrumbs.enabled": False,
        "dftIde.layout.autoApply": True,
        "dftIde.layout.hideMenuBar": True,
        "dftIde.layout.hideActivityBar": True,
        "dftIde.apiBase": api_base,
    }

    (user_dir / "settings.json").write_text(
        json.dumps(settings, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def write_launcher(output_dir: Path) -> None:
    launcher = """@echo off
setlocal
cd /d "%~dp0"
start "" "%~dp0Code.exe"
"""
    (output_dir / "启动 DFT IDE.bat").write_text(launcher, encoding="utf-8")


def install_extension(output_dir: Path, vsix: Path) -> None:
    cli = find_code_cli(output_dir)
    run([str(cli), "--install-extension", str(vsix), "--force"], cwd=output_dir)


def main() -> None:
    parser = argparse.ArgumentParser(description="Package DFT IDE with a portable VS Code distribution.")
    parser.add_argument("--vscode-source", required=True, help="Path to extracted VS Code ZIP directory.")
    parser.add_argument("--output", required=True, help="Output directory for the packaged IDE.")
    parser.add_argument("--api-base", default="", help="Backend API base URL, written to dftIde.apiBase.")
    parser.add_argument("--skip-vsix", action="store_true", help="Skip VSIX build and use latest VSIX in project root.")
    parser.add_argument("--vsix", help="Use an existing VSIX file.")
    args = parser.parse_args()

    vscode_source = Path(args.vscode_source).resolve()
    output = Path(args.output).resolve()

    if not vscode_source.exists():
        raise FileNotFoundError(vscode_source)

    vsix = build_vsix(args.skip_vsix, args.vsix)
    print(f"Using VSIX: {vsix}")

    print(f"Copying VS Code: {vscode_source} -> {output}")
    copy_tree(vscode_source, output)

    (output / "data").mkdir(parents=True, exist_ok=True)
    write_settings(output, args.api_base)
    install_extension(output, vsix)
    write_launcher(output)

    print("")
    print("DFT IDE package is ready:")
    print(output)
    print("Run: 启动 DFT IDE.bat")


if __name__ == "__main__":
    main()
