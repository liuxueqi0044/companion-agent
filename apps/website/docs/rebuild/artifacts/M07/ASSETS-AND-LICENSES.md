# Assets, licenses and reproducible handoff

Measured 2026-09-29T14:40:16.669Z. This inventory does not mark the site or its build as final. Full per-file dimensions, alpha, byte sizes, hashes, provenance and source paths are in [file-inventory.json](file-inventory.json).

## Image and font budget

| Published image group | Files | Bytes | Size |
|---|---:|---:|---:|
| hero | 6 | 467,556 | 0.446 MiB |
| gallery | 18 | 1,128,832 | 1.077 MiB |
| community | 30 | 1,457,062 | 1.390 MiB |
| fallback | 3 | 640,968 | 0.611 MiB |

- Hero's 6 images: **467,556 bytes**. Three font files: **166,908 bytes**. Combined hero/font set: **634,464 bytes (0.605 MiB)**.
- The initial HTML also eagerly references the hero fallback poster: **148,670 bytes**. This is additional to the hero layer set; it should not be omitted when estimating startup resources.
- All unique reachable images and fonts, including four legacy atlases outside `public/rebuild`: **4,640,976 bytes (4.426 MiB)**. This exceeds a 3 MB whole-site image/font pool; the smaller hero budget must not be presented as the full site budget.
- Bootstrap creates gallery and community after hero decode and starts their loads. These loads are currently eager after that boundary, not deferred until scrolling.
- 8 optional gallery 900 px variants (376,526 bytes) are present on disk but the current runtime catalogue uses the 1200 px variants.
- These are unique local-file counts, not a browser waterfall or performance claim. Fonts requested by the new runtime are DM Serif Display regular, DM Sans regular and DM Sans semibold; the legacy italic file is not counted as a new runtime font request.

## Provenance and retained masters

Hero and fallback art derive from the approved M01 images. The exact paper faces, cords, local cleanplate and original PNGs are retained in `source-art/rebuild/hero`; rejected extraction trials do not ship. Community has independently generated scene/people/ribbon/work masters in `source-art/rebuild/community`. Its twenty distant thumbnails reuse existing generated project concepts.

The eight foreground gallery interfaces are original project SVG UI designs with independent generated scene imagery, retained in `source-art/rebuild/gallery` as SVG plus raster masters. Middle/far gallery cells reuse the existing generated atlases in `source-art/`; they are not enlarged into foreground masters. No external stock photograph, purchased 3D asset, or fetched runtime image service was added for this rebuild.

Prompt records remain with the source art: [hero](../../../../source-art/rebuild/hero/prompts.json), [community](../../../../source-art/rebuild/community/prompts.json), [gallery](../../../../source-art/rebuild/gallery/generation-prompts.json). Generated art is recorded by origin; it is not mislabeled as third-party open-source artwork.

## Direct dependency notices

Versions and license identifiers below are read from the installed package metadata, not inferred from a website.

| Package | Installed version | Declared license | Local notice |
|---|---|---|---|
| astro | 7.3.5 | MIT | [notice](../../../../public/licenses/astro-MIT.txt) |
| gsap | 3.15.0 | Standard 'no charge' license: https://gsap.com/standard-license. | [notice](../../../../public/licenses/gsap-NOTICE.txt) |
| lenis | 1.3.26 | MIT | [notice](../../../../public/licenses/lenis-MIT.txt) |
| three | 0.186.1 | MIT | [notice](../../../../public/licenses/three-MIT.txt) |
| @astrojs/check | 0.9.10 | MIT | Installed package metadata |
| @types/three | 0.186.0 | MIT | Installed package metadata |
| typescript | 6.0.3 | Apache-2.0 | Installed package metadata |
| sharp | 0.35.5 | Apache-2.0 | [notice](../../../../public/licenses/sharp-Apache-2.0.txt) |

GSAP's package declares its Standard “no charge” license; it is **not MIT**. Its [local copyright/reference notice](../../../../public/licenses/gsap-NOTICE.txt) links to the package's official terms. ScrollTrigger ships within that GSAP package/version.

DM Sans and DM Serif Display retain their SIL Open Font License 1.1 notices in [DM Sans OFL](../../../../public/fonts/DM-Sans-OFL.txt) and [DM Serif Display OFL](../../../../public/fonts/DM-Serif-Display-OFL.txt). Keep font notices and dependency notices in distributed copies. Build-only tooling also follows its installed package license; the table is a direct-dependency inventory, not an exhaustive transitive software bill of materials.

## Existing build snapshot

The inspected `dist/rebuild/index.html` has filesystem modification time **2026-09-29T14:40:13.430Z**. This is an existing build snapshot and may precede the latest source edits; the tool did not run a build.

The rebuild page's reachable JavaScript closure currently contains **2 chunks**, **760,627 raw bytes**, approximately **212,253 gzip bytes** or **178,227 Brotli bytes**. Its 3 linked CSS files contain **33,013 raw bytes**. Compressed sizes are local estimates; server compression has not been measured. The JSON records each chunk hash and mtime so this snapshot cannot be mistaken for a later final build.

## Run and reproduce

Use Node.js **>=22.12.0** and the checked-in lockfile in a normal project checkout:

```sh
npm ci
npm run check
npm run build
npm run preview
```

Preview defaults to `http://127.0.0.1:4332`; the new scene route is `/rebuild/`. Root integration decides the final home-page switch. The prepared WebP files are already local; a normal build needs no image-generation key or generation service.

After the final build, refresh this measured inventory with `node tools/rebuild-inventory.mjs`. Optional source-asset rebuild scripts live under `tools/rebuild-*-assets.mjs`. Run geometry/runtime regressions with `node tools/rebuild-geometry-test.mjs`, `node tools/rebuild-runtime-check.mjs` and the gallery motion check.

The present development checkout's `node_modules` is a junction to shared local dependencies. Do not package that junction as project source. A clean recipient checkout should use `npm ci`; this audit did not reinstall dependencies, archive files or rebuild the site.

## Path verification

The evaluated actual gallery catalogue has 27 entries, including 8 new near-field assets. All dynamic community people/distant assets, catalogue URLs and literal scene/font URLs were checked: **0 missing normal runtime paths; 0 missing retained source paths**. One explicitly named missing-image URL is intentional and only selected by `?assetFail=community`; it is separately recorded as a failure-test request. This inventory includes all 60 files under `public/rebuild`, including metadata manifests, and records real decoded dimensions for every image.
