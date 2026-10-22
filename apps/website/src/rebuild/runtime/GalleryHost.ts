import * as THREE from 'three';

export type GalleryViewport = { width: number; height: number; dpr: number };
export type GalleryPoint = { x: number; y: number };
export type GalleryQuad = readonly [GalleryPoint, GalleryPoint, GalleryPoint, GalleryPoint];

/** One transparent renderer, orthographic CSS-pixel camera and no private clock. */
export class GalleryHost {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 4000);
  readonly renderer: THREE.WebGLRenderer | null;
  readonly canvas: HTMLCanvasElement | null;
  private viewport: GalleryViewport = { width: 1, height: 1, dpr: 1 };
  private disposed = false;
  private lost = false;
  private readonly raycaster = new THREE.Raycaster();
  private readonly onLost = (event: Event) => { event.preventDefault(); this.lost = true; this.container.dataset.webgl = 'lost'; this.container.dispatchEvent(new CustomEvent('gallery-context-lost', { bubbles: true })); };
  constructor(private readonly container: HTMLElement) {
    this.camera.position.z = 1000;
    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('webgl') === 'off') {
      this.renderer = null; this.canvas = null; container.dataset.webgl = 'disabled'; return;
    }
    try {
      const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance', premultipliedAlpha: true });
      renderer.setClearColor(0x000000, 0);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.NoToneMapping;
      renderer.autoClear = true;
      renderer.domElement.className = 'rebuild-gallery-canvas';
      renderer.domElement.setAttribute('aria-hidden', 'true');
      renderer.domElement.addEventListener('webglcontextlost', this.onLost);
      container.append(renderer.domElement);
      this.renderer = renderer;
      this.canvas = renderer.domElement;
      container.dataset.webgl = 'ready';
    } catch {
      this.renderer = null; this.canvas = null; container.dataset.webgl = 'failed';
    }
  }
  get ready() { return !!this.renderer && !this.lost && !this.disposed; }
  resize(viewport: GalleryViewport) {
    if (this.disposed) return;
    this.viewport = { width: Math.max(1, viewport.width), height: Math.max(1, viewport.height), dpr: Math.min(2, Math.max(1, viewport.dpr)) };
    const { width, height, dpr } = this.viewport;
    this.camera.left = -width / 2; this.camera.right = width / 2;
    this.camera.top = height / 2; this.camera.bottom = -height / 2;
    this.camera.updateProjectionMatrix(); this.camera.updateMatrixWorld();
    this.renderer?.setPixelRatio(dpr); this.renderer?.setSize(width, height, false);
  }
  /** CSS coordinates are top-left origin; world coordinates use Three's y-up. */
  toWorld(x: number, y: number, z = 0) { return new THREE.Vector3(x - this.viewport.width / 2, this.viewport.height / 2 - y, z); }
  project(point: THREE.Vector3): GalleryPoint {
    const p = point.clone().project(this.camera);
    return { x: (p.x + 1) * this.viewport.width / 2, y: (1 - p.y) * this.viewport.height / 2 };
  }
  projectMatrix(matrix: THREE.Matrix4, width = 1.5, height = 1): GalleryQuad {
    return [new THREE.Vector3(-width / 2, height / 2, 0), new THREE.Vector3(width / 2, height / 2, 0), new THREE.Vector3(width / 2, -height / 2, 0), new THREE.Vector3(-width / 2, -height / 2, 0)].map(p => this.project(p.applyMatrix4(matrix))) as unknown as GalleryQuad;
  }
  projectQuad(object: THREE.Object3D, width = 1.5, height = 1): GalleryQuad { object.updateWorldMatrix(true, false); return this.projectMatrix(object.matrixWorld, width, height); }
  raycast(x: number, y: number, objects: THREE.Object3D[]) {
    if (!this.ready) return [];
    this.raycaster.setFromCamera(new THREE.Vector2(x / this.viewport.width * 2 - 1, 1 - y / this.viewport.height * 2), this.camera);
    return this.raycaster.intersectObjects(objects, false);
  }
  render() { if (this.ready) this.renderer!.render(this.scene, this.camera); }
  dispose() {
    if (this.disposed) return; this.disposed = true;
    this.canvas?.removeEventListener('webglcontextlost', this.onLost);
    this.renderer?.dispose(); this.canvas?.remove(); this.scene.clear();
  }
}
