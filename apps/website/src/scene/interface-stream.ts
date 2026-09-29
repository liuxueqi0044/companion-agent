import * as THREE from 'three';

/**
 * A single-scene, camera-space image stream. No canvas, DOM events or RAF are
 * created here: the page owns rendering, scrolling and accessible interactions.
 *
 * Recycling reference: Jorge Toloza's Infinite Layers Grid (2025), specifically
 * its offscreen tile recycling, independently adapted to Three.js world units:
 * https://github.com/JorgeCapillo/infinite-layers-grid/blob/main/src/js/components/infinite-grid.js
 *
 * Reference license: MIT, Copyright (c) 2025 Jorge Toloza.
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

export type StreamAsset = {
  id: string;
  src: string;
  title: string;
  category: string;
  /** Normalized atlas rectangle. x/y start at the image's upper-left corner. */
  crop?: { x: number; y: number; w: number; h: number };
};

type StreamUpdate = {
  time: number;
  progress: number;
  /** Visible world-space dimensions at z = 0, not browser pixel dimensions. */
  viewportWidth: number;
  viewportHeight: number;
  /** Normalized pointer coordinates in the range -1…1. */
  pointerX: number;
  pointerY: number;
  reducedMotion: boolean;
};

type Card = {
  asset: StreamAsset;
  group: THREE.Group;
  image: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  material: THREE.ShaderMaterial;
  edgeMaterial: THREE.MeshStandardMaterial;
  shadowMaterial: THREE.ShaderMaterial;
  texture: THREE.Texture;
  layer: number;
  index: number;
  variation: number;
  loaded: boolean;
};

type Atlas = { texture: THREE.Texture; cards: Card[]; ready: boolean };

const ASPECT = 1.5;
const CAMERA_Z = 18;
const clamp01 = (n: number) => THREE.MathUtils.clamp(n, 0, 1);
const wrap = (n: number, period: number) => ((n % period) + period) % period;

function roundedRectangle(width: number, height: number, radius: number) {
  const x = -width / 2;
  const y = -height / 2;
  const shape = new THREE.Shape();
  shape.moveTo(x + radius, y);
  shape.lineTo(x + width - radius, y);
  shape.quadraticCurveTo(x + width, y, x + width, y + radius);
  shape.lineTo(x + width, y + height - radius);
  shape.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  shape.lineTo(x + radius, y + height);
  shape.quadraticCurveTo(x, y + height, x, y + height - radius);
  shape.lineTo(x, y + radius);
  shape.quadraticCurveTo(x, y, x + radius, y);
  return shape;
}

const imageVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const imageFragment = /* glsl */ `
  uniform sampler2D uMap;
  uniform mat3 uMapTransform;
  uniform float uOpacity;
  uniform float uLoaded;
  varying vec2 vUv;

  float roundedBox(vec2 p, vec2 halfSize, float radius) {
    vec2 q = abs(p) - halfSize + radius;
    return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - radius;
  }

  void main() {
    float distanceToEdge = roundedBox((vUv - 0.5) * vec2(1.5, 1.0), vec2(0.75, 0.5), 0.034);
    float aa = max(fwidth(distanceToEdge), 0.0007);
    float mask = 1.0 - smoothstep(-aa, aa, distanceToEdge);
    if (mask < 0.005 || uOpacity < 0.001) discard;
    vec2 imageUv = (uMapTransform * vec3(vUv, 1.0)).xy;
    vec4 picture = texture2D(uMap, imageUv);
    // The neutral loading surface never masquerades as a supplied UI sample.
    vec3 surface = mix(vec3(0.87, 0.87, 0.84), picture.rgb, uLoaded);
    float rim = (1.0 - smoothstep(0.0, 0.0024, abs(distanceToEdge + 0.002))) * 0.16;
    surface = mix(surface, vec3(1.0), rim);
    gl_FragColor = vec4(surface, mask * uOpacity);
    #include <colorspace_fragment>
  }
`;

const shadowFragment = /* glsl */ `
  uniform float uOpacity;
  varying vec2 vUv;
  void main() {
    vec2 p = (vUv - 0.5) * vec2(2.0, 1.5);
    vec2 q = abs(p) - vec2(0.73, 0.48) + 0.07;
    float d = min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - 0.07;
    float shadow = exp(-max(d, 0.0) * max(d, 0.0) / 0.009);
    gl_FragColor = vec4(0.055, 0.075, 0.085, shadow * uOpacity);
    #include <colorspace_fragment>
  }
`;

