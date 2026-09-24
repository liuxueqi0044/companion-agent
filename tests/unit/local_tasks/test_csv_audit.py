"""Real standard-library CSV and exact Decimal output with source references."""

import pytest

from services.local_tasks.csv_audit import audit_csv, validate_result
from services.local_tasks.models import LocalTaskError


HASH = "sha256:" + "a" * 64
HEAD = "item,unit,qty,unit_price,currency\n"


def test_exact_total_unicode_zero_and_quoted_multiline():
    result = audit_csv(HEAD + '"笔\n蓝色",支,2,3.50,CNY\n纸,张,0,0.25,CNY\n', HASH)
    assert result.completeness == "complete"
    assert result.total == "7.00" and result.total_currency == "CNY"
    assert result.rows[1].subtotal == "0.00"
    assert result.rows[0].cells["item"] == "笔\n蓝色"
    assert "physical-lines:2-3" in result.rows[0].source_refs["qty"]
    assert result.rows[1].source_refs["qty"].endswith("physical-lines:4-4")
    assert result.paid_model_calls == 0 and result.requirements_interpretation == "not_run"
    validate_result(result, HEAD + '"笔\n蓝色",支,2,3.50,CNY\n纸,张,0,0.25,CNY\n')


def test_missing_column_partial_and_unknown_values():
    missing = audit_csv("item,unit,qty,currency\n笔,支,2,CNY\n", HASH)
    assert missing.completeness == "unknown" and missing.total is None
    assert [(issue.code, issue.record_index) for issue in missing.issues] == [("missing_column", None)]
    partial = audit_csv(HEAD + "笔,支,2,3.00,CNY\n纸,张,,4.00,CNY\n", HASH)
    assert partial.completeness == "partial" and partial.total is None
    assert partial.currency_subtotals == {"CNY": "6.00"}
    assert partial.rows[1].subtotal is None
    assert partial.issues[0].source == partial.rows[1].source_refs["qty"]


def test_mixed_currency_and_no_inferred_currency():
    mixed = audit_csv(HEAD + "笔,支,2,3,CNY\n纸,张,1,4,USD\n", HASH)
    assert mixed.completeness == "mixed_currency" and mixed.total is None
    assert mixed.currency_subtotals == {"CNY": "6", "USD": "4"}
    unknown = audit_csv(HEAD + "笔,支,2,3,\n", HASH)
    assert unknown.rows[0].subtotal is None and unknown.total is None
    assert unknown.issues[0].column == "currency"


@pytest.mark.parametrize("text,code", [
    (HEAD + '"unclosed,支,1,2,CNY', "invalid_csv"),
    (HEAD + "笔,支,1,2\n", "invalid_csv_shape"),
    (HEAD + "笔,支,1.123456789,2,CNY\n", None),
    (HEAD + "笔,支,1e3,2,CNY\n", None),
])
def test_malformed_or_invalid_numeric(text, code):
    if code:
        with pytest.raises(LocalTaskError, match=code):
            audit_csv(text, HASH)
    else:
        result = audit_csv(text, HASH)
        assert result.completeness == "unknown" and result.total is None
        assert result.issues[0].code == "format"


def test_record_and_cell_limits_and_crlf():
    assert audit_csv(HEAD.replace("\n", "\r\n") + "笔,支,1,2,CNY\r\n", HASH).total == "2"
    with pytest.raises(LocalTaskError, match="csv_limit"):
        audit_csv(HEAD + ("笔,支,1,2,CNY\n" * 501), HASH)
    with pytest.raises(LocalTaskError, match="csv_limit"):
        audit_csv(HEAD + ("x" * (16 * 1024 + 1)) + ",支,1,2,CNY\n", HASH)
    with pytest.raises(LocalTaskError, match="invalid_csv_shape"):
        audit_csv(HEAD.replace("item,", "item,item,"), HASH)
