"""Fixed csv_audit/1: source-preserving, deterministic CSV and Decimal arithmetic."""

from __future__ import annotations

import csv
from decimal import Decimal, localcontext
import io
import re
from typing import Callable

from .models import AuditResult, AuditRow, Issue, LocalTaskError


REQUIRED = ("item", "unit", "qty", "unit_price", "currency")
NUMBER = re.compile(r"(?:0|[1-9][0-9]*)(?:\.[0-9]+)?\Z", re.ASCII)
CURRENCY = re.compile(r"[A-Z]{3}\Z", re.ASCII)


def _money(value: Decimal) -> str:
    return format(value, "f")


def _number(value: str) -> Decimal | None:
    if not NUMBER.fullmatch(value):
        return None
    whole, dot, fraction = value.partition(".")
    if len(whole + fraction) > 28 or len(fraction) > 8:
        return None
    return Decimal(value)


def audit_csv(csv_text: str, input_hash: str,
              checkpoint: Callable[[], None] | None = None) -> AuditResult:
    """Logical record numbers are one-based data records, not physical line numbers."""
    if len(csv_text.encode("utf-8", "strict")) > 256 * 1024:
        raise LocalTaskError("csv_limit")
    check = checkpoint or (lambda: None)
    try:
        reader = csv.reader(io.StringIO(csv_text, newline=""), strict=True)
        header = next(reader, None)
        if not header:
            raise LocalTaskError("invalid_csv_shape")
        if len(header) > 50 or any(len(column.encode("utf-8")) > 16 * 1024
                                   for column in header):
            raise LocalTaskError("csv_limit")
        if any(not column for column in header):
            raise LocalTaskError("invalid_csv_shape")
        if len(set(header)) != len(header):
            raise LocalTaskError("invalid_csv_shape")
        rows: list[AuditRow] = []
        issues: list[Issue] = []
        for name in REQUIRED:
            if name not in header:
                issues.append(Issue(code="missing_column", column=name,
                                    source=f"csv:header:missing:{name}"))
        index = {name: pos for pos, name in enumerate(header)}
        subtotals: dict[str, Decimal] = {}
        start_line = reader.line_num + 1
        with localcontext() as context:
            context.prec = 80
            for record_index, record in enumerate(reader, start=1):
                check()
                if record_index > 500:
                    raise LocalTaskError("csv_limit")
                if len(record) != len(header):
                    raise LocalTaskError("invalid_csv_shape")
                if any(len(cell.encode("utf-8", "strict")) > 16 * 1024 for cell in record):
                    raise LocalTaskError("csv_limit")
                line_range = f"{start_line}-{reader.line_num}"
                cells = dict(zip(header, record, strict=True))
                refs = {name: f"csv:record:{record_index}:column:{name}:physical-lines:{line_range}"
                        for name in header}
                for name in REQUIRED:
                    if name not in index:
                        continue
                    value = cells[name]
                    code = None
                    if not value.strip():
                        code = "empty_value"
                    elif name in {"qty", "unit_price"} and _number(value) is None:
                        code = "format"
                    elif name == "currency" and not CURRENCY.fullmatch(value):
                        code = "format"
                    if code:
                        issues.append(Issue(code=code, column=name, record_index=record_index,
                                            source=refs[name]))
                qty = _number(cells["qty"]) if "qty" in index else None
                price = _number(cells["unit_price"]) if "unit_price" in index else None
                currency = cells.get("currency")
                if currency is not None and not CURRENCY.fullmatch(currency):
                    currency = None
                subtotal = None
                formula = None
                if qty is not None and price is not None and currency is not None:
                    amount = qty * price
                    subtotal = _money(amount)
                    subtotals[currency] = subtotals.get(currency, Decimal(0)) + amount
                    formula = (f"{refs['qty']} * {refs['unit_price']} = {subtotal} {currency} "
                               f"(currency {refs['currency']})")
                rows.append(AuditRow(record_index=record_index, cells=cells, source_refs=refs,
                                     subtotal=subtotal, currency=currency, formula=formula))
                start_line = reader.line_num + 1
        check()
    except (csv.Error, UnicodeError) as exc:
        raise LocalTaskError("invalid_csv") from exc
    if len(subtotals) > 1:
        completeness = "mixed_currency"
    elif not rows or not subtotals:
        completeness = "unknown"
    elif issues or any(row.subtotal is None for row in rows):
        completeness = "partial"
    else:
        completeness = "complete"
    currency_subtotals = {currency: _money(amount) for currency, amount in sorted(subtotals.items())}
    total_currency = next(iter(currency_subtotals)) if completeness == "complete" else None
    total = currency_subtotals[total_currency] if total_currency is not None else None
    return AuditResult(input_hash=input_hash, headers=header, rows=rows, issues=issues,
                       currency_subtotals=currency_subtotals, total=total,
                       total_currency=total_currency, completeness=completeness)


def validate_result(result: AuditResult, csv_text: str) -> None:
    """Rebuild from the stored immutable source before a completion can be published."""
    expected = audit_csv(csv_text, result.input_hash)
    if result != expected:
        raise LocalTaskError("invalid_result")