/** Shared atlas bitmap; individual UV transforms prevent adjacent cells leaking. */
function updateTextureCrop(card: Card) {
  const image = card.texture.image as { width?: number; height?: number } | undefined;
  const sourceWidth = image?.width || 1;
  const sourceHeight = image?.height || 1;
  const crop = card.asset.crop || { x: 0, y: 0, w: 1, h: 1 };
  const width = THREE.MathUtils.clamp(crop.w, 0.001, 1);
  const height = THREE.MathUtils.clamp(crop.h, 0.001, 1);
  const x = THREE.MathUtils.clamp(crop.x, 0, 1 - width);
  const y = THREE.MathUtils.clamp(crop.y, 0, 1 - height);
  const sourceAspect = (sourceWidth * width) / (sourceHeight * height);
  const coverX = Math.min(ASPECT / sourceAspect, 1);
  const coverY = Math.min(sourceAspect / ASPECT, 1);
  // Half-texel inset keeps bilinear sampling inside the selected atlas cell.
  const repeatX = Math.max(width * coverX - 1 / sourceWidth, 0.0001);
  const repeatY = Math.max(height * coverY - 1 / sourceHeight, 0.0001);
  card.texture.repeat.set(repeatX, repeatY);
  card.texture.offset.set(x + (width - repeatX) / 2, 1 - y - height + (height - repeatY) / 2);
  card.texture.updateMatrix();
  card.material.uniforms.uMapTransform.value.copy(card.texture.matrix);
}

