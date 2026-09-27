"""Build a local Windows portable release from the already-installed pinned runtimes.

No network, dependency installation, private data or credentials. Output must be new.
"""
from pathlib import Path
import argparse
import hashlib
import json
import shutil
import zipfile
import stat
import re
import os

ROOT = Path(__file__).resolve().parents[1]
DONOR = Path(os.environ.get('PERSONAL_AI_RUNTIME_ROOT', ROOT)).absolute()
RELEASE = {'version': '0.18.0-alpha.1', 'milestone': 'CORE-018', 'channel': 'local-preview',
           'platform': 'windows-x64', 'redistribution': 'pending-character-artwork-permission',
           'interfaces': ['whale', 'form', 'atelier']}
INVITATION = {**RELEASE, 'version': '0.19.0-alpha.1', 'milestone': 'CORE-019',
              'channel': 'invitation-alpha', 'redistribution': 'character-artwork-excluded',
              'interfaces': ['form', 'atelier'], 'signed': False}


def plain_path(value):
    """Check ancestors before resolving, including a linked source root itself."""
    value = value.absolute()
    for part in (value, *value.parents):
        try:
            info = part.lstat()
        except FileNotFoundError:
            continue
        if stat.S_ISLNK(info.st_mode) or getattr(info, 'st_file_attributes', 0) & 0x400:
            raise RuntimeError('reparse_point_in_release_path')
    return value


def copy_tree(source, target, excluded=()):
    source = plain_path(source).resolve()
    plain_path(target)
    for file in source.rglob('*'):
        if any(file.relative_to(source) == Path(p) or Path(p) in file.relative_to(source).parents for p in excluded):
            continue
        if file.is_symlink() or (hasattr(file, 'is_junction') and file.is_junction()):
            raise RuntimeError('reparse_point_in_release_input')
        if not file.is_file() or '__pycache__' in file.parts or file.suffix in ('.pyc', '.pyo'):
            continue
        if not file.resolve().is_relative_to(source):
            raise RuntimeError('release_input_escape')
        dst = target / file.relative_to(source)
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(file, dst)


def copy_ui(output, invitation=True, starter='form'):
    target = output/'apps/desktop/personal-space'
    copy_tree(ROOT/'apps/desktop/personal-space', target,
              ('characters', 'whale-room.mjs', 'companion-motion.mjs') if invitation else ())
    if invitation:
        if starter not in INVITATION['interfaces']:
            raise RuntimeError('invalid_invitation_starter')
        (target/'starter-config.mjs').write_text(
            'export const initialStarter = '+json.dumps(starter)+'\nexport const availableStarterIds = ["form","atelier"]\n', encoding='utf-8')
        (target/'starter-character.mjs').write_text(
            'export const WhaleRoom = null\nexport const whaleCharacter = () => null\nexport const hasCharacter = false\n', encoding='utf-8')


def copy_node_dependencies(output, modules, names):
    """Copy the production dependency closure, including each upstream license."""
    queue = list(names)
    copied = {}
    while queue:
        name = queue.pop()
        if name in copied:
            continue
        source = modules/name
        metadata = json.loads((source/'package.json').read_text(encoding='utf-8'))
        copy_tree(source, output/'node_modules'/name)
        copied[name] = {'version':metadata['version'], 'license':metadata.get('license')}
        queue += list(metadata.get('dependencies', {}))
    return copied



