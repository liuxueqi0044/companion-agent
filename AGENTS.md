# Repository guidance

This private source snapshot includes the existing BATCH-015 base and the reviewed product core through CORE-006, including architect fixes. Read README.md, docs/product/product-experience.md, docs/development/frontend-handoff.md and reviews/CORE-006.md first. SOURCE-SNAPSHOT.json records copied file hashes and exclusions.

The core workspace supplied the product runtime and its local bridge dependencies. This upload is a source backup, not proof of complete integration with every later change in the original development workspace, nor a finished desktop release.

Reuse existing architecture and contracts. Historical dispatch documents and batch checkers reference local-only evidence and baselines deliberately absent from this checkout. Do not execute an old dispatch without a current assignment, fabricate acceptance, or replace missing evidence. Original submitted reports are historical; architect review reports describe the corrected versions.

Keep credentials, databases, private memories, runtime data and holdout fixtures out of Git. Do not invoke models, accounts, networked agent trials or extra sessions solely to validate this snapshot. Initial product UI is owned by the architect; notify the user before starting visual design so they can adjust reasoning settings.


CORE-007/008 source has been added, including the first personal-space UI and real DeepSeek adapter. The user removed the local count quota. Historical six-attempt dispatch constraints no longer apply to the product launcher. See docs/development/CORE-008.md. This remains a source publication mirror; continue development in companion-agent-core.

CORE-009 adds live streaming, public preview separation, read-only reconnect and session recovery. See docs/development/CORE-009.md and reports/core-009/report.json. Generated UI activation, background contact and desktop delivery remain incomplete. Continue from the latest handoff, not a historical dispatch.

CORE-010 adds free-code home canvas generation, isolated browser preview, explicit activation and rollback. See docs/development/CORE-010.md. This supersedes older blanket no-generated-UI statements only for the opaque-origin, no-private-data canvas. No execution in Node or trusted renderer, no private state bridge, no extra agents or OpenAI sessions. Native/resource isolation and community imports remain incomplete. Source publication excludes model-generated live candidates, raw evidence and runtime data.

CORE-011 supersedes the old home-only boundary for user-trusted whole-interface source packages. Read docs/development/CORE-011.md, ADR-009 and the current handoff. Default and custom interfaces use the same scoped morrow.ui/1 SDK; the trusted host retains execution ownership and independent recovery. Author code does not execute in Node or receive raw host handles or credentials. Natural-language full-interface authoring, native windows and hostile community-code isolation remain incomplete. This is a publication mirror; continue product development in companion-agent-core. Do not invoke models or extra agent sessions to validate this snapshot.
