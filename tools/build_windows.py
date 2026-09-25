"""Build a local Windows portable release from the already-installed pinned runtimes.

No network, dependency installation, private data or credentials. Output must be new.
"""
from pathlib import Path
import argparse
import hashlib
import json
import shutil
import zipfile

ROOT = Path(__file__).resolve().parents[1]
DONOR = ROOT.parent / 'companion-agent'


def copy_tree(source, target):
    source = source.resolve()
    for file in source.rglob('*'):
        if file.is_symlink() or (hasattr(file, 'is_junction') and file.is_junction()):
            raise RuntimeError('reparse_point_in_release_input')
        if not file.is_file() or '__pycache__' in file.parts or file.suffix in ('.pyc', '.pyo'):
            continue
        if not file.resolve().is_relative_to(source):
            raise RuntimeError('release_input_escape')
        dst = target / file.relative_to(source)
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(file, dst)


def build(output):
    output = output.absolute()
    if output.exists():
        raise RuntimeError('release_output_must_be_new')
    output.mkdir(parents=True)
    for relative in ['services', 'apps/desktop/product', 'apps/desktop/personal-space', 'apps/desktop/native', 'tests/spikes/personal-space/core']:
        copy_tree(ROOT / relative, output / relative)
    (output/'tools').mkdir()
    for name in ['personal_space.mjs', 'load_product_credential.ps1', 'morrow_tray.ps1', 'configure_deepseek.ps1', 'install_morrow.ps1', 'start_morrow.ps1']:
        shutil.copyfile(ROOT/'tools'/name, output/'tools'/name)
    runtime = output/'runtime'
    runtime.mkdir()
    node_source = DONOR/'.local-tools/node-v24.21.0-win-x64'
    for name in ['node.exe', 'LICENSE']:
        shutil.copyfile(node_source/name, runtime/name)
    copy_tree(DONOR/'.local-tools/python-3.13.15', runtime/'python')
    # Copy exactly the Python dependency families imported by the application.
    packages = DONOR/'.venv/Lib/site-packages'
    selected = ['pydantic', 'pydantic_core', 'annotated_types', 'typing_inspection', 'typing_extensions']
    site = runtime/'python/Lib/site-packages'
    site.mkdir(parents=True, exist_ok=True)
    for file in packages.iterdir():
        if any(file.name == name or file.name == name+'.py' or file.name.startswith(name+'-') for name in selected) or file.name.startswith('tzdata'):
            if file.is_dir(): copy_tree(file, site/file.name)
            else: shutil.copyfile(file, site/file.name)
    modules = DONOR/'node_modules'
    queue = ['rolldown', '@rolldown/binding-win32-x64-msvc']
    copied = {}
    while queue:
        name = queue.pop()
        if name in copied: continue
        source = modules/name
        metadata = json.loads((source/'package.json').read_text(encoding='utf-8'))
        copy_tree(source, output/'node_modules'/name)
        copied[name] = {'version': metadata['version'], 'license': metadata.get('license')}
        queue += list(metadata.get('dependencies', {}))
    vue = modules/'vue'
    (runtime/'vue').mkdir()
    for name in ['LICENSE', 'package.json']:
        shutil.copyfile(vue/name, runtime/'vue'/name)
    shutil.copyfile(vue/'dist/vue.runtime.esm-browser.prod.js', runtime/'vue/vue.mjs')
    electron = ROOT/'.local-tools/electron-44.4.4'
    if hashlib.sha256((electron/'electron.zip').read_bytes()).hexdigest() != '47a3097f1e14030c99937a5ff9534446f44cf0c0032b88f2466360bab4ca9cdc':
        raise RuntimeError('electron_distribution_integrity_error')
    # Verify extracted runtime bytes against the pinned distribution, not only its ZIP.
    with zipfile.ZipFile(electron/'electron.zip') as distribution:
        for item in distribution.infolist():
            if not item.is_dir() and (electron/'dist'/item.filename).read_bytes() != distribution.read(item):
                raise RuntimeError('electron_extraction_integrity_error')
    copy_tree(electron/'dist',runtime/'electron')
    copied['electron']={'version':'44.4.4','license':'MIT; Chromium third-party notices included','distribution_sha256':'47a3097f1e14030c99937a5ff9534446f44cf0c0032b88f2466360bab4ca9cdc'}
    configuration = {'format':'morrow.windows/1','node':'runtime/node.exe','python':'runtime/python/python.exe',
                     'vue':'runtime/vue/vue.mjs','bundler':'node_modules/rolldown/dist/index.mjs','electron':'runtime/electron/electron.exe'}
    (output/'runtime.json').write_text(json.dumps(configuration,indent=2),encoding='utf-8')
    (output/'Morrow.cmd').write_text('@echo off\r\nstart "" "%~dp0runtime\\electron\\electron.exe" "%~dp0apps\\desktop\\native\\main.cjs"\r\n',encoding='utf-8')
    (output/'Install.cmd').write_text('@echo off\r\npwsh.exe -NoProfile -File "%~dp0tools\\install_morrow.ps1"\r\n',encoding='utf-8')
    (output/'README.txt').write_text('Morrow Windows x64 local alpha\nWindows 10/11. PowerShell 7 (pwsh) is required for install and encrypted DeepSeek credentials.\nRun Install.cmd to install for the current user, or Morrow.cmd for portable use.\nData: %LOCALAPPDATA%/Morrow/data; credentials stay under the current Windows user.\nConfigure DeepSeek from the tray, then restart. Closing the window keeps Morrow running; Exit in the tray stops its owned service.\nTray recovery resets window form and opens trusted interface management. No startup registration.\nPersonal SQL tools run on explicitly supplied text/CSV; generated source artifacts are downloads, not arbitrary executable programs.\nUnsigned alpha. Renderer sandbox, IPC restrictions and external HTTP blocking are defense in depth, not a universal hostile-code sandbox.\n',encoding='utf-8')
    files = []
    for file in sorted(output.rglob('*')):
        if file.is_file():
            data=file.read_bytes();files.append({'path':file.relative_to(output).as_posix(),'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()})
    (output/'release-manifest.json').write_text(json.dumps({'format':'morrow-release/1','packages':copied,'files':files},indent=2),encoding='utf-8')
    archive = output.with_suffix('.zip')
    if archive.exists(): raise RuntimeError('release_archive_exists')
    with zipfile.ZipFile(archive,'x',compression=zipfile.ZIP_DEFLATED,compresslevel=6) as z:
        for file in sorted(output.rglob('*')):
            if file.is_file(): z.write(file,output.name+'/'+file.relative_to(output).as_posix())
    print(json.dumps({'output':str(output),'archive':str(archive),'files':len(files),'bytes':archive.stat().st_size}))


if __name__ == '__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--output',type=Path,required=True)
    build(parser.parse_args().output)