def build(output, invitation=True, starter='form'):
    if not invitation:
        raise RuntimeError('local_preview_artwork_not_in_source_snapshot')
    release = {**INVITATION}
    if invitation:
        if starter not in release['interfaces']: raise RuntimeError('invalid_invitation_starter')
        release['initial_interface'] = starter
    output = plain_path(output)
    archive = Path(str(output) + '.zip')
    if output.exists():
        raise RuntimeError('release_output_must_be_new')
    plain_path(archive)
    if archive.exists():
        raise RuntimeError('release_archive_exists')
    output.mkdir(parents=True)
    for relative in ['services', 'apps/desktop/product', 'apps/desktop/native', 'tests/spikes/personal-space/core']:
        copy_tree(ROOT / relative, output / relative)
    copy_ui(output, invitation, starter)
    (output/'tools').mkdir()
    for name in ['personal_space.mjs', 'load_product_credential.ps1', 'configure_deepseek.ps1', 'install_morrow.ps1', 'uninstall_morrow.ps1', 'release_paths.ps1', 'start_morrow.ps1', 'check_morrow.ps1', 'verify_windows_release.mjs']:
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
    # Runtime binaries may come from an explicit donor; application dependencies
    # come from this checkout's installation and committed lockfile.
    modules = ROOT/'node_modules'
    copied = copy_node_dependencies(output, modules, ['rolldown', '@rolldown/binding-win32-x64-msvc', '@modelcontextprotocol/client', 'yaml', 'ajv'])
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
    (output/'release-info.json').write_text(json.dumps(release,indent=2),encoding='utf-8')
    (output/'Morrow.cmd').write_text('@echo off\r\nstart "" "%~dp0runtime\\electron\\electron.exe" "%~dp0apps\\desktop\\native\\main.cjs"\r\n',encoding='utf-8')
    (output/'Install.cmd').write_text('@echo off\r\nsetlocal\r\nset "PSModulePath=%SystemRoot%\\System32\\WindowsPowerShell\\v1.0\\Modules"\r\n"%SystemRoot%\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "%~dp0tools\\install_morrow.ps1"\r\nif errorlevel 1 pause\r\n',encoding='utf-8')
    (output/'Uninstall.cmd').write_text('@echo off\r\nsetlocal\r\nset "PSModulePath=%SystemRoot%\\System32\\WindowsPowerShell\\v1.0\\Modules"\r\n"%SystemRoot%\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -NoProfile -ExecutionPolicy Bypass -STA -File "%~dp0tools\\uninstall_morrow.ps1"\r\nif errorlevel 1 pause\r\n',encoding='utf-8')
    (output/'Check.cmd').write_text('@echo off\r\nsetlocal\r\nset "PSModulePath=%SystemRoot%\\System32\\WindowsPowerShell\\v1.0\\Modules"\r\n"%SystemRoot%\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "%~dp0tools\\check_morrow.ps1"\r\npause\r\n',encoding='utf-8')
    guide = ROOT/('docs/product/INVITATION-ALPHA.md' if invitation else 'docs/product/LOCAL-ALPHA.md')
    (output/'README.txt').write_text('Morrow '+release['version']+' | '+release['channel']+'\n\n'
        'Windows 10/11 x64. Node, Python, Vue and Electron are included.\n'
        'Run Morrow.cmd for portable use or Install.cmd for current-user installation.\n'
        'Windows built-in PowerShell is used; PowerShell 7 is not required.\n'
        +('Community character artwork is excluded from this invitation package.\n\n' if invitation else 'Community whale artwork: local prototype only. Read ARTWORK-NOTICE.md.\n\n')+guide.read_text(encoding='utf-8'),encoding='utf-8-sig')
    if not invitation:
        shutil.copyfile(ROOT/'apps/desktop/personal-space/characters/NOTICE.md',output/'ARTWORK-NOTICE.md')
    (output/'docs/product').mkdir(parents=True)
    for name in [('INVITATION-ALPHA.md' if invitation else 'LOCAL-ALPHA.md'),'GOAL-MODE.md','TRIAL-CHECKLIST.md']:
        shutil.copyfile(ROOT/'docs/product'/name,output/'docs/product'/name)
    files = []
    for file in sorted(output.rglob('*')):
        if file.is_file():
            data=file.read_bytes();files.append({'path':file.relative_to(output).as_posix(),'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()})
    if invitation:
        for item in files:
            if '/characters/' in item['path'] or item['path'].endswith('/whale-room.mjs'):
                raise RuntimeError('character_asset_in_invitation')
            if item['path'].endswith(('.mjs','.js','.css','.html')) and re.search(rb'data:image/png;base64,[A-Za-z0-9+/]{20}', (output/item['path']).read_bytes()):
                raise RuntimeError('unexpected_embedded_image_in_invitation: '+item['path'])
    (output/'release-manifest.json').write_text(json.dumps({'format':'morrow-release/1','release':release,'packages':copied,'files':files},indent=2),encoding='utf-8')
    with zipfile.ZipFile(archive,'x',compression=zipfile.ZIP_DEFLATED,compresslevel=6) as z:
        for file in sorted(output.rglob('*')):
            if file.is_file(): z.write(file,output.name+'/'+file.relative_to(output).as_posix())
    print(json.dumps({'output':str(output),'archive':str(archive),'files':len(files),'bytes':archive.stat().st_size}))


if __name__ == '__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--output',type=Path,required=True)
    parser.add_argument('--invitation',action='store_true',default=True,help='Invitation profile is the only profile in this source snapshot');parser.add_argument('--starter',choices=['form','atelier'],default='form')
    args=parser.parse_args();build(args.output,args.invitation,args.starter)
