"""Single authority for the private product-core/1 application contract."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
import re
from typing import Annotated, Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import (AfterValidator, BaseModel, ConfigDict, Field, StrictInt,
                      field_validator, model_validator)
from services.local_tasks.models import canonical_uuid, utc, bounded_text
from services.personal_ai.models import PreferenceChanges

ID = Annotated[str, AfterValidator(canonical_uuid)]
UTC = Annotated[datetime, AfterValidator(utc)]
Category = Literal['work', 'preferences', 'goals']
Topic = Literal['work', 'daily', 'wellbeing']
Capability = Literal['csv.audit', 'profile.change']


class ProductError(Exception):
    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


class Model(BaseModel):
    model_config = ConfigDict(extra='forbid', strict=True, frozen=True, validate_default=True)


def resolve_timezone(value):
    if value == 'UTC':
        return timezone.utc
    # Windows may have no IANA database. Explicit fixed offsets remain useful and are labelled as such.
    fixed = re.fullmatch(r'UTC([+-])(\d{2}):(\d{2})', value)
    if fixed:
        hours, minutes = int(fixed[2]), int(fixed[3])
        if hours > 14 or minutes > 59 or (hours == 14 and minutes):
            raise ValueError('timezone_unavailable')
        offset = timedelta(hours=hours, minutes=minutes) * (1 if fixed[1] == '+' else -1)
        return timezone(offset)
    return ZoneInfo(value)


class Policy(Model):
    revision: int = Field(default=1, ge=1)
    memory_enabled: bool = True
    memory_categories: list[Category] = Field(default_factory=lambda: ['work', 'preferences', 'goals'])
    proactive_enabled: bool = False
    timezone: str = 'UTC'
    start_minute: int = Field(default=540, ge=0, lt=1440)
    end_minute: int = Field(default=1260, ge=0, lt=1440)
    daily_limit: int = Field(default=1, ge=1, le=20)
    daily_evaluation_limit: int = Field(default=3, ge=1, le=100)
    topics: list[Topic] = Field(default_factory=lambda: ['work', 'daily', 'wellbeing'])
    paused_until: UTC | None = None

    @field_validator('timezone')
    @classmethod
    def timezone_available(cls, value):
        try:
            resolve_timezone(value)
        except (ZoneInfoNotFoundError, ValueError) as exc:
            raise ValueError('timezone_unavailable') from exc
        return value

    @model_validator(mode='after')
    def ranges(self):
        if self.start_minute == self.end_minute:
            raise ValueError('empty_contact_window')
        if len(set(self.topics)) != len(self.topics) or len(set(self.memory_categories)) != len(self.memory_categories):
            raise ValueError('duplicate_scope')
        return self


class UserTurn(Model):
    command_id: ID
    conversation_id: ID
    text: str
    csv_text: str | None = None
    temporary: bool = False

    @field_validator('text')
    @classmethod
    def text_size(cls, value):
        return bounded_text(value, 32 * 1024)

    @field_validator('csv_text')
    @classmethod
    def csv_size(cls, value):
        return bounded_text(value, 256 * 1024) if value is not None else None


class ConversationListRequest(Model):
    limit: StrictInt = Field(default=20, ge=1, le=50)
    snapshot: StrictInt | None = Field(default=None, ge=0)
    before: StrictInt | None = Field(default=None, gt=0)


class ConversationTurnsRequest(Model):
    conversation_id: ID
    limit: StrictInt = Field(default=10, ge=1, le=20)
    snapshot: StrictInt | None = Field(default=None, ge=0)
    before: StrictInt | None = Field(default=None, gt=0)


class ReminderCreateRequest(Model):
    command_id: ID
    text: str
    due_at: UTC

    @field_validator('text')
    @classmethod
    def text_size(cls, value):
        return bounded_text(value, 4096)


class ReminderIdRequest(Model):
    id: ID


class ReminderListRequest(Model):
    limit: StrictInt = Field(default=20, ge=1, le=100)
    before: StrictInt | None = Field(default=None, gt=0)


class ReminderReviseRequest(Model):
    command_id: ID
    id: ID
    expected_revision: StrictInt = Field(gt=0)
    operation: Literal['update', 'cancel']
    text: str | None = None
    due_at: UTC | None = None

    @model_validator(mode='before')
    @classmethod
    def strict_operation_fields(cls, value):
        if isinstance(value, dict):
            if value.get('operation') == 'cancel' and ('text' in value or 'due_at' in value):
                raise ValueError('cancel_forbids_update_values')
            if value.get('operation') == 'update' and not {'text', 'due_at'} <= value.keys():
                raise ValueError('missing_update_values')
        return value

    @field_validator('text')
    @classmethod
    def text_size(cls, value):
        return bounded_text(value, 4096) if value is not None else None

    @field_validator('due_at', mode='before')
    @classmethod
    def parse_due_at(cls, value):
        if isinstance(value, str):
            return datetime.fromisoformat(value)
        return value

    @model_validator(mode='after')
    def shape(self):
        if self.operation == 'update' and (self.text is None or self.due_at is None):
            raise ValueError('missing_update_values')
        if self.operation == 'cancel' and (self.text is not None or self.due_at is not None):
            raise ValueError('cancel_forbids_update_values')
        return self


class StopTurnRequest(Model):
    turn_id: ID
    command_id: ID


class FailGenerationRequest(Model):
    turn_id: ID
    ticket: ID
    reason: Literal['provider_failed', 'provider_timeout', 'provider_invalid_output', 'provider_aborted']


class ContactIdRequest(Model):
    id: ID


class ContactFailGenerationRequest(Model):
    id: ID
    ticket: ID
    reason: Literal['provider_failed', 'provider_timeout', 'provider_invalid_output', 'provider_aborted']


class CsvAction(Model):
    kind: Literal['csv.audit']
    # The selected CSV and requirement come from the original turn, never model-supplied paths/text.


class ProfileAction(Model):
    kind: Literal['profile.change']
    changes: PreferenceChanges


Action = Annotated[CsvAction | ProfileAction, Field(discriminator='kind')]


class MemorySuggestion(Model):
    category: Category
    content: str

    @field_validator('content')
    @classmethod
    def text_size(cls, value):
        return bounded_text(value, 2048)


class FollowUpSuggestion(Model):
    topic: Topic
    purpose: str
    due_at: UTC
    expires_at: UTC

    @field_validator('purpose')
    @classmethod
    def text_size(cls, value):
        return bounded_text(value, 1024)

    @model_validator(mode='after')
    def interval(self):
        if self.expires_at <= self.due_at:
            raise ValueError('invalid_window')
        return self


class ModelDecision(Model):
    reply: str
    actions: list[Action] = Field(default_factory=list, max_length=2)
    memories: list[MemorySuggestion] = Field(default_factory=list, max_length=5)
    followup: FollowUpSuggestion | None = None
    @field_validator('reply')
    @classmethod
    def text_size(cls, value):
        return bounded_text(value, 16 * 1024)

    @model_validator(mode='after')
    def distinct_actions(self):
        if len({item.kind for item in self.actions}) != len(self.actions):
            raise ValueError('duplicate_action')
        return self


class FollowUpDecision(Model):
    disposition: Literal['send', 'cancel', 'defer']
    text: str | None = None
    due_at: UTC | None = None
    reason: Literal['still_relevant', 'resolved', 'recent_contact', 'not_useful', 'later']

    @field_validator('text')
    @classmethod
    def text_size(cls, value):
        return bounded_text(value, 4096) if value is not None else None

    @model_validator(mode='after')
    def shape(self):
        if (self.disposition == 'send') != (self.text is not None):
            raise ValueError('text_relation')
        if (self.disposition == 'defer') != (self.due_at is not None):
            raise ValueError('due_relation')
        return self


class ContactCompleteRequest(Model):
    id: ID
    ticket: ID
    decision: FollowUpDecision


def validate(model, value):
    """Validate at every boundary, including previously constructed model instances."""
    import json
    from pydantic import ValidationError
    try:
        if isinstance(value, BaseModel):
            value = value.model_dump(mode='json', exclude_unset=True)
        return model.model_validate_json(json.dumps(value, ensure_ascii=False, allow_nan=False))
    except (ValidationError, TypeError, ValueError, UnicodeError) as exc:
        raise ProductError('invalid_request') from exc
