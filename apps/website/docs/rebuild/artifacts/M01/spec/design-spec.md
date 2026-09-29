# M01 visual design contract

Version: `m01-design-v1`, 2026-09-29. Status: **M01 handoff specification synchronized to the current HTML review boards**. Displayed copy, typography, navigation and full-study placement are imported from `source/board-layouts.mjs` into each layout file’s `reviewBoard` fields. These are exact authored board values, not independent browser measurements. Individual tag/person/card/ribbon coordinates remain provisional production targets until M02/M03 create separable layers. The approved reference and visible review boards govern any discrepancy; this specification does not certify final production assets.

Read together: `copy.en.json`, `layout.desktop.json`, `layout.mobile.json`, `asset-plan.json`, `reuse-audit.md`. The architecture and transition contracts in `docs/rebuild/` remain unchanged. Coordinate IDs are stable; only the owning production module may fill in measured/exported properties after visual review.

## Narrative and exact English

1. Hero: **Build an AI / that’s yours.** Body: “Bring together skills, tools and agents. Shape how it works—and how it feels.” The visible hero keeps its actions in navigation: “Download” and “Join community”. “Download Morrow” / “Explore interfaces” remain optional stored copy and are marked not displayed on this M01 board. Six capability tags: Video Editing, Spreadsheets, Customer Care, Global Trade, Research, Scheduling. Research uses a magnifying-glass line icon.
2. Gallery: **One assistant. A world of possibilities.** (one desktop line) Body: “Change its interface as freely as you change your mind.” This is the interface-customization message; the images must show distinct interaction surfaces, not just alternate wallpapers.
3. Community: **Your ideas. / A world to share.** Body: “Share, discuss, buy and sell what you create.” Primary: “Explore creations”. Secondary: “Share your creation”. The three designated works are Travel Planner, Everyday Companion and Creative Writer.

Use typographic apostrophes and the em dash exactly as encoded in `copy.en.json`. Keep headings as one accessible string in the future website; the review board currently draws separate lines. Visual breaks use the supplied arrays. Headline rows are deliberate, not accidental wraps. On desktop the gallery heading is one line in the upper safety zone; on mobile it changes to three rows. Do not add no-code claims, fake numbers, prices, named authors or testimonials. The card actions express the intended community product; M06 resolves real destinations or a clear concept-preview state.

## Typography and controls

Use the existing licensed local fonts: `public/fonts/dm-serif-display.ttf` for editorial titles, `dm-sans-regular.ttf` for body text/controls and `dm-sans-semibold.ttf` for the tracked uppercase wordmark. The italic serif file is available but is not required in the three primary headings. Retain both OFL license files. No new font dependency is required.

| Visible board role | 1920×960 | 1440×900 | 390×844 | Family / tracking |
| --- | --- | --- | --- | --- |
| Wordmark | 21/28 | 18/24 | 13/18 | DM Sans 600; +4.1 / +3.7 / +2.6px |
| Hero heading | 98/104 | 78/85 | 62/66 | DM Serif 400; 0 |
| Gallery heading | 74/84, one line | 54/64, one line | 46/49, three lines | DM Serif 400; 0 |
| Community heading | 64/70 | 58/65 | 45/53 | DM Serif 400; 0 |
| Hero description | 21/32 | 17/28 | 15.7/26 | DM Sans 400; 0 |
| Community description | 20/31 | 17/28 | 16/25 | DM Sans 400; 0 |
| Navigation actions | 15px, 54px high | 13px, 48px high | 10px, 34px visual high | DM Sans 400 |
| Community actions | 15px, 54px high | 13px, 48px high | 12px, 43px visual high | DM Sans 400 |
| Hero scroll prompt | 11/18 | 10/18 | hidden | DM Sans 400; +2.1 / +1.8px |
| Gallery footer | 10/18 | 10/18 | hidden | DM Sans 400; +2 / +1.8px |
| Mobile sketch marker | hidden | hidden | 9/15 | DM Sans 400; +1.5px |

Numbers mean font-size / line-height in CSS px. The current visible board uses pill controls with 50px radius, olive fill `#535D42`, warm label `#FBF8EE`, and light transparent outlined secondary controls. It is a design review: pills are nonfunctional spans. M06 must provide accessible controls and ≥44px touch targets; the current 34px mobile navigation artwork does not establish touch conformance.

The single board header shows MORROW at left and Download / Join community at right in all three scenes. It does not currently show a tagline, Possibilities link or menu. Their optional copy entries are marked not displayed. Hero has no additional body CTA on this master. Gallery’s interface-customization sentence is stored in copy but not shown under its single-line title. Do not silently add extra visible controls to these approved compositions.

