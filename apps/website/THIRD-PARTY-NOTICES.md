# Third-party notices

Verified against the installed packages and bundled font notices on 2026-09-29. These licenses apply to the named dependencies and fonts; they do not assign the same license to the Morrow site or its generated artwork.

| Component | License and notice |
| --- | --- |
| [Astro](https://astro.build/), 7.3.5 | MIT; Fred K. Schott and the additional attributions in the package license. [Bundled full notice](public/licenses/astro-MIT.txt). |
| [Three.js](https://threejs.org/), 0.186.1 | MIT; © 2010–2026 three.js authors. Includes the imported Three.js example utilities. [Bundled full notice](public/licenses/three-MIT.txt). |
| [Lenis](https://github.com/darkroomengineering/lenis), 1.3.26 | MIT; © 2024 darkroom.engineering. [Bundled full notice](public/licenses/lenis-MIT.txt). |
| [GSAP and ScrollTrigger](https://gsap.com/), 3.15.0 | GSAP Standard “No Charge” License, not MIT or an OSI open-source license. [Official terms](https://gsap.com/standard-license/); [bundled copyright/reference notice](public/licenses/gsap-NOTICE.txt). The installed package supplies the copyright and terms URL, not a standalone license text. |
| [Sharp](https://sharp.pixelplumbing.com/), 0.35.5 | Apache-2.0; asset preparation/build tooling. [Bundled package license](public/licenses/sharp-Apache-2.0.txt). Native and transitive dependencies retain their own notices in their npm packages. |
| DM Sans | SIL Open Font License 1.1; © 2014 The DM Sans Project Authors. [Bundled notice](public/fonts/DM-Sans-OFL.txt). |
| DM Serif Display | SIL Open Font License 1.1; Adobe / Google copyrights and reserved font name declaration retained in the [bundled notice](public/fonts/DM-Serif-Display-OFL.txt). |

## Implementation reference

[Infinite Layers Grid](https://github.com/JorgeCapillo/infinite-layers-grid), © 2025 Jorge Toloza, MIT, informed the offscreen recycling approach in `interface-stream.ts`: recycle a complete image tile after it leaves the view. The Three.js world-space wrap, three-layer composition, shaders, atlas handling and module API were independently written for Morrow. No upstream DOM/GSAP implementation or artwork is bundled. The source comment retains the reference URL, author credit and MIT text as an acknowledgement, not as a claim that the Morrow implementation was copied from that project.

## Site-created material

`branches.ts` contains original procedural Three.js geometry and canvas-generated bark/leaf textures. No Blender model, third-party plant scan or downloaded botanical texture is included.

The interface atlases and portraits in `source-art/` and `public/art/` were generated with imagegen for this project. They are concept illustrations, not evidence of real customers, testimonials, community creators, sales or available assistant products. Code dependency licenses do not automatically apply to these images. Source PNGs are preserved; the preparation script only converts them to WebP and records delivery metadata.

Keep applicable copyright notices when distributing dependency code or fonts. The `public/licenses/` and `public/fonts/*-OFL.txt` files are included in static builds.
