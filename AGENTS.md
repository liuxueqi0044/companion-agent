# Repository guidance

This private source snapshot includes the existing BATCH-015 base and the reviewed product core through CORE-006, including architect fixes. Read README.md, docs/product/product-experience.md, docs/development/frontend-handoff.md and reviews/CORE-006.md first. SOURCE-SNAPSHOT.json records copied file hashes and exclusions.

The core workspace supplied the product runtime and its local bridge dependencies. This upload is a source backup, not proof of complete integration with every later change in the original development workspace, nor a finished desktop release.

Reuse existing architecture and contracts. Historical dispatch documents and batch checkers reference local-only evidence and baselines deliberately absent from this checkout. Do not execute an old dispatch without a current assignment, fabricate acceptance, or replace missing evidence. Original submitted reports are historical; architect review reports describe the corrected versions.

Keep credentials, databases, private memories, runtime data and holdout fixtures out of Git. Do not invoke models, accounts, networked agent trials or extra sessions solely to validate this snapshot. Initial product UI is owned by the architect; notify the user before starting visual design so they can adjust reasoning settings.
