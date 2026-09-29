# M01 reuse audit

Inspected 2026-09-29: `src/lib/content.ts`, `public/art/manifest.json`, all four interface atlases, the portrait atlas, local font files/licenses and `tools/prepare-assets.mjs`. `node tools/prepare-assets.mjs --check` confirmed that all five source PNGs exist and are 1254×1254. This audit is a visual/design reuse decision, not a claim that the rebuilt gallery is implemented or tested.

## Verified source inventory

| Atlas | Runtime source | Size / bytes | Source original | Current crop rows |
| --- | --- | --- | --- | --- |
| Companions | `/art/companions.webp` | 1254×1254 / 344,354 | `source-art/companions.png` | y=0,418,836,1254 |
| Creative | `/art/creative.webp` | 1254×1254 / 252,624 | `source-art/creative.png` | y=0,394,778,1254 |
| Workspaces | `/art/workspaces.webp` | 1254×1254 / 295,302 | `source-art/workspaces.png` | y=0,406,827,1254 |
| Possibilities | `/art/possibilities.webp` | 1254×1254 / 263,896 | `source-art/possibilities.png` | y=0,418,836,1254 |
| Portraits | `/art/portraits.webp` | 1254×1254 / 281,106 | `source-art/portraits.png` | four square portraits |

All interface tiles are 627px wide. Height varies with the row bounds in `content.ts`; do not replace those bounds with generic equal thirds. Generated embedded words sometimes become meaningless or inconsistent at enlargement, even when the tile looks polished from a distance. Preserve original files and stable catalog IDs. A repeated instance of a catalog image is not a distinct community creation or author.

## Decisions for all 24 concepts

`R` = keep the existing atlas tile for background/middle distance and create a distinct high-resolution close-up version. `F` = retain at far/middle distance only; it cannot be promoted into a large foreground role without a later independent remake. `C` = retain the catalog identity but exclude the current image from readable foreground because it contains problematic baked content. No source file is deleted.

| Stable ID / title | Source tile x,y,w,h px | Decision | Specific visual treatment |
| --- | --- | --- | --- |
| `milo` / Milo | companions 0,0,627,418 | R | Featured warm robot and compact input. Preserve terracotta room, ivory character and plant accent. Remake printed slogans/microtext. New near asset: `gallery-milo`. |
| `bloom` / Bloom | companions 627,0,627,418 | F | Strong botanical illustrated companion; existing detailed face and glass chat panel suit medium/far. Keep at ≤280 CSS px wide at DPR≤2; do not turn this character into a community author. |
| `orbit` / Orbit | companions 0,418,627,418 | R | Featured blue translucent creature and compact interaction surface supply shape/color variety. Keep luminous effect inside artwork. New near asset: `gallery-orbit`. |
| `sunday` / Sunday | companions 627,418,627,418 | F | Warm journal, candle and notes. Use far/middle; avoid inviting close reading of generated handwriting or fixed date. |
| `koi` / Koi | companions 0,836,627,418 | C | Calm composition is usable in tiny far field, but decorative non-English characters are embedded. Exclude from any readable foreground in the English master. If promoted, remake artwork with clean English or nonverbal decoration; do not claim old image is fully localized. |
| `nova` / Nova | companions 627,836,627,418 | F | Violet illustrated conversation card adds palette range but repeated close-up faces would dominate the gallery. Use far/middle behind the botanical/cream foreground. |
| `frame` / Frame | creative 0,0,627,394 | R — mandatory A | Exact target of Video Editing. New `gallery-frame`, 1800×1200 master; dark editing workspace, scenic preview and legible timeline. Cannot substitute Cut / 01 or enlarge this 627px tile. |
| `studio-moss` / Studio Moss | creative 627,0,627,394 | R | Featured cream botanical visual workspace at right edge. Preserve visible toolbar so it reads as a changeable interface, not only an editorial poster. New `gallery-studio-moss`. |
| `sonic` / Sonic | creative 0,394,627,384 | F | Red waveform/audio workspace provides useful contrast at middle depth. Preserve crop row height384. Do not enlarge generated timeline labels. |
| `canvas` / Canvas | creative 627,394,627,384 | F | Saturated blue sculptural canvas appears sparingly in far field; do not let its brightness displace the warm whole-page palette. |
| `cut-01` / Cut / 01 | creative 0,778,627,476 | F | Dance/video workspace, portrait-heavy source ratio. Keep original crop in far/middle; it is not transition A's selected editing asset. |
| `atelier` / Atelier | creative 627,778,627,476 | R | Featured editorial writing workspace. Remake as coherent 3:2 independent UI and replace generated page prose with short authored text. New `gallery-atelier`. This is not the community Creative Writer scenic work. |
| `fieldnotes` / Fieldnotes | workspaces 0,0,627,406 | R — mandatory A | Exact target of Research. New `gallery-fieldnotes`, 1800×1200 master; paper notebook, sources and olive/coastal inset. Keep independently authored UI labels. |
| `terminal-one` / Terminal / One | workspaces 627,0,627,406 | R | Featured developer workspace preserves the inclusive product positioning. Dark code/editor concept, amber accent, authored plausible snippet. New `gallery-terminal-one`. |
| `horizon` / Horizon | workspaces 0,406,627,421 | F | Beautiful coastal travel interface, useful far/middle. Retain its catalog identity and description; never rename or pass it off as the dedicated community Travel Planner. |
| `flow` / Flow | workspaces 627,406,627,421 | F | Soft floating planner shows interface variety at medium depth. Source already includes a large scene background; at medium scale it should remain a panel, not expand to fill the whole page. |
| `good-company` / Good Company | workspaces 0,827,627,427 | C | Current tile has a named example customer, email-like string, VIP badge, order/spend figures and specific chat content. Keep catalog record, restrict old image to very small unreadable background. Foreground promotion requires replacing identities/numbers with explicitly fictional, generic demo content. |
| `signals` / Signals | workspaces 627,827,627,427 | F | Dark map/research workspace suitable for far field. Generated market/news labels must not be treated as factual or current information. |
| `luna` / Luna | possibilities 0,0,627,418 | R | Featured rabbit, moss and gentle chat panel. New `gallery-luna`; preserve warm tactile style and controlled short labels. |
| `commonplace` / Commonplace | possibilities 627,0,627,418 | C | Printed quotation and recognizable book/author titles are baked in. Preserve source but exclude readable foreground; a remake would use authored excerpt and generic reading-list metadata. Tiny background only in this plan. |
| `spatial` / Spatial | possibilities 0,418,627,418 | F | Blue translucent spatial UI gives form variety. Keep at far/middle depth with restrained relative brightness; preserve original layout, not literal product capability claims. |
| `garden` / Garden | possibilities 627,418,627,418 | F | Pink/green habit planner supplies a warm light tile. Medium/far only; generated calendar row labels do not become website semantic text. |
| `muse` / Muse | possibilities 0,836,627,418 | F | Monochrome photography workspace provides visual breathing room. Retain as concept art; portrait inside artwork is not an endorsed creator identity. |
| `pocket` / Pocket | possibilities 627,836,627,418 | F | Compact dark side panel and yellow figure strongly communicate another assistant shape. Useful middle/far; needs a separate accurate-text source before being a near hero. |