export function createInterfaceStream(assets: StreamAsset[], options: { mobile?: boolean } = {}) {
  const group = new THREE.Group();
  group.name = 'interface-stream';
  const mobile = Boolean(options.mobile);
  const countPerLayer = mobile ? 4 : 8;
  const cards: Card[] = [];
  const atlases = new Map<string, Atlas>();
  const loader = new THREE.TextureLoader();
  let disposed = false;
  let opacity = 1;
  let lastTime: number | undefined;
  let flowTime = 0;

  const imageGeometry = new THREE.PlaneGeometry(ASPECT, 1);
  const edgeGeometry = new THREE.ExtrudeGeometry(roundedRectangle(ASPECT + 0.018, 1.018, 0.041), {
    depth: 0.023,
    bevelEnabled: true,
    bevelSegments: 2,
    steps: 1,
    bevelSize: 0.003,
    bevelThickness: 0.003,
    curveSegments: 5,
  });
  const shadowGeometry = new THREE.PlaneGeometry(2, 1.5);

  function getAtlas(src: string): Atlas {
    const existing = atlases.get(src);
    if (existing) return existing;
    const atlas: Atlas = { texture: new THREE.Texture(), cards: [], ready: false };
    atlases.set(src, atlas);
    atlas.texture = loader.load(src, (texture) => {
      if (disposed) {
        texture.dispose();
        return;
      }
      atlas.ready = true;
      for (const card of atlas.cards) {
        card.texture.image = texture.image;
        card.texture.needsUpdate = true;
        card.loaded = true;
        card.material.uniforms.uLoaded.value = 1;
        updateTextureCrop(card);
      }
    }, undefined, () => {
      // A failed asset has no fake replacement. Keep its clean frame and prevent
      // a popup of a failed image, while other independently loaded cards work.
      for (const card of atlas.cards) {
        card.image.userData.assetLoadFailed = true;
      }
    });
    atlas.texture.colorSpace = THREE.SRGBColorSpace;
    atlas.texture.wrapS = atlas.texture.wrapT = THREE.ClampToEdgeWrapping;
    // Atlas mips can blend neighboring cells; these shallow planes do not need
    // extreme minification, so a padded sample with linear filtering is safer.
    atlas.texture.generateMipmaps = false;
    atlas.texture.minFilter = atlas.texture.magFilter = THREE.LinearFilter;
    return atlas;
  }

  if (assets.length) {
    for (let layer = 0; layer < 3; layer += 1) {
      for (let index = 0; index < countPerLayer; index += 1) {
        const ordinal = layer * countPerLayer + index;
        const asset = assets[ordinal % assets.length];
        const atlas = getAtlas(asset.src);
        const texture = atlas.texture.clone();
        texture.colorSpace = THREE.SRGBColorSpace;
        const material = new THREE.ShaderMaterial({
          vertexShader: imageVertex,
          fragmentShader: imageFragment,
          uniforms: {
            uMap: { value: texture },
            uMapTransform: { value: new THREE.Matrix3() },
            uOpacity: { value: 1 },
            uLoaded: { value: atlas.ready ? 1 : 0 },
          },
          transparent: true,
          depthWrite: false,
          toneMapped: false,
        });
        const edgeMaterial = new THREE.MeshStandardMaterial({
          color: '#f1efe8',
          roughness: 0.48,
          metalness: 0.12,
          transparent: true,
          depthWrite: false,
        });
        const shadowMaterial = new THREE.ShaderMaterial({
          vertexShader: imageVertex,
          fragmentShader: shadowFragment,
          uniforms: { uOpacity: { value: 0.14 } },
          transparent: true,
          depthWrite: false,
          toneMapped: false,
        });
        const cardGroup = new THREE.Group();
        cardGroup.name = `interface-card-${ordinal}-${asset.id}`;
        const edge = new THREE.Mesh(edgeGeometry, edgeMaterial);
        edge.position.z = -0.024;
        const image = new THREE.Mesh(imageGeometry, material);
        image.position.z = 0.006;
        image.name = `interface-image-${ordinal}`;
        image.userData.asset = asset;
        image.userData.streamCardGroup = cardGroup;
        const shadow = new THREE.Mesh(shadowGeometry, shadowMaterial);
        shadow.position.set(0.035, -0.055, -0.055);
        shadow.raycast = () => undefined;
        edge.raycast = () => undefined;
        cardGroup.add(shadow, edge, image);
        group.add(cardGroup);

        const card: Card = {
          asset,
          group: cardGroup,
          image,
          material,
          edgeMaterial,
          shadowMaterial,
          texture,
          layer,
          index,
          variation: Math.sin(ordinal * 2.39996 + 0.9),
          loaded: atlas.ready,
        };
        cards.push(card);
        atlas.cards.push(card);
        if (atlas.ready) {
          texture.needsUpdate = true;
          updateTextureCrop(card);
        }
      }
    }
  }

  function setOpacity(value: number) {
    opacity = clamp01(value);
    group.visible = opacity > 0.001;
    for (const card of cards) {
      card.material.uniforms.uOpacity.value = opacity;
      card.edgeMaterial.opacity = opacity;
      card.shadowMaterial.uniforms.uOpacity.value = opacity * (card.layer === 2 ? 0.16 : 0.11);
    }
  }

  function update(params: StreamUpdate) {
    if (disposed) return;
    const { time, progress, reducedMotion } = params;
    const delta = lastTime === undefined ? 0 : Math.max(0, Math.min(time - lastTime, 0.1));
    lastTime = time;
    // Only advance visible motion. Paused/reduced-motion pages do not accumulate
    // a hidden phase jump when they become active again.
    if (!reducedMotion && opacity > 0.001) flowTime += delta;
    const viewportWidth = Math.max(3.2, params.viewportWidth);
    const heightScale = Math.min(1, Math.max(0.65, params.viewportHeight / 10));
    const entrance = THREE.MathUtils.smoothstep(clamp01(progress), 0, 0.32);
    const spread = THREE.MathUtils.lerp(0.91, 1, entrance);
    const pointerX = reducedMotion ? 0 : THREE.MathUtils.clamp(params.pointerX, -1, 1);
    const pointerY = reducedMotion ? 0 : THREE.MathUtils.clamp(params.pointerY, -1, 1);

    for (const card of cards) {
      // Back → middle → foreground. Each layer is independently recycled only
      // after its entire card has cleared the perspective-adjusted viewport.
      const layer = card.layer;
      const z = [-3.1, -1.1, 0.8][layer];
      const cardHeight = (mobile ? [1.0, 1.22, 1.48] : [1.5, 1.9, 2.38])[layer] * heightScale;
      const size = cardHeight * (1 + card.variation * 0.055);
      const cardWidth = size * ASPECT;
      const visibleWidth = viewportWidth * (CAMERA_Z - z) / CAMERA_Z;
      const period = Math.max(visibleWidth + cardWidth * 2.5, countPerLayer * cardHeight * ASPECT * 1.06);
      const speed = (mobile ? [0.16, -0.21, 0.25] : [0.19, -0.27, 0.36])[layer];
      const rowOffset = [0.18, 0.62, 0.04][layer];
      const x = wrap((card.index + rowOffset) / countPerLayer * period + flowTime * speed, period) - period / 2;
      const screenX = x / Math.max(visibleWidth * 0.5, 1);
      const rowY = (mobile ? [1.75, -0.25, -2.54] : [1.78, -0.34, -2.89])[layer] * heightScale;
      const curve = Math.sin(screenX * 1.18 + layer * 0.7) * (mobile ? 0.16 : 0.27) * heightScale;
      const breathe = reducedMotion ? 0 : Math.sin(flowTime * 0.34 + card.index * 1.7 + layer) * 0.038;
      card.group.position.set(
        x * spread + pointerX * [0.025, 0.045, 0.08][layer],
        rowY + curve + breathe + pointerY * [0.02, 0.035, 0.05][layer],
        z + (1 - entrance) * -0.2,
      );
      card.group.scale.setScalar(size);
      card.group.rotation.set(
        [-0.035, 0.025, -0.025][layer],
        THREE.MathUtils.clamp(screenX, -1.5, 1.5) * (mobile ? -0.045 : -0.072),
        card.variation * (mobile ? 0.018 : 0.027) + Math.sin(screenX) * 0.008,
      );
      // Let Three.js frustum-cull normally; do not hide before a card has exited.
      card.group.visible = opacity > 0.001;
    }
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    for (const card of cards) {
      card.texture.dispose();
      card.material.dispose();
      card.edgeMaterial.dispose();
      card.shadowMaterial.dispose();
    }
    for (const atlas of atlases.values()) atlas.texture.dispose();
    imageGeometry.dispose();
    edgeGeometry.dispose();
    shadowGeometry.dispose();
    group.clear();
    group.removeFromParent();
    cards.length = 0;
    atlases.clear();
  }

  return {
    group,
    update,
    setOpacity,
    getInteractiveMeshes: (): THREE.Object3D[] => cards.map((card) => card.image),
    dispose,
  };
}
