"""Existing Agent/model adapters implement this small application boundary."""
from typing import Protocol
from dataclasses import dataclass
from .models import ProductError


@dataclass(frozen=True)
class ProviderReply:
    decision: dict
    # Set only by a trusted adapter from actual displayable provider metadata, never generated JSON.
    displayable_summary: str | None = None


class ModelPort(Protocol):
    def respond(self, context: dict) -> ProviderReply | dict: ...
    def reassess(self, context: dict) -> dict: ...


class UnconfiguredModel:
    def respond(self, context):
        raise ProductError('model_not_configured')

    def reassess(self, context):
        raise ProductError('model_not_configured')
