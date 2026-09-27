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
Capability = Literal['csv.audit', 'profile.change', 'artifact.create', 'reminder.create', 'tool.save', 'tool.run', 'data.query', 'task.loop']


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


class ArtifactFile(Model):
    path: str
    content: str

    @field_validator('path')
    @classmethod
    def safe_name(cls, value):
        if len(value) > 160 or not re.fullmatch(r'[A-Za-z0-9_-]+(?:/[A-Za-z0-9_-]+)*\.(?:md|txt|csv|json|html|css|js|mjs|ts|py|svg)', value):
            raise ValueError('invalid_artifact_path')
        for part in value.split('/'):
            if part.split('.')[0].upper() in {'CON', 'PRN', 'AUX', 'NUL', *(f'COM{i}' for i in range(1, 10)), *(f'LPT{i}' for i in range(1, 10))}:
                raise ValueError('reserved_artifact_path')
        return value

    @field_validator('content')
    @classmethod
    def content_size(cls, value):
        return bounded_text(value, 64 * 1024)


class ArtifactAction(Model):
    kind: Literal['artifact.create']
    title: str
    files: list[ArtifactFile] = Field(min_length=1, max_length=12)

    @field_validator('title')
    @classmethod
    def title_size(cls, value):
        return bounded_text(value, 240)

    @model_validator(mode='after')
    def file_set(self):
        names = [item.path.casefold() for item in self.files]
        if len(set(names)) != len(names) or sum(len(item.content.encode()) for item in self.files) > 128 * 1024:
            raise ValueError('invalid_artifact_files')
        return self


class ReminderAction(Model):
    kind: Literal['reminder.create']
    text: str
    due_at: UTC

    @field_validator('text')
    @classmethod
    def text_size(cls, value):
        return bounded_text(value, 4096)


class ToolParameter(Model):
    name: str = Field(pattern=r'^[A-Za-z][A-Za-z0-9_]{0,31}$')
    type: Literal['text', 'number']
    description: str = Field(min_length=1, max_length=240)


class ToolExample(Model):
    csv_text: str | None = Field(default=None, max_length=16384)
    parameters: dict[str, str | int | float] = Field(default_factory=dict)
    expected: list[dict[str, str | int | float | None]] = Field(max_length=100)


class ToolDefinition(Model):
    name: str = Field(min_length=1, max_length=80)
    description: str = Field(min_length=1, max_length=500)
    sql: str = Field(min_length=1, max_length=8192)
    parameters: list[ToolParameter] = Field(default_factory=list, max_length=12)
    examples: list[ToolExample] = Field(min_length=1, max_length=3)

    @model_validator(mode='after')
    def unique_parameters(self):
        if len({p.name for p in self.parameters}) != len(self.parameters):
            raise ValueError('duplicate_parameter')
        return self


class ToolSaveAction(Model):
    kind: Literal['tool.save']
    definition: ToolDefinition
    tool_id: ID | None = None
    expected_revision: StrictInt | None = Field(default=None, ge=1)

    @model_validator(mode='after')
    def update_pair(self):
        if (self.tool_id is None) != (self.expected_revision is None):
            raise ValueError('tool_revision_required')
        return self


class ToolRunAction(Model):
    kind: Literal['tool.run']
    tool_id: ID
    version: StrictInt = Field(ge=1)
    parameters: dict[str, str | int | float] = Field(default_factory=dict)


class ToolManageRequest(Model):
    command_id: ID
    tool_id: ID
    expected_revision: StrictInt = Field(ge=1)
    operation: Literal['enable', 'disable', 'restore']
    version: StrictInt | None = Field(default=None, ge=1)

    @model_validator(mode='after')
    def restore_version(self):
        if (self.operation == 'restore') != (self.version is not None):
            raise ValueError('invalid_tool_operation')
        return self


class DataQueryAction(Model):
    kind: Literal['data.query']
    title: str = Field(min_length=1, max_length=240)
    sql: str = Field(min_length=1, max_length=8192)


class CapabilityDescribeAction(Model):
    kind: Literal['capability.describe']
    package_id: str = Field(pattern=r'^[0-9a-f]{32}$')
    version: str = Field(pattern=r'^[0-9a-f]{64}$')
    component: str = Field(pattern=r'^[a-zA-Z0-9_.-]{1,100}$')
    tool: str | None = Field(default=None, min_length=1, max_length=128)
    resource: str | None = Field(default=None, min_length=1, max_length=180)


