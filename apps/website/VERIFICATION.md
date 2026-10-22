# Frontend v2 verification

The current production route is the rebuilt English site. The complete report, precise scope and known testing limits are in [M07](docs/rebuild/artifacts/M07/README.md).

- Astro check: 0 errors, 0 warnings, one unused authoring-helper hint.
- Static build: `/`, `/rebuild/`, `/legacy/`, `/privacy/`.
- Geometry/ownership: 14 checks passed; runtime orchestration: 10 checks passed.
- Gallery cycles and asset integrity passed their deterministic checks.
- Desktop, phone and tablet composition inspected; real continuous forward/backward navigation, dialogs, filters and JSON draft download exercised.
- Reduced-motion, unavailable WebGL and missing community-image fallback verified.
- Four actual browser A/B forward/reverse captures preserved as timestamped VFR MP4 evidence; these do not certify frame rate on every device.

No public deployment, real purchase, account creation or remote publication was performed. The page uses concept imagery; local JSON actions do not imply a live marketplace.

Earlier implementation evidence is preserved in [the legacy record](docs/legacy-site-verification.md); it does not describe the rebuilt site.
