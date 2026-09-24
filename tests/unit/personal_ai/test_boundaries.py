"""Missing references, busy locks, path guards and bounded JSON failure modes."""

from __future__ import annotations

from datetime import datetime, timezone
from concurrent.futures import ThreadPoolExecutor
import os
from pathlib import Path
import sqlite3
import subprocess
from uuid import uuid4

import pytest

from services.personal_ai.models import ChangeRequest, PersonalAIError
from services.personal_ai.repository import SQLitePersonalAIRepository
import tools.personal_ai as cli


NOW = datetime(2026, 3, 1, tzinfo=timezone.utc)


def _fresh(folder: Path) -> SQLitePersonalAIRepository:
    folder.mkdir()
    store = SQLitePersonalAIRepository(folder / "profile.sqlite3")
    store.bootstrap(NOW)
    return store


@pytest.mark.parametrize("damage", ["missing_head", "invalid_preferences", "wrong_marker", "extra_table"])
def test_valid_sqlite_with_broken_application_relations_requires_recovery(tmp_path: Path,
                                                                           damage: str) -> None:
    store = _fresh(tmp_path / damage)
    with sqlite3.connect(store.db_path) as connection:
        if damage == "missing_head":
            connection.execute("PRAGMA foreign_keys=OFF")
            connection.execute("UPDATE profile SET head_revision=999")
        elif damage == "invalid_preferences":
            connection.execute("UPDATE revisions SET preferences_json=? WHERE revision=1",
                               ('{"ai_name":"\\ud800"}',))
        elif damage == "wrong_marker":
            connection.execute("UPDATE metadata SET value='unknown-format'")
        else:
            connection.execute("CREATE TABLE unrelated(x TEXT)")
    before = store.db_path.read_bytes()
    for action in [store.read, lambda: store.bootstrap(NOW)]:
        with pytest.raises(PersonalAIError, match="recovery_required"):
            action()
    assert store.db_path.read_bytes() == before


def test_bounded_sqlite_busy_preserves_head_and_history(tmp_path: Path) -> None:
    store = _fresh(tmp_path / "busy")
    connection = sqlite3.connect(store.db_path, isolation_level=None)
    connection.execute("BEGIN IMMEDIATE")
    try:
        writer = SQLitePersonalAIRepository(store.db_path, timeout_seconds=0.03)
        request = ChangeRequest.model_validate({"expected_revision": 1, "command_id": str(uuid4()),
                                                "changes": {"ai_name": "Mira"}})
        with pytest.raises(PersonalAIError, match="busy"):
            writer.change(request, NOW)
    finally:
        connection.rollback()
        connection.close()
    assert SQLitePersonalAIRepository(store.db_path).read().revision == 1


def test_json_size_duplicate_key_and_non_utf8_are_classified() -> None:
    for raw in [b"\xff", b'{"command":"read","command":"bootstrap"}',
                b"[1,2]", b"x" * (cli.MAX_INPUT + 1)]:
        with pytest.raises(PersonalAIError, match="invalid_request"):
            cli._parse_input(raw)
    with pytest.raises(PersonalAIError, match="response_too_large"):
        cli._response({"large": "x" * cli.MAX_OUTPUT})


def test_fixed_path_guard_rejects_real_symlink_when_supported(tmp_path: Path,
                                                              monkeypatch: pytest.MonkeyPatch) -> None:
    target = tmp_path / "target"
    target.mkdir()
    linked = tmp_path / "linked"
    try:
        os.symlink(target, linked, target_is_directory=True)
    except OSError:
        pytest.skip("local Windows policy does not permit creating this test symlink")
    monkeypatch.setattr(cli, "DATA_ROOT", linked)
    monkeypatch.setattr(cli, "DB_FILE", linked / "personal_ai.sqlite3")
    with pytest.raises(PersonalAIError, match="recovery_required"):
        cli._guard_fixed_path(create_root=False)


def test_fixed_data_directory_creation_is_safe_under_two_local_bootstraps(
        tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    data_root = tmp_path / "local-state"
    monkeypatch.setattr(cli, "DATA_ROOT", data_root)
    monkeypatch.setattr(cli, "DB_FILE", data_root / "personal_ai.sqlite3")
    with ThreadPoolExecutor(max_workers=2) as pool:
        assert list(pool.map(cli._guard_fixed_path, [True, True])) == [None, None]
    assert data_root.is_dir() and not cli.DB_FILE.exists()


@pytest.mark.skipif(os.name != "nt", reason="Windows directory junction regression")
def test_fixed_path_guard_rejects_real_windows_junction(tmp_path: Path,
                                                        monkeypatch: pytest.MonkeyPatch) -> None:
    target = tmp_path / "target"
    target.mkdir()
    linked = tmp_path / "junction"
    created = subprocess.run(["cmd", "/c", "mklink", "/J", str(linked), str(target)],
                             capture_output=True, timeout=5)
    if created.returncode != 0:
        pytest.skip("local Windows policy does not permit creating a test junction")
    assert os.path.isjunction(linked)
    monkeypatch.setattr(cli, "DATA_ROOT", linked)
    monkeypatch.setattr(cli, "DB_FILE", linked / "personal_ai.sqlite3")
    with pytest.raises(PersonalAIError, match="recovery_required"):
        cli._guard_fixed_path(create_root=False)
