# personal-ai-local/1

`schema.json` is generated from `services.personal_ai.models` for the private single-user local profile interface. Regenerate with `python -m services.personal_ai.schema`; check without writing with `python -m services.personal_ai.schema --check`. It is not one of the frozen C01–C11 public contracts and provides no remote authentication or model authority.

The only editable profile data is an explicit AI name, user address, and communication instructions. An adapter or future UI must submit a structured `ChangeRequest` with a current revision and command ID. Natural-language extraction, if added later, must produce and confirm such a request separately. The instructions are user preference data, not system policy, permission grants, credentials, task state, or semantic memory.
