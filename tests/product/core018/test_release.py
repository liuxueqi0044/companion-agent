"""Real Windows installer probes, using tiny packages and disposable destinations."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import importlib.util

import pytest

ROOT = Path(__file__).resolve().parents[3]
spec = importlib.util.spec_from_file_location('morrow_release_builder', ROOT/'tools/build_windows.py')
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)
build, copy_tree = builder.build, builder.copy_tree
POWERSHELL = Path(os.environ.get('SystemRoot', 'C:/Windows')) / 'System32/WindowsPowerShell/v1.0/powershell.exe'
pytestmark = pytest.mark.skipif(os.name != 'nt', reason='Windows installation')
REQUIRED = ['Morrow.cmd', 'runtime.json', 'runtime/node.exe', 'runtime/python/python.exe',
            'runtime/electron/electron.exe', 'apps/desktop/native/main.cjs',
            'tools/personal_space.mjs', 'tools/install_morrow.ps1', 'tools/uninstall_morrow.ps1', 'tools/release_paths.ps1']


@pytest.fixture
def package(tmp_path):
    source = tmp_path / 'source with spaces'
    for name in REQUIRED:
        file = source / name
        file.parent.mkdir(parents=True, exist_ok=True)
        if name.endswith('.ps1'):
            shutil.copyfile(ROOT / name, file)
        else:
            file.write_text('synthetic release fixture: ' + name, encoding='utf-8')
    manifest = {'format': 'morrow-release/1', 'files': [
        {'path': name, 'bytes': (source/name).stat().st_size,
         'sha256': hashlib.sha256((source/name).read_bytes()).hexdigest()} for name in REQUIRED]}
    def save():
        (source/'release-manifest.json').write_text(json.dumps(manifest), encoding='utf-8')
    save()
    return source, manifest, save


def install(source, destination):
    return subprocess.run([str(POWERSHELL), '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File',
                           str(source/'tools/install_morrow.ps1'), '-Destination', str(destination), '-NoShortcut', '-NoRegistration'],
                          capture_output=True, encoding='utf-8', errors='replace', timeout=40)


def test_installs_only_inventory_and_preserves_an_existing_release(package, tmp_path):
    source, manifest, _ = package
    (source/'private-unlisted.txt').write_text('never install', encoding='utf-8')
    destination = tmp_path / 'installed 空间 with spaces'
    result = install(source, destination)
    assert result.returncode == 0, result.stderr
    for item in manifest['files']:
        assert (destination/item['path']).read_bytes() == (source/item['path']).read_bytes()
    assert not (destination/'private-unlisted.txt').exists()
    sentinel = destination/'preserve.txt'
    sentinel.write_text('existing user file', encoding='utf-8')
    assert install(source, destination).returncode != 0
    assert sentinel.read_text() == 'existing user file'


@pytest.mark.parametrize('fault', ['same_length_tamper', 'missing_file', 'wrong_length', 'bad_hash',
                                  'duplicate_case', 'traversal', 'absolute', 'backslash', 'ads',
                                  'reserved_name', 'trailing_dot', 'missing_required', 'bad_format', 'not_array'])
def test_invalid_release_is_rejected_before_destination_creation(package, tmp_path, fault):
    source, manifest, save = package
    item = manifest['files'][0]
    if fault == 'same_length_tamper':
        (source/item['path']).write_bytes(b'x' * item['bytes'])
    elif fault == 'missing_file':
        (source/item['path']).unlink()
    elif fault == 'wrong_length': item['bytes'] += 1
    elif fault == 'bad_hash': item['sha256'] = 'broken'
    elif fault == 'duplicate_case': manifest['files'].append({**item, 'path': 'morrow.CMD'})
    elif fault in {'traversal','absolute','backslash','ads','reserved_name','trailing_dot'}:
        item['path'] = {'traversal':'../escape', 'absolute':'C:/escape', 'backslash':'sub\\escape',
                        'ads':'file:stream','reserved_name':'NUL.txt','trailing_dot':'folder./file'}[fault]
    elif fault == 'missing_required': manifest['files'].pop(0)
    elif fault == 'bad_format': manifest['format'] = 'unknown'
    elif fault == 'not_array': manifest['files'] = manifest['files'][0]
    save()
    destination = tmp_path/'must not exist'
    result = install(source, destination)
    assert result.returncode != 0
    expected = {'same_length_tamper':'Release integrity error', 'wrong_length':'Release integrity error',
                'missing_file':'Release missing file', 'bad_hash':'Invalid release file metadata',
                'duplicate_case':'Duplicate or reserved release path', 'missing_required':'Incomplete release',
                'bad_format':'Invalid release manifest', 'not_array':'Invalid release manifest'}.get(fault, 'Invalid release path')
    assert expected in result.stderr, result.stderr
    assert not destination.exists()


def test_source_and_target_junction_ancestors_are_rejected(package, tmp_path):
    source, _, _ = package
    junction = tmp_path/'junction'
    env = {**os.environ, 'MORROW_TEST_LINK':str(junction), 'MORROW_TEST_TARGET':str(source)}
    made = subprocess.run([str(POWERSHELL), '-NoProfile', '-NonInteractive', '-Command',
                           "$ErrorActionPreference='Stop'; New-Item -ItemType Junction -Path $env:MORROW_TEST_LINK -Target $env:MORROW_TEST_TARGET | Out-Null"],
                          env=env, capture_output=True, timeout=20)
    assert made.returncode == 0
    try:
        rejected = install(junction, tmp_path/'rejected-source')
        assert rejected.returncode != 0 and 'Reparse points' in rejected.stderr
        assert not (tmp_path/'rejected-source').exists()
        rejected = install(source, junction/'rejected-target')
        assert rejected.returncode != 0 and 'Reparse points' in rejected.stderr
        assert not (source/'rejected-target').exists()
        with pytest.raises(RuntimeError, match='reparse_point'):
            copy_tree(junction, tmp_path/'not-copied')
    finally:
        # Remove only our junction entry, without recursing into its target.
        junction.rmdir()
    assert (source/'Morrow.cmd').is_file()


def test_build_refuses_existing_archive_before_creating_output(tmp_path):
    output = tmp_path/'release'
    archive = output.with_suffix('.zip')
    archive.write_bytes(b'preserved archive')
    with pytest.raises(RuntimeError, match='release_archive_exists'):
        build(output)
    assert not output.exists()
    assert archive.read_bytes() == b'preserved archive'
