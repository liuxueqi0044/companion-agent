import * as THREE from 'three';
import { galleryPose } from './gallery-motion';
import type { SceneFrame, SceneModule, Viewport, HandoffAnchor } from '../types';
import { GalleryHost } from '../runtime/GalleryHost';
import { galleryAssets, galleryAssetById, galleryCommunityAssets, type GalleryAsset } from '../content/gallery';
import { communityAssetVersion } from '../content/community';

type Pose = { x: number; y: number; z: number; width: number; height: number; rx: number; ry: number; rz: number; opacity: number };
type Card = { instanceId: string; asset: GalleryAsset; band: number; index: number; count: number; node: THREE.Group; image: THREE.Mesh; material: THREE.ShaderMaterial; shadow: THREE.ShaderMaterial; loaded: boolean };
type Bitmap = { texture: THREE.Texture; status: 'loading' | 'ready' | 'failed'; promise: Promise<boolean> };

const vertex = `varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`;
const fragment = `
uniform sampler2D uMap; uniform vec4 uUv; uniform float uOpacity; uniform float uRadius; uniform float uMist; varying vec2 vUv;
float rounded(vec2 p,vec2 b,float r){vec2 q=abs(p)-b+r;return min(max(q.x,q.y),0.)+length(max(q,0.))-r;}
void main(){float d=rounded((vUv-.5)*vec2(1.5,1.),vec2(.75,.5),uRadius);float aa=max(fwidth(d),.0006);float mask=1.-smoothstep(-aa,aa,d);if(mask<.001)discard;
vec4 picture=texture2D(uMap,uUv.xy+vUv*uUv.zw);vec3 col=mix(picture.rgb,vec3(.87,.85,.79),uMist);
float rim=1.-smoothstep(0.,.006,abs(d+.005));col=mix(col,vec3(.94,.93,.88),rim*.78);
gl_FragColor=vec4(col,mask*uOpacity);#include <colorspace_fragment>
}`;
const shadowFragment = `uniform float uOpacity;varying vec2 vUv;void main(){vec2 q=abs((vUv-.5)*vec2(1.8,1.3))-vec2(.74,.49);float d=length(max(q,0.));float a=exp(-d*d/.009)*uOpacity;gl_FragColor=vec4(.15,.16,.11,a);#include <colorspace_fragment>}`;