For M02/M03 separate layer production, provisional tag label targets are 27px desktop / 23px laptop / 12px mobile; primary work title targets are 32 / 27 / 16px, descriptions 15 / 13 / 11px, visual action capsules 12 / 11 / 9px. These remain production typography targets, not measurements of baked text in the M01 full-scene studies. Actual HTML overlays need a new alignment check once no-text source artworks exist. On mobile, the complete card should open a readable detail view instead of exposing four tiny independent capsule buttons.

## Color, material and light

| Token / material | Target |
| --- | --- |
| Background | Current board base `#F1ECDF`; warm ivory study token `#F2ECDF`; preserve actual image edge tones when compositing, without strong vignette |
| Main ink | `#25271F`; secondary ink `#666A5B`; muted ornament `#8B8D7B` |
| Paper front | `#E8E1D0`, subtly warmer shadows `#CFC5AF`; 0.3–0.6mm apparent fiber scale |
| Olive leaves | illuminated `#8C9567`, mid `#68724B`, shade `#3F482F`; avoid oversaturated emerald |
| Bark | dark charcoal-brown `#3D372D`, chipped warm ridges `#756650`; irregular branch thickness |
| Natural twine | `#8B7050` with visible twist; holes have a small dark interior and worn edge |
| Ribbon | ivory `#EAE3D2`, thin inner highlight `#FCF9EF`, lower fold `#CFC5AD` |
| Card rim | `#FAF7ED`, 2–4px apparent thickness at 1920; no heavy white device bezel |
| Shadow | warm gray-green `#77796A`; broad soft environmental shadow plus short contact shadow |

Hero light is broad, soft natural daylight from above and to the side. The generated motherboards are the lighting reference (the production prompt specifies upper-right light, with several paper shadows falling down-right); M02 must measure the approved image’s highlights and shadow vectors rather than impose a conflicting clock direction. Leaf surfaces reveal veins and small imperfections; backlit leaf edges have warm translucent detail. Bark has rough high-frequency relief, not low-poly geometry or uniform cylinders. Paper has rounded irregular corners, tiny edge roughness, slight curl and fiber grain visible at normal desktop scale. The paper texture must remain quiet beneath precise labels. Do not mimic material with a noise overlay alone.

The hero has three focus planes: distant low-contrast leaves with broad optical blur; sharply resolved central branch/tags; a few near-edge soft leaves. Keep the text area clear and nearly flat in brightness. The camera treats plants as a photographic plate; no wide orbit around unbuilt backsides. The community shares the same warm light but uses restrained editorial half-body illustration for its people: clean hand-drawn contours, softly painted skin/hair, believable varied faces, cohesive muted clothes. Their style is neither photoreal portrait tiles nor glossy 3D avatars. Draw all five as one controlled set.

## Composition and layer system

Initial production-layer layout objects provide `center`, `size`, `rotationDeg`, `z`, and `crop` in normalized reference-artboard units. Each scene’s `reviewBoard` additionally stores the exact current HTML text lines, pills, study-image placement and veils; those values take precedence over provisional layer targets. `boxPx` is the convenient unrotated top-left/width/height equivalent. Corners are calculated around that center; finished M02/M03 assets must additionally report projected four-corner handoff quads. Transparent source canvases have their own bounds and must not be mistaken for visible-content bounds.

Global layers: 0 warm background; 10 distant scene; 20 far image field; 30 middle scene; 40 subjects; 50 handoff object plane; 60 designated front occlusion; 80 real page copy/CTA; 90 global navigation; 100 dialog. These are ordering labels, not mandatory CSS z-index values. Occlusion subgroups in `asset-plan.json` are the source of truth when the bridge must pass in front of one leaf and behind another.

### Hero

At 1920×960, the 1774×887 study fills the 1920×960 board. Branches occupy the left portion and extend along the lower edge. The actual hero heading sits at x1252, y325 (98/104); its two-line body starts x1258, y566 (21/32). The scroll prompt is x1400, y845 after CUA review. The large branch entry from the upper left and six hanging paper tags preserve the reference hierarchy. Video Editing is the upper-left tag; Research is the low central tag. The rightmost clear leaf tips must stop before the headline safety margin. The header remains legible over the tree with a locally quiet background.

At 1440×900, the study is placed at x0, y90, 1440×720 with soft top/bottom feather; heading x939, y321 (78/85), body x944, y523 (17/28). At 390×844, heading x23, y111 (62/66) and body x26, y275 (15.7/26) occupy the upper half; the study image is x−5, y407, 650×325. This is an independent text/art rearrangement but still uses a whole scene crop: true individual leaf/tag re-layout is a pending M02 task. The target mobile layer positions are preserved in the JSON without claiming they are already rendered.

