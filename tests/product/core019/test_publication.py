from pathlib import Path
import importlib.util
import pytest

ROOT = Path(__file__).resolve().parents[3]
spec = importlib.util.spec_from_file_location('published_builder', ROOT/'tools/build_windows.py')
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)

def test_default_source_copy_uses_invitation_profile(tmp_path):
    builder.copy_ui(tmp_path)
    ui=tmp_path/'apps/desktop/personal-space'
    assert not (ui/'characters').exists() and not (ui/'whale-room.mjs').exists()
    assert '"form"' in (ui/'starter-config.mjs').read_text()

def test_nonredistributable_preview_fails_before_writing(tmp_path):
    output=tmp_path/'unused'
    with pytest.raises(RuntimeError,match='local_preview_artwork_not_in_source_snapshot'):
        builder.build(output,invitation=False)
    assert not output.exists()
