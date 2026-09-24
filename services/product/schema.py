"""Deterministic export of the private model/policy input contracts."""
import json
from pathlib import Path
from .models import (Model, Policy, UserTurn, ModelDecision, FollowUpDecision,
                     ConversationListRequest, ConversationTurnsRequest,
                     ReminderCreateRequest, ReminderIdRequest, ReminderListRequest,
                     ReminderReviseRequest, StopTurnRequest, FailGenerationRequest,
                     ContactIdRequest, ContactCompleteRequest, ContactFailGenerationRequest)


class Contracts(Model):
    policy: Policy
    user_turn: UserTurn
    model_decision: ModelDecision
    followup_decision: FollowUpDecision
    conversation_list: ConversationListRequest
    conversation_turns: ConversationTurnsRequest
    reminder_create: ReminderCreateRequest
    reminder_id: ReminderIdRequest
    reminder_list: ReminderListRequest
    reminder_revise: ReminderReviseRequest
    turn_stop: StopTurnRequest
    turn_fail_generation: FailGenerationRequest
    contact_id: ContactIdRequest
    contact_complete: ContactCompleteRequest
    contact_fail_generation: ContactFailGenerationRequest


def schema_bytes():
    return (json.dumps(Contracts.model_json_schema(),ensure_ascii=False,sort_keys=True,indent=2)+'\n').encode('utf-8')


def main():
    import sys
    target = Path(__file__).resolve().parents[2] / 'packages/contracts/product-core/schema.json'
    if '--check' in sys.argv:
        if not target.is_file() or target.read_bytes() != schema_bytes():
            raise SystemExit('schema_out_of_date')
        print('product-core schema: PASS')
    else:
        target.parent.mkdir(parents=True,exist_ok=True)
        target.write_bytes(schema_bytes())


if __name__ == '__main__': main()