/** Shared renderer and clock are injected. All geometry can be sampled at any progress. */
export function createGalleryScene(root: HTMLElement, host: GalleryHost, onOpen: (id: string) => void): SceneModule {
  let viewport: Viewport = { width: 1440, height: 900, dpr: 1, layout: 'desktop' };
  let frame: SceneFrame | undefined;
  let disposed = false;
  let fallbackLatched = !host.ready;
  const group = new THREE.Group(); group.name = 'morrow-curved-gallery'; host.scene.add(group);
  const cards: Card[] = [];
  const bitmaps = new Map<string, Bitmap>();
  const imageGeometry = new THREE.PlaneGeometry(1.5, 1);
  const shadowGeometry = new THREE.PlaneGeometry(1.8, 1.3);
  const loader = new THREE.TextureLoader();
  root.classList.add('rebuild-gallery');
  const fallback = document.createElement('img');
  fallback.className = 'gallery-art-fallback'; fallback.src = '/rebuild/gallery/gallery-fallback.webp'; fallback.alt = ''; fallback.decoding = 'async';
  root.append(fallback);
  const foliage = document.createElement('div'); foliage.className = 'gallery-foliage'; foliage.setAttribute('aria-hidden', 'true'); root.append(foliage);
  const accessibility = document.createElement('div'); accessibility.className = 'gallery-accessible-list'; accessibility.setAttribute('aria-label', 'Explore assistant interface concepts');
  for (const asset of [...galleryAssets.filter(a => a.tier === 'near'), ...galleryCommunityAssets]) {
    const button = document.createElement('button'); button.type = 'button'; button.textContent = asset.title; button.addEventListener('click', () => onOpen(asset.id)); accessibility.append(button);
  }
  root.append(accessibility);

  function bitmap(src: string) {
    const found = bitmaps.get(src); if (found) return found;
    let resolve!: (ready: boolean) => void;
    const result: Bitmap = { texture: new THREE.Texture(), status: 'loading', promise: new Promise(r => { resolve = r; }) };
    bitmaps.set(src, result);
    result.texture = loader.load(src, texture => {
      if (disposed) { texture.dispose(); resolve(false); return; }
      result.status = 'ready';
      for (const card of cards.filter(c => c.asset.src === src)) { card.loaded = true; card.material.uniforms.uUv.value.copy(uvFor(card.asset, texture)); }
      resolve(true);
    }, undefined, () => { result.status = 'failed'; resolve(false); });
    result.texture.colorSpace = THREE.SRGBColorSpace;
    result.texture.minFilter = THREE.LinearFilter; result.texture.magFilter = THREE.LinearFilter;
    result.texture.generateMipmaps = false; result.texture.wrapS = result.texture.wrapT = THREE.ClampToEdgeWrapping;
    return result;
  }
  function uvFor(asset: GalleryAsset, texture: THREE.Texture) {
    const crop = asset.crop ?? { x: 0, y: 0, w: 1, h: 1 };
    const image = texture.image as { width?: number; height?: number } | undefined;
    const sw = image?.width || 1200, sh = image?.height || 800;
    const aspect = sw * crop.w / (sh * crop.h);
    const cw = crop.w * Math.min(1, 1.5 / aspect), ch = crop.h * Math.min(1, aspect / 1.5);
    const gutterX = asset.crop ? 1 / sw : 0, gutterY = asset.crop ? 1 / sh : 0;
    return new THREE.Vector4(crop.x + (crop.w - cw) / 2 + gutterX, 1 - crop.y - crop.h + (crop.h - ch) / 2 + gutterY, cw - 2 * gutterX, ch - 2 * gutterY);
  }
  function addCard(asset: GalleryAsset, band: number, index: number, count: number, instanceId: string) {
    const tex = bitmap(asset.src);
    const material = new THREE.ShaderMaterial({ vertexShader: vertex, fragmentShader: fragment.replaceAll(';#include', ';\n#include'), transparent: true, depthWrite: false, toneMapped: false, uniforms: {
      uMap: { value: tex.texture }, uUv: { value: uvFor(asset, tex.texture) }, uOpacity: { value: 0 }, uRadius: { value: .024 }, uMist: { value: band < 2 ? .15 : 0 },
    } });
    const shadowMaterial = new THREE.ShaderMaterial({ vertexShader: vertex, fragmentShader: shadowFragment.replaceAll(';#include', ';\n#include'), transparent: true, depthWrite: false, toneMapped: false, uniforms: { uOpacity: { value: 0 } } });
    const node = new THREE.Group(); node.name = instanceId;
    const shadow = new THREE.Mesh(shadowGeometry, shadowMaterial); shadow.position.set(.016, -.034, -.018); shadow.raycast = () => undefined;
    const image = new THREE.Mesh(imageGeometry, material); image.userData.instanceId = instanceId; image.userData.assetId = asset.id;
    node.add(shadow, image); group.add(node);
    cards.push({ instanceId, asset, band, index, count, node, image, material, shadow: shadowMaterial, loaded: tex.status === 'ready' });
  }
  // Two distant arcs, a middle ribbon and one near ribbon. Each has its own
  // continuous phase. Recycle points are more than a full card beyond the edge.
  const distant = galleryAssets;
  for (let i = 0; i < 18; i++) addCard(distant[i % 24], 0, i, 18, `gallery-far-top-${i}`);
  for (let i = 0; i < 18; i++) addCard(distant[(i + 12) % 24], 1, i, 18, `gallery-far-bottom-${i}`);
  const middle = galleryAssets.filter(a => a.tier === 'middle');
  for (let i = 0; i < 12; i++) addCard(middle[(i * 5 + 1) % middle.length], 2, i, 12, `gallery-middle-${i}`);
  const nearIds = ['frame', 'milo', 'studio-moss', 'orbit', 'fieldnotes', 'terminal-one', 'luna', 'atelier'];
  nearIds.forEach((id, i) => addCard(galleryAssetById.get(id)!, 3, i, 8, id === 'frame' ? 'gallery-frame' : id === 'fieldnotes' ? 'gallery-fieldnotes' : `gallery-near-${id}`));
  galleryCommunityAssets.forEach((asset, i) => addCard(asset, 4, i, 3, asset.id));

  const pose = (card: Card, current: SceneFrame) => galleryPose(card, viewport, current);
  function matrixFor(p: Pose) {
    return new THREE.Matrix4().compose(host.toWorld(p.x, p.y, p.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(p.rx, p.ry, p.rz)), new THREE.Vector3(p.height, p.height, p.height));
  }
  let pointerDown: { x: number; y: number } | undefined;
  const onPointerDown = (event: PointerEvent) => { pointerDown = { x: event.clientX, y: event.clientY }; };
  const onPointerUp = (event: PointerEvent) => {
    if (!pointerDown || !frame?.active || fallbackLatched || frame.quality === 'static' || event.target instanceof Element && event.target.closest('button,a')) return;
    const start = pointerDown; pointerDown = undefined;
    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 8) return;
    const bounds = root.getBoundingClientRect();
    const hit = host.raycast(event.clientX - bounds.left, event.clientY - bounds.top, cards.filter(c => c.loaded && c.node.visible && c.asset.tier !== 'restricted').map(c => c.image))[0];
    if (hit?.object.userData.assetId) onOpen(hit.object.userData.assetId);
  };
  root.addEventListener('pointerdown', onPointerDown); root.addEventListener('pointerup', onPointerUp);
  const contextLost = () => { fallbackLatched = true; root.dataset.galleryMode = 'fallback'; group.visible = false; };
  root.addEventListener('gallery-context-lost', contextLost);
  host.canvas?.addEventListener('webglcontextlost', contextLost);
  const ready = Promise.all([...bitmaps.values()].map(b => b.promise)).then(results => {
    const required = ['frame', 'fieldnotes', ...galleryCommunityAssets.map(a => a.id)];
    const handoffUnavailable = required.some(id => bitmaps.get(galleryAssetById.get(id)!.src)?.status !== 'ready');
    if (!results.some(Boolean) || !host.ready || handoffUnavailable) fallbackLatched = true;
    root.dataset.galleryMode = fallbackLatched ? 'fallback' : 'live';
    return fallbackLatched ? 'fallback' as const : 'ready' as const;
  });
  return {
    ready,
    resize(v) { viewport = v; if (frame) this.update(frame); },
    update(current) {
      if (disposed) return; frame = current;
      const staticView = fallbackLatched || current.quality === 'static';
      root.dataset.galleryMode = staticView ? 'fallback' : 'live';
      fallback.style.opacity = '1';
      accessibility.inert = !current.active;
      group.visible = !staticView && current.opacity > .001;
      const hidden = new Set(current.handoffHiddenIds);
      for (const card of cards) {
        const p = pose(card, current);
        card.node.matrixAutoUpdate = false; card.node.matrix.copy(matrixFor(p)); card.node.matrixWorldNeedsUpdate = true;
        card.node.visible = card.loaded && p.opacity > .005 && !hidden.has(card.instanceId);
        const opacity = p.opacity;
        card.material.uniforms.uOpacity.value = opacity;
        card.material.uniforms.uRadius.value = Math.min(.07, 6 / p.height);
        card.shadow.uniforms.uOpacity.value = opacity * (card.band >= 3 ? .16 : .10);
        card.node.renderOrder = card.band * 3;
      }
    },
    sampleHandoff(instanceId, current): HandoffAnchor | undefined {
      const card = cards.find(c => c.instanceId === instanceId); if (!card) return undefined;
      const p = pose(card, current);
      return { instanceId, assetId: card.asset.id, assetVersion: card.band === 4 ? communityAssetVersion : 'gallery-v1', src: card.asset.src, width: p.width, height: p.height, borderRadius: 6,
        quad: host.projectMatrix(matrixFor(p)), uv: { x: 0, y: 0, w: 1, h: 1 }, appearanceId: 'gallery-paper-6', occlusionGroup: 'gallery-front', };
    },
    dispose() {
      if (disposed) return; disposed = true;
      root.removeEventListener('pointerdown', onPointerDown); root.removeEventListener('pointerup', onPointerUp);
      root.removeEventListener('gallery-context-lost', contextLost); host.canvas?.removeEventListener('webglcontextlost', contextLost);
      for (const card of cards) { card.material.dispose(); card.shadow.dispose(); }
      for (const b of bitmaps.values()) b.texture.dispose(); bitmaps.clear();
      imageGeometry.dispose(); shadowGeometry.dispose(); group.clear(); group.removeFromParent(); fallback.remove(); foliage.remove(); accessibility.remove();
    },
  };
}