class CapabilityCallAction(Model):
    kind: Literal['capability.call']
    package_id: str = Field(pattern=r'^[0-9a-f]{32}$')
    version: str = Field(pattern=r'^[0-9a-f]{64}$')
    component: str = Field(pattern=r'^[a-zA-Z0-9_.-]{1,100}$')
    tool: str = Field(min_length=1, max_length=128)
    arguments: dict = Field(default_factory=dict)

    @field_validator('arguments')
    @classmethod
    def argument_size(cls, value):
        import json
        if len(json.dumps(value, ensure_ascii=False, allow_nan=False).encode()) > 24*1024:
            raise ValueError('arguments_too_large')
        return value


class GoalTaskSpec(Model):
    id: str = Field(pattern=r'^[a-z][a-z0-9_-]{0,31}$')
    title: str = Field(min_length=1, max_length=160)
    instruction: str = Field(min_length=1, max_length=3000)
    criteria: list[str] = Field(min_length=1, max_length=6)
    depends_on: list[str] = Field(default_factory=list, max_length=11)

    @field_validator('criteria')
    @classmethod
    def criteria_size(cls, value):
        return [bounded_text(item, 600) for item in value]


class GoalPlanAction(Model):
    kind: Literal['goal.plan']
    tasks: list[GoalTaskSpec] = Field(min_length=1, max_length=12)


class GoalDispatchAction(Model):
    kind: Literal['goal.dispatch']
    task_id: str = Field(min_length=1, max_length=32)
    executor: Literal['worker', 'claude'] = 'worker'


class GoalSubmitAction(Model):
    kind: Literal['goal.submit']
    summary: str = Field(min_length=1, max_length=2000)
    evidence_ids: list[ID] = Field(min_length=1, max_length=12)


class GoalCriterionReview(Model):
    criterion: StrictInt = Field(ge=0, le=5)
    passed: bool
    reason: str = Field(min_length=1, max_length=1000)
    evidence_ids: list[ID] = Field(min_length=1, max_length=12)


class GoalReviewAction(Model):
    kind: Literal['goal.review']
    task_id: str = Field(min_length=1, max_length=32)
    verdict: Literal['accept', 'rework']
    checks: list[GoalCriterionReview] = Field(min_length=1, max_length=6)


class GoalFinishAction(Model):
    kind: Literal['goal.finish']
    outcome: Literal['complete', 'needs_input', 'incomplete']


class CodeFileEvidence(Model):
    path: str
    sha256: str = Field(pattern=r'^[0-9a-f]{64}$')
    bytes: StrictInt = Field(ge=0, le=65536)


class CodeCheckEvidence(Model):
    path: str
    kind: Literal['node_syntax', 'python_syntax', 'json_parse', 'not_run']
    status: Literal['passed', 'failed', 'not_run']
    detail: str = Field(max_length=800)


class CodingEvidence(Model):
    kind: Literal['claude-code']
    receipt_id: ID
    model: str = Field(min_length=1, max_length=100)
    files: list[CodeFileEvidence] = Field(min_length=1, max_length=12)
    checks: list[CodeCheckEvidence] = Field(min_length=1, max_length=12)
    tool_calls: StrictInt = Field(ge=0, le=1000)
    api_requests: StrictInt = Field(ge=0, le=1000)


Action = Annotated[CsvAction | ProfileAction | ArtifactAction | ReminderAction | ToolSaveAction | ToolRunAction | DataQueryAction | CapabilityDescribeAction | CapabilityCallAction | GoalPlanAction | GoalDispatchAction | GoalSubmitAction | GoalReviewAction | GoalFinishAction, Field(discriminator='kind')]


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
    plan: list[str] = Field(default_factory=list, max_length=8)
    outcome: Literal['complete', 'needs_input', 'incomplete'] = 'complete'

    @field_validator('outcome', mode='before')
    @classmethod
    def intermediate_outcome(cls, value, info):
        # Some providers explicitly emit null while tools are still pending.
        # Outcome is not consumed for an action-bearing step; keep final replies strict.
        if value is None and info.data.get('actions'):
            return 'complete'
        return value

    @field_validator('plan')
    @classmethod
    def plan_size(cls, value):
        return [bounded_text(item, 400) for item in value]
    @field_validator('reply')
    @classmethod
    def text_size(cls, value):
        return value if value == '' else bounded_text(value, 16 * 1024)

    @model_validator(mode='after')
    def distinct_actions(self):
        if not self.reply and not self.actions:
            raise ValueError('empty_final_reply')
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