Totals: **8 close-up remakes**, **13 straightforward far/middle reuses**, **3 restricted-content reuses**. All 24 IDs and descriptions remain addressable in the catalog. The eight new assets preserve the intended concept, not every generated letter or arbitrary original pixel.

## Practical image limits

- Near foreground: use independent 1800×1200 originals, with 1200×800 and 900×600 exports. Display width typically 300–360 CSS px on desktop; suitable source resolution is then available for DPR2 without enlarging the old tile. The two A handoff concepts get the same source quality as the other featured cards.
- Middle: existing tile may be used up to 280 CSS px at DPR≤2 when observed in context and not expected to carry readable tiny UI. Target 160–240px for crowded areas. Preserve the row-specific crop and sample inset/gutter to prevent adjacent atlas bleed.
- Far: target 56–140 CSS px and lower contrast. Restricted images (`koi`, `good-company`, `commonplace`) stay in this tier, at a maximum 120 CSS px; none is a deliberately legible feature in the M01 motherboards.
- Do not use browser upscaling, sharpening or AI upscale alone as proof that a new close-up source exists. Check every remake at its intended display size and keep the catalog relation explicit.

## Fonts, people and implementation reuse

**Fonts:** DM Serif Display regular, DM Sans regular and semibold can be reused directly. Local italic serif is optional. Font license notices are present; preserve them. No remote font fetch is needed for the design contract.

**Old people:** `portraits.webp` contains four front-facing, cropped painted portraits on square cream backgrounds. It lacks the fifth person, transparent silhouettes, reference-facing directions and ribbon-integrated half-body poses. Reuse as a historical palette reference only. Do not crop them into circles or count them as the five completed M03 people. M03 produces one consistent five-person set.

**Technical architecture:** retain Astro/TypeScript, source-preserving asset pipeline, gallery factory boundary and the existing stable IDs/crop formula. The old gallery's curved positions, camera constants, RAF/time state and texture geometry still need the current scene/handoff contracts; this audit does not authorize copying them unchanged. Existing dialog semantics can be adapted in later modules. Old procedural branches, skill-selection controls, assembly chapter and old circular-avatar community layout do not carry into the new art direction.

## M01 concepts versus production

The following files now exist as **M01 design studies** in `docs/rebuild/artifacts/M01/assets/`, as reported by the art lead and verified for file dimensions:

| Study | Actual size | Meaning and remaining work |
| --- | --- | --- |
| `hero-art-v1.png` | 1774×887 | Full hero visual concept. Not a certified separable M02 production scene. |
| `gallery-art-v1.png` | 1774×887 | Full gallery visual concept. Not a Three.js gallery, full loop or 24 independent high-resolution UI files. |
| `community-art-v1.png` | 1774×887 | Full community visual concept. Not three independent works plus five alpha people. |
| `material-study-v1.png` | 1774×887 | Material/light study. Not a production texture atlas. |
| `hero-cleanplate-study-v1.png` | 1774×887 | Removal/clean-plate feasibility study. Requires registered final layer and shadow validation in M02. |
| `tags-study-v1.png` | 1254×1254, alpha | Separate-tag feasibility study. Art lead observed pale/yellow edge fringe; refine alpha, trim mattes and validate at M02 before production use. |
| `people-study-v1.png` | 2172×724, alpha | Five half-body illustrated people in a horizontal style/motion study. Individual cuts, alpha refinement and M03 registration remain pending; source prompt is recorded in `source/people-prompt.json`. |

The current HTML overlays/full-study placements in `layout.*.json` are synchronized directly from `source/board-layouts.mjs`. Their `reviewBoard` fields are exact authored values. Individual production-layer geometry remains provisional until actual separable M02/M03 assets exist. A full-scene study can be used to judge composition and materials in M01; it does not close the M02/M03 layer checklist. Existing study paths are recorded separately from the 75 pending production assets in `asset-plan.json`.