### Gallery

The actual desktop headline is one line at x431, y97 (74/84); a warm veil protects the top 202px of the art. The 1440 board uses x334, y128 (54/64). A broad U-shaped image stream curves from the left plants into the center and rises toward the right; foreground cards visibly differ in scale and plane angle. In the wide master: 8–10 foreground/middle cards plus 20–28 distant visible instances. Use all 24 existing catalog IDs across a full loop; viewport count is not a user count. The stream must not look like three uniform flat rows. The design data names ten major visible cards; the remaining field supplies rhythm, not tiny readable UI.

The near arc begins around y430, drops near y720 in the center and rises again toward the right. The near card plane tilt changes with horizontal placement; foreground depth is strongest near the lower center. A left olive remnant and narrow cream strands connect visually with the hero. The desktop headline stays on one line above the arc; its actual font size must be checked against the assembled board. At 390px, the actual title is at x23, y104 (46/49) on three lines. The current study is x−205, y350, 825×412.5, with a soft edge mask. A true compressed vertical S with five featured cards is the M04 production target in the JSON, not an implemented current image stream.

### Community

Keep the reference’s roughly 28% open copy region on the left and the complete art world on the right. The long English second line uses 64px on the 1920 master after CUA review, not the initial 84px proposal. Three hero artworks are **upper-middle Travel Planner, middle-right Everyday Companion, lower-middle Creative Writer**. Five half-body people occupy the gaps around them, cropped by the designed ribbons or card edges rather than circular avatar masks. Twenty small background artworks, two ribbon depth layers and plants establish space. Primary cards preserve a shared 1.395:1 visible ratio across gallery and community so no replacement crop occurs during transition B.

The actual 1920 community heading is x84, y296 (64/70), body x88, y493 (20/31), actions x88/x301, y594, 54px high. At 1440, heading x57, y310 (58/65), body x61, y479 (17/28), actions y574, 48px high; the 1440×720 study is at x65, y90. At 390, heading x23, y106 (45/53), body x26, y243 (16/25), actions x24/x198, y322, 43px visual high. The study is x−180, y411, 570×285, with its right edge at x390. This mobile crop is explicitly a layout sketch; the three-card zig-zag, five separate silhouettes and eight selected background instances in the JSON are pending M03 layer-production targets. Repeated background work is decorative, never another claimed creator.

## Handoff commitments

Transition A locks two associations: `hero-tag-video` → catalog `frame` through `gallery-handoff-frame`; `hero-tag-research` → catalog `fieldnotes` through `gallery-handoff-fieldnotes`. The source tags, front typography, back/edge, short attached twine, detached anchor-twine, shadow, full clean plate and leaf occluder are separate production deliverables. Static composite excludes the two removable paper bodies and their moving shadows. The source image must never leave a duplicate card when a bridge object departs. No literal knot untying is shown: the cord/branch connection is briefly hidden behind a small leaf cluster as ownership changes.

The paper-to-interface substitution takes place at the edge-on orientation in transition A, within the reviewed storyboard window. Keep paper text at its original proportions until hidden; reveal a correctly proportioned interface rather than stretching the paper UI. All three community works use their own final M03 bitmap versions and same crop in M04. IDs are `community-travel-planner`, `community-everyday-companion`, `community-creative-writer`; source instances are `gallery-community-travel`, `gallery-community-companion`, `gallery-community-writer`, and destination instances are `community-work-travel`, `community-work-companion`, `community-work-writer`.

M01's board production and motion previsualization can use clearly labeled temporary crops. This spec does not assert that clean plates, transparent people, independent works or final-material transition layers already exist. M02/M03 fill the production fields in the asset ledger only after actual export and inspection.

## Acceptance and open production risks

Check static boards at 1920×960, 1440×900 and 390×844 with actual local fonts. View full art and 100% detail crops, including a tag edge, leaf backlight, bark, each person edge and card typography. Check headline wraps and text-safe rectangles before producing final source images. If a local font renders wider than estimated, retain the line pattern and lower font size by at most 3%; otherwise update the board and recorded coordinates explicitly.

M02 risk: reference-guided full-scene generation may not yield independently clean removable tags. Resolution: produce a tag-free photographic base plus aligned separate tags/cord/occluders and compare the assembled result; do not fake removal by duplicating a crop. M03 risk: separate generations drift in illustration style. Resolution: approve one shared five-person sheet before exporting individual transparent subjects. M04 risk: atlas labels become fuzzy near camera. Resolution: use the eight named close-up remakes from the audit; retain atlases for far depth only. These are production requirements, not completed work or installed dependencies.
