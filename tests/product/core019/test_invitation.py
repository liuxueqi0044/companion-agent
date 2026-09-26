import hashlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import pytest

ROOT = Path(__file__).resolve().parents[3]
spec = importlib.util.spec_from_file_location('core018_release_fixtures', ROOT/'tests/product/core018/test_release.py')
old = importlib.util.module_from_spec(spec)
spec.loader.exec_module(old)
package = old.package
pytestmark = pytest.mark.skipif(os.name != 'nt', reason='Windows lifecycle')

def uninstall(root):
    return subprocess.run([str(old.POWERSHELL), '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
                           '-File', str(root/'tools/uninstall_morrow.ps1'), '-ConfirmRemoval'],
                          capture_output=True, encoding='utf-8', errors='replace', timeout=40)

def test_uninstall_preserves_unknown_files_and_personal_data(package, tmp_path):
    source, _, _ = package
    target = tmp_path/'installed 空间'
    assert old.install(source, target).returncode == 0
    (target/'user-note.txt').write_text('keep me')
    personal = tmp_path/'personal-data'; personal.mkdir(); (personal/'memory.txt').write_text('private')
    r = uninstall(target)
    assert r.returncode == 0, r.stderr
    assert not (target/'Morrow.cmd').exists()
    assert (target/'user-note.txt').read_text() == 'keep me'
    assert (personal/'memory.txt').read_text() == 'private'
    assert not (target/'install-receipt.json').exists()

@pytest.mark.parametrize('fault', ['changed_file','changed_manifest','wrong_root','missing_receipt'])
def test_uninstall_refuses_ambiguous_release_without_deleting_anything(package, tmp_path, fault):
    source, _, _ = package; target=tmp_path/'installed'
    assert old.install(source,target).returncode == 0
    receipt=target/'install-receipt.json'
    if fault=='changed_file': (target/'Morrow.cmd').write_text('customized by user')
    elif fault=='changed_manifest': (target/'release-manifest.json').write_text('{}')
    elif fault=='wrong_root':
        data=json.loads(receipt.read_text());data['root']=str(tmp_path);receipt.write_text(json.dumps(data))
    else: receipt.unlink()
    assert uninstall(target).returncode != 0
    assert (target/'Morrow.cmd').exists()
    assert (target/'runtime/node.exe').exists()

def test_uninstall_rejects_junction_before_deletion(package,tmp_path):
    source,_,_=package;target=tmp_path/'installed';assert old.install(source,target).returncode==0
    external=tmp_path/'external';(target/'runtime').rename(external)
    r=subprocess.run([str(old.POWERSHELL),'-NoProfile','-NonInteractive','-Command',
                      'New-Item -ItemType Junction -Path $env:TEST_LINK -Target $env:TEST_TARGET | Out-Null'],
                     env={**os.environ,'TEST_LINK':str(target/'runtime'),'TEST_TARGET':str(external)},capture_output=True)
    assert r.returncode==0
    try:
        result=uninstall(target);assert result.returncode!=0 and 'Reparse points' in result.stderr
        assert (target/'Morrow.cmd').exists() and (external/'node.exe').exists()
    finally: (target/'runtime').rmdir()

def test_invitation_source_has_no_character_bytes_and_retains_replaceable_interfaces(tmp_path):
    old.builder.copy_ui(tmp_path,invitation=True,starter='atelier')
    ui=tmp_path/'apps/desktop/personal-space'
    assert not (ui/'characters').exists() and not (ui/'whale-room.mjs').exists()
    assert 'atelier' in (ui/'starter-config.mjs').read_text()
    assert 'hasCharacter = false' in (ui/'starter-character.mjs').read_text()
    assert (ui/'interface-host.mjs').exists() and (ui/'starters.mjs').exists()
    for file in ui.rglob('*'):
        if file.is_file(): assert b'data:image/png;base64,' not in file.read_bytes(), file

def test_registration_is_removed_with_its_own_version(package,tmp_path):
    import winreg
    source,_,_=package; target=tmp_path/'registered'
    r=subprocess.run([str(old.POWERSHELL),'-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',str(source/'tools/install_morrow.ps1'),'-Destination',str(target),'-NoShortcut'],capture_output=True,timeout=40)
    assert r.returncode==0,r.stderr
    receipt=json.loads((target/'install-receipt.json').read_text())
    key='Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Morrow-'+receipt['registry_id']
    try:
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER,key) as handle:
            assert winreg.QueryValueEx(handle,'InstallLocation')[0]==str(target)
        result=uninstall(target); assert result.returncode==0,result.stderr
        with pytest.raises(FileNotFoundError):winreg.OpenKey(winreg.HKEY_CURRENT_USER,key)
    finally:
        try:winreg.DeleteKey(winreg.HKEY_CURRENT_USER,key)
        except FileNotFoundError:pass

def test_version_dots_do_not_truncate_archive_filename(tmp_path):
    output=tmp_path/'Morrow-0.19.0-alpha.1-Invite'
    archive=Path(str(output)+'.zip');archive.write_bytes(b'preserve')
    with pytest.raises(RuntimeError,match='release_archive_exists'):old.builder.build(output,invitation=True)
    assert not output.exists() and archive.read_bytes()==b'preserve'
