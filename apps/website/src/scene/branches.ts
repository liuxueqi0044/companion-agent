import * as THREE from 'three';

/**
 * A botanical set, not a tree: two branches enter from outside the left frame.
 * All geometry and textures are original, deterministic, generated locally.
 * Units and mounting points match the shared StoryDirector scene.
 */
export interface BranchScene {
  group: THREE.Group;
  update: (time: number, wind: number) => void;
  dispose: () => void;
}

type Point = [number, number, number];
type Limb = { points: Point[]; radius: number; tip?: number; leaves?: number; seed: number };
type Leaf = { position: THREE.Vector3; rotation: THREE.Euler; scale: Point; color: THREE.Color };

const TAU = Math.PI * 2;

function randomSequence(seed: number) {
  let value = seed >>> 0;
  return () => {
    value = (Math.imul(1664525, value) + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function canvasTexture(width: number, height: number, paint: (context: CanvasRenderingContext2D) => void, color = false) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('A 2D canvas is required for the botanical materials.');
  paint(context);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function makeBarkTextures() {
  const width = 256;
  const height = 512;
  const paint = (ctx: CanvasRenderingContext2D, heightOnly = false) => {
    const random = randomSequence(27291);
    ctx.fillStyle = heightOnly ? '#8c8c8c' : '#58584b';
    ctx.fillRect(0, 0, width, height);
    // Fine longitudinal fibres, interrupted fissures, lichen flecks.
    for (let i = 0; i < 1250; i++) {
      const x = random() * width;
      const y = random() * height;
      const length = 5 + random() * 116;
      const light = random();
      const shade = Math.round(heightOnly ? 70 + light * 125 : 43 + light * 53);
      ctx.strokeStyle = heightOnly
        ? `rgba(${shade},${shade},${shade},${0.2 + random() * 0.45})`
        : `rgba(${shade + 10},${shade + 9},${shade - 2},${0.25 + random() * 0.45})`;
      ctx.lineWidth = 0.3 + random() * 2.2;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.bezierCurveTo(x + (random() - 0.5) * 11, y + length * 0.35, x + (random() - 0.5) * 9, y + length * 0.72, x + (random() - 0.5) * 6, y + length);
      ctx.stroke();
    }
    for (let i = 0; i < 3000; i++) {
      const n = random();
      ctx.fillStyle = heightOnly ? `rgba(220,220,220,${n * 0.15})` : `rgba(163,159,128,${n * 0.36})`;
      ctx.beginPath();
      ctx.ellipse(random() * width, random() * height, 0.3 + random() * 1.7, 0.6 + random() * 3.6, random(), 0, TAU);
      ctx.fill();
    }
  };
  const albedo = canvasTexture(width, height, (ctx) => paint(ctx), true);
  const bump = canvasTexture(width, height, (ctx) => paint(ctx, true));
  [albedo, bump].forEach((texture) => {
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  });
  return { albedo, bump };
}

function makeLeafTextures() {
  const width = 256;
  const height = 512;
  const paint = (ctx: CanvasRenderingContext2D, heightOnly = false) => {
    const random = randomSequence(63332);
    const gradient = ctx.createLinearGradient(0, 0, width, 0);
    if (heightOnly) {
      gradient.addColorStop(0, '#696969');
      gradient.addColorStop(0.48, '#919191');
      gradient.addColorStop(0.52, '#a0a0a0');
      gradient.addColorStop(1, '#666666');
    } else {
      gradient.addColorStop(0, '#63724b');
      gradient.addColorStop(0.30, '#8d9769');
      gradient.addColorStop(0.49, '#a1a77b');
      gradient.addColorStop(0.53, '#7c8b5e');
      gradient.addColorStop(1, '#637549');
    }
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
    // Small-scale epidermal mottling prevents uniformly glossy, plastic leaves.
    for (let i = 0; i < 6500; i++) {
      ctx.fillStyle = heightOnly ? `rgba(210,210,210,${random() * 0.10})` : `rgba(210,211,165,${random() * 0.14})`;
      ctx.fillRect(random() * width, random() * height, 0.5 + random() * 2, 0.5 + random() * 3);
    }
    const vein = (side: number, start: number, lift: number, fine = false) => {
      ctx.strokeStyle = heightOnly ? (fine ? '#989898' : '#b0b0b0') : (fine ? 'rgba(191,198,146,0.18)' : 'rgba(189,194,145,0.48)');
      ctx.lineWidth = fine ? 0.7 : 1.35;
      ctx.beginPath();
      ctx.moveTo(width * 0.5, start);
      ctx.bezierCurveTo(width * (0.5 + side * 0.13), start - lift * 0.5, width * (0.5 + side * 0.32), start - lift, width * (0.5 + side * 0.49), start - lift * 1.24);
      ctx.stroke();
    };
    for (let i = 0; i < 16; i++) {
      const y = 68 + i * 27;
      vein(-1, y, 39 + random() * 10);
      vein(1, y + 8, 40 + random() * 10);
      vein(-1, y + 13, 29, true);
      vein(1, y + 19, 30, true);
    }
    ctx.strokeStyle = heightOnly ? '#d5d5d5' : 'rgba(203,206,165,0.70)';
    ctx.lineWidth = heightOnly ? 3.0 : 2.1;
    ctx.beginPath();
    ctx.moveTo(width * 0.5, height);
    ctx.bezierCurveTo(width * 0.492, height * 0.7, width * 0.51, height * 0.36, width * 0.5, 0);
    ctx.stroke();
  };
  return {
    albedo: canvasTexture(width, height, (ctx) => paint(ctx), true),
    bump: canvasTexture(width, height, (ctx) => paint(ctx, true)),
  };
}

/** Lenticular, cupped leaves have a physical silhouette, no rectangular sprites. */
function leafGeometry() {
  const positions: number[] = [];
  const uv: number[] = [];
  const indices: number[] = [];
  const rows = 22;
  const columns = 10;
  for (let row = 0; row <= rows; row++) {
    const t = row / rows;
    const width = Math.pow(Math.sin(Math.PI * t), 0.87) * (0.255 - 0.046 * t);
    const bend = 0.075 * Math.sin(t * Math.PI) - 0.13 * t * t * t;
    for (let col = 0; col <= columns; col++) {
      const s = (col / columns) * 2 - 1;
      const asymmetry = 1 + 0.09 * Math.sin(t * 7 + s * 2);
      positions.push(s * width * asymmetry + 0.04 * t * t, t, bend - 0.085 * s * s * Math.sin(Math.PI * t) + 0.014 * Math.sin(t * 18 + s) * s * s);
      uv.push(col / columns, t);
    }
  }
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < columns; col++) {
      const a = row * (columns + 1) + col;
      indices.push(a, a + 1, a + columns + 1, a + 1, a + columns + 2, a + columns + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/** Merge organic sweeps in one geometry: no visible cylinder end-caps at forks. */
function makeLimbGeometry(limbs: Limb[]) {
  const positions: number[] = [];
  const colors: number[] = [];
  const uv: number[] = [];
  const indices: number[] = [];
  const offset = new THREE.Vector3();
  for (const limb of limbs) {
    const curve = new THREE.CatmullRomCurve3(limb.points.map((p) => new THREE.Vector3(...p)));
    const length = curve.getLength();
    const segments = Math.max(12, Math.ceil(length * 15));
    const radial = limb.radius > 0.065 ? 14 : 9;
    const frames = curve.computeFrenetFrames(segments, false);
    const start = positions.length / 3;
    const random = randomSequence(limb.seed);
    const phase = random() * TAU;
    const tint = 0.93 + random() * 0.13;
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const point = curve.getPointAt(t);
      const radius = THREE.MathUtils.lerp(limb.radius, limb.tip ?? 0.009, Math.pow(t, 0.78));
      const knot = 1 + 0.09 * Math.sin(t * length * 15 + phase) + 0.05 * Math.sin(t * length * 37);
      for (let j = 0; j <= radial; j++) {
        const theta = j / radial * TAU;
        const groove = 1 + 0.075 * Math.sin(theta * 5 + t * 3 + phase) + 0.032 * Math.sin(theta * 9 - t * 9);
        offset.copy(frames.normals[i]).multiplyScalar(Math.cos(theta)).addScaledVector(frames.binormals[i], Math.sin(theta)).multiplyScalar(radius * knot * groove);
        positions.push(point.x + offset.x, point.y + offset.y, point.z + offset.z);
        uv.push(j / radial, t * length * 1.55);
        const fleck = tint + 0.055 * Math.sin(theta * 3 + t * 20);
        colors.push(fleck, fleck, fleck * 0.985);
      }
    }
    for (let i = 0; i < segments; i++) {
      for (let j = 0; j < radial; j++) {
        const a = start + i * (radial + 1) + j;
        const b = a + radial + 1;
        indices.push(a, a + 1, b, b, a + 1, b + 1);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

export async function createBranches(): Promise<BranchScene> {
  const group = new THREE.Group();
  group.name = 'Morrow / living olive branches';
  const resources: Array<{ dispose: () => void }> = [];
  const bark = makeBarkTextures();
  const leaf = makeLeafTextures();
  resources.push(bark.albedo, bark.bump, leaf.albedo, leaf.bump);
  const barkMaterial = new THREE.MeshStandardMaterial({
    color: '#b0b1a8', map: bark.albedo, bumpMap: bark.bump, bumpScale: 0.035,
    roughness: 0.92, metalness: 0, vertexColors: true,
  });
  const leafMaterial = new THREE.MeshStandardMaterial({
    color: '#d8ddbe', map: leaf.albedo, bumpMap: leaf.bump, bumpScale: 0.017,
    roughness: 0.65, metalness: 0, side: THREE.DoubleSide,
  });
  const timeUniform = { value: 0 };
  const windUniform = { value: 0.35 };
  leafMaterial.onBeforeCompile = (shader) => {
    shader.uniforms.uBranchTime = timeUniform;
    shader.uniforms.uBranchWind = windUniform;
    shader.vertexShader = `uniform float uBranchTime;\nuniform float uBranchWind;\n${shader.vertexShader}`;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `
      #include <begin_vertex>
      float botanicalPhase = instanceMatrix[3].x * 0.71 + instanceMatrix[3].y * 1.13 + instanceMatrix[3].z * 2.0;
      float botanicalBend = position.y * position.y;
      transformed.x += sin(uBranchTime * 1.18 + botanicalPhase) * 0.026 * uBranchWind * botanicalBend;
      transformed.z += (sin(uBranchTime * 0.92 + botanicalPhase) * 0.05 + sin(uBranchTime * 2.1 + botanicalPhase * 1.7) * 0.014) * uBranchWind * botanicalBend;
    `);
    // A paler reverse and gentle transmitted fill approximate thin living tissue.
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `
      #include <color_fragment>
      if (!gl_FrontFacing) diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.48, 0.53, 0.36), 0.24);
    `);
    shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', `
      outgoingLight += diffuseColor.rgb * 0.045;
      #include <opaque_fragment>
    `);
  };
  leafMaterial.customProgramCacheKey = () => 'morrow-botanical-leaf-v1';
  resources.push(barkMaterial, leafMaterial);

  const limbs: Limb[] = [
    // Old stems enter the frame; their parent tree is never visible.
    { points: [[-10.8,0.4,-0.8],[-9.3,1.6,-0.55],[-7.5,3.0,-0.25],[-5.4,3.95,-0.35],[-2.8,4.55,-0.65],[-0.15,5.2,-0.5]], radius: 0.21, tip: 0.025, seed: 1 },
    { points: [[-10.5,0.75,-0.95],[-8.2,0.9,-0.2],[-6.45,0.7,-0.08],[-4.55,-0.05,-0.25],[-2.2,-1.15,-0.45],[-0.2,-3.7,-0.7]], radius: 0.15, tip: 0.018, seed: 2 },
    { points: [[-9.5,1.8,-0.65],[-8.5,3.5,-0.8],[-7.2,4.95,-0.4],[-6.5,5.6,-0.65]], radius: 0.13, tip: 0.012, leaves: 7, seed: 3 },
    { points: [[-8.1,2.55,-0.2],[-6.9,3.5,0.3],[-5.4,3.25,0.18],[-3.6,2.5,0.2],[-2.8,2.1,0.1]], radius: 0.10, tip: 0.012, leaves: 6, seed: 4 },
    { points: [[-5.4,3.95,-0.35],[-4.45,4.15,-0.15],[-2.65,3.8,0.1],[-1.75,3.4,0.45],[-0.7,2.65,0.35]], radius: 0.08, tip: 0.008, leaves: 9, seed: 5 },
    { points: [[-6.45,0.7,-0.08],[-5.0,0.5,0.1],[-3.65,0.45,-0.05],[-2.1,0.35,0.2],[-1.25,0.3,0.34],[-0.35,-0.1,0.08]], radius: 0.070, tip: 0.008, leaves: 7, seed: 6 },
    { points: [[-8.2,0.9,-0.2],[-7.15,0.6,-0.0],[-6.1,0.28,0.35],[-5.2,-0.3,0.1]], radius: 0.055, tip: 0.009, leaves: 4, seed: 7 },
    { points: [[-7.8,0.85,-0.25],[-6.5,-0.9,-0.35],[-4.95,-1.0,-0.1],[-3.75,-0.92,0.4],[-2.55,-1.3,0.2]], radius: 0.065, tip: 0.009, leaves: 5, seed: 8 },
    { points: [[-8.5,0.9,-0.3],[-8.0,-1.0,-0.3],[-6.6,-2.4,-0.45],[-4.7,-3.6,-0.55],[-2.0,-4.9,-0.8]], radius: 0.09, tip: 0.012, leaves: 11, seed: 9 },
    // Distant foliage adds depth without filling the readable right-hand space.
    { points: [[-10.5,-3.1,-2.0],[-8.65,-1.3,-1.8],[-7.6,0.3,-1.75],[-6.8,2.35,-1.55]], radius: 0.07, tip: 0.01, leaves: 9, seed: 10 },
    { points: [[-9.5,4.8,-1.8],[-7.55,4.2,-1.8],[-5.7,4.95,-1.8],[-3.3,5.45,-1.9]], radius: 0.06, tip: 0.01, leaves: 9, seed: 11 },
  ];

  const leaves: Leaf[] = [];
  const random = randomSequence(564812);
  const originalLimbs = limbs.slice();
  const addLeaf = (position: THREE.Vector3, direction: THREE.Vector3, size: number, index: number, seed: number) => {
    // A leaf's long axis originates at the petiole and twists around the twig.
    const rotation = new THREE.Euler(
      -0.72 + random() * 1.5,
      -0.68 + random() * 1.36,
      Math.atan2(-direction.x, direction.y),
      'ZYX',
    );
    const color = new THREE.Color().setHSL(0.19 + random() * 0.045, 0.14 + random() * 0.08, 0.65 + random() * 0.17);
    leaves.push({ position: position.clone(), rotation, scale: [size * (0.88 + random() * 0.25), size, size], color });
    // Short real petioles are visibly connected, unlike a cloud of leaf sprites.
    const leafBase = position.clone().addScaledVector(direction, -0.10 * size);
    limbs.push({ points: [leafBase.toArray() as Point, position.toArray() as Point], radius: 0.007 + size * 0.003, tip: 0.0035, seed: seed * 100 + index });
  };

  for (const limb of originalLimbs) {
    const count = limb.leaves ?? 0;
    if (!count) continue;
    const curve = new THREE.CatmullRomCurve3(limb.points.map((p) => new THREE.Vector3(...p)));
    const perLimb = randomSequence(limb.seed * 2887);
    for (let i = 0; i < count; i++) {
      const t = 0.20 + (i / count) * 0.77;
      const origin = curve.getPoint(t);
      const tangent = curve.getTangent(t);
      const side = i % 2 ? 1 : -1;
      const reach = 0.28 + perLimb() * 0.50;
      const twigDirection = new THREE.Vector3(tangent.x * 0.55 + side * 0.35, tangent.y * 0.45 + side * 0.76, (perLimb() - 0.5) * 0.65).normalize();
      const end = origin.clone().addScaledVector(twigDirection, reach);
      // Keep plants out of the title column even at the tip of the rightmost leaf.
      if (end.x > -0.6) end.x = -0.6;
      const midpoint = origin.clone().lerp(end, 0.5).add(new THREE.Vector3(0, 0.06, 0.08));
      limbs.push({ points: [origin.toArray() as Point, midpoint.toArray() as Point, end.toArray() as Point], radius: 0.017 + perLimb() * 0.006, tip: 0.006, seed: limb.seed * 78 + i });
      const size = 0.58 + perLimb() * 0.48;
      const leafDirection = twigDirection.clone().add(new THREE.Vector3(0.15, -0.48, 0)).normalize();
      addLeaf(end, leafDirection, size, i, limb.seed);
      if (i % 3 !== 0) {
        const pairPosition = origin.clone().lerp(end, 0.55);
        const pairDirection = new THREE.Vector3(tangent.x * 0.25 - side * 0.7, tangent.y * 0.2 - side * 0.6 - 0.25, 0).normalize();
        addLeaf(pairPosition, pairDirection, size * 0.79, i + 100, limb.seed);
      }
    }
  }

  // Selected outer shoots frame the cards; they are intentionally irregular.
  const accents: Array<{ p: Point; d: Point; s: number }> = [
    { p: [-8.7,-1.2,0.9], d: [0.25,-1,0], s: 1.75 },
    { p: [-8.2,3.9,0.7], d: [-0.1,-1,0], s: 1.45 },
    { p: [-6.0,5.3,0.4], d: [0.5,-1,0], s: 1.3 },
    { p: [-0.62,3.04,0.05], d: [0.35,-1,0], s: 1.15 },
    { p: [-0.9,-3.65,0.5], d: [0.2,-1,0], s: 1.3 },
    { p: [-4.4,-3.8,0.4], d: [-0.2,-1,0], s: 1.4 },
  ];
  const connectToBranch = (end: THREE.Vector3, seed: number, thickness = 0.018) => {
    let distance = Infinity;
    let nearest = end.clone();
    for (const limb of originalLimbs) {
      const curve = new THREE.CatmullRomCurve3(limb.points.map((p) => new THREE.Vector3(...p)));
      for (let sample = 0; sample <= 60; sample++) {
        const point = curve.getPoint(sample / 60);
        const candidateDistance = point.distanceToSquared(end);
        if (candidateDistance < distance) {
          distance = candidateDistance;
          nearest = point;
        }
      }
    }
    if (distance < 0.001) return;
    const midpoint = nearest.clone().lerp(end, 0.53).add(new THREE.Vector3(-0.03, 0.045, 0.035));
    limbs.push({ points: [nearest.toArray() as Point, midpoint.toArray() as Point, end.toArray() as Point], radius: thickness, tip: 0.007, seed });
  };
  accents.forEach(({p,d,s}, i) => {
    connectToBranch(new THREE.Vector3(...p), 723 + i, 0.023);
    addLeaf(new THREE.Vector3(...p), new THREE.Vector3(...d).normalize(), s, i, 341);
  });

  const mountingPoints: Point[] = [
    [-6.9,3.5,0.30], [-4.35,2.5,0.25], [-1.75,3.4,0.45],
    [-6.1,0.28,0.35], [-3.75,-0.92,0.40], [-1.25,0.3,0.34],
  ];
  mountingPoints.forEach((p, i) => connectToBranch(new THREE.Vector3(...p), 821 + i, 0.022));

  const branchesGeometry = makeLimbGeometry(limbs);
  const branches = new THREE.Mesh(branchesGeometry, barkMaterial);
  branches.name = 'Tapered olive wood / continuous sweeps';
  branches.castShadow = branches.receiveShadow = true;
  group.add(branches);
  resources.push(branchesGeometry);

  const geometry = leafGeometry();
  const foliage = new THREE.InstancedMesh(geometry, leafMaterial, leaves.length);
  foliage.name = 'Cupped olive and sage leaves / instanced';
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  leaves.forEach((item, i) => {
    quaternion.setFromEuler(item.rotation);
    matrix.compose(item.position, quaternion, new THREE.Vector3(...item.scale));
    foliage.setMatrixAt(i, matrix);
    foliage.setColorAt(i, item.color);
  });
  foliage.instanceMatrix.needsUpdate = true;
  if (foliage.instanceColor) foliage.instanceColor.needsUpdate = true;
  foliage.castShadow = foliage.receiveShadow = true;
  foliage.computeBoundingSphere();
  group.add(foliage);
  resources.push(geometry, foliage);

  // Mounts are available to the host for alignment/debug, and render nothing.
  mountingPoints.forEach((position, i) => {
    const anchor = new THREE.Object3D();
    anchor.name = `card-branch-anchor-${i}`;
    anchor.position.set(...position);
    group.add(anchor);
  });
  group.userData = {
    ...group.userData, mountingPoints, leafCount: leaves.length, branchCount: limbs.length,
    provenance: 'Original procedural geometry and canvas textures; no third-party media.',
  };

  let disposed = false;
  return {
    group,
    update(time, wind) {
      if (disposed) return;
      timeUniform.value = Number.isFinite(time) ? time : 0;
      windUniform.value = THREE.MathUtils.clamp(wind, 0, 1);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      resources.forEach((resource) => resource.dispose());
      group.clear();
      group.removeFromParent();
    },
  };
}
