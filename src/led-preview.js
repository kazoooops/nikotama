import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { resolution1, planeConfigs1 } from './modules/planeConfigs1';
import { resolution2, planeConfigs2 } from './modules/planeConfigs2';
import { resolution3, planeConfigs3 } from './modules/planeConfigs3';

const status = document.getElementById('status');

function fail(error) {
  status.hidden = false;
  status.style.background = '#600';
  status.textContent = error?.stack || String(error);
}

window.addEventListener('error', event => {
  fail(event.error || event.message);
});

window.addEventListener('unhandledrejection', event => {
  fail(event.reason);
});

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.onload = resolve;
    script.onerror = () => {
      reject(new Error('読み込めません: ' + src));
    };
    document.head.appendChild(script);
  });
}

function makePreview(source, type) {
  const layouts = {
    type1: [resolution1, planeConfigs1],
    type2: [resolution2, planeConfigs2],
    type3: [resolution3, planeConfigs3]
  };

  const [resolution, configs] = layouts[type];

  if (
    source.width !== resolution.x ||
    source.height !== resolution.y
  ) {
    throw new Error(
      '描画サイズが一致しません: ' +
      source.width + ' × ' + source.height
    );
  }

  source.style.setProperty('display', 'none', 'important');

  const renderer = new THREE.WebGLRenderer({
    antialias: true
  });

  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.setClearColor(0x000000);
  renderer.domElement.style.cssText =
    'position:fixed;inset:0;display:block;';

  document.body.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(
    40, 1, 0.01, 100
  );

  const controls = new OrbitControls(
    camera,
    renderer.domElement
  );

  controls.enableDamping = false;
  controls.enablePan = false;
  controls.minDistance = 1.2;
  controls.maxDistance = 12;

  const texture = new THREE.CanvasTexture(source);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;

  const material = new THREE.MeshBasicMaterial({
    map: texture,
    side: THREE.DoubleSide,
    toneMapped: false
  });

  for (const config of configs) {
    const w = config.fboSize.x;
    const h = config.fboSize.y;

    const left =
      resolution.x / 2 + config.screenPosition.x - w / 2;

    const top =
      resolution.y / 2 - config.screenPosition.y - h / 2;

    const u0 = Math.max(0, -left / w);
    const u1 = Math.min(1, (resolution.x - left) / w);
    const t0 = Math.max(0, -top / h);
    const t1 = Math.min(1, (resolution.y - top) / h);

    if (u1 <= u0 || t1 <= t0) continue;

    const geometry = new THREE.PlaneGeometry(
      u1 - u0,
      t1 - t0
    );

    geometry.translate(
      (u0 + u1) / 2 - 0.5,
      0.5 - (t0 + t1) / 2,
      0.5
    );

    geometry.translate(
      -config.offsetPos.x,
      -config.offsetPos.y,
      0
    );

    geometry.scale(
      config.scale.x,
      config.scale.y,
      1
    );

    geometry.translate(
      config.offsetPos.x,
      config.offsetPos.y,
      0
    );

    geometry.rotateX(config.rotation.x);
    geometry.rotateY(config.rotation.y);

    const uv = geometry.attributes.uv;

    for (let i = 0; i < uv.count; i++) {
      const x = u0 + uv.getX(i) * (u1 - u0);
      const y = t0 + (1 - uv.getY(i)) * (t1 - t0);

      uv.setXY(
        i,
        (left + x * w) / resolution.x,
        1 - (top + y * h) / resolution.y
      );
    }

    uv.needsUpdate = true;

    scene.add(new THREE.Mesh(geometry, material));

    scene.add(
      new THREE.LineSegments(
        new THREE.EdgesGeometry(geometry),
        new THREE.LineBasicMaterial({
          color: 0x666666
        })
      )
    );
  }

  const box = new THREE.Box3().setFromObject(scene);
  const center = box.getCenter(new THREE.Vector3());

  const radius = box.getBoundingSphere(
    new THREE.Sphere()
  ).radius;

  controls.target.copy(center);

  camera.position.copy(center).add(
    new THREE.Vector3(-1.6, 1.2, 2)
  );

  function render() {
    renderer.render(scene, camera);
  }

  function resize() {
    renderer.setSize(innerWidth, innerHeight);

    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();

    const vertical = THREE.MathUtils.degToRad(
      camera.fov / 2
    );

    const horizontal = Math.atan(
      Math.tan(vertical) * camera.aspect
    );

    const distance =
      radius /
      Math.sin(Math.min(vertical, horizontal)) *
      1.15;

    const direction = camera.position
      .clone()
      .sub(controls.target)
      .normalize();

    camera.position
      .copy(controls.target)
      .addScaledVector(direction, distance);

    controls.update();
    render();
  }

  controls.addEventListener('change', render);
  window.addEventListener('resize', resize);
  resize();

  const hint = document.createElement('div');
  hint.textContent =
    'ドラッグ: 回転 / ホイール: 拡大・縮小';

  hint.style.cssText =
    'position:fixed;left:12px;bottom:12px;' +
    'color:#bbb;font:12px sans-serif;' +
    'pointer-events:none;z-index:10;';

  document.body.appendChild(hint);

  return () => {
    texture.needsUpdate = true;
    render();
  };
}

async function start() {
  try {
    if (document.readyState !== 'complete') {
      await new Promise(resolve => {
        window.addEventListener('load', resolve, {
          once: true
        });
      });
    }

    const params = new URLSearchParams(location.search);
    const type = params.get('cubeType') || 'type1';

    if (!['type1', 'type2', 'type3'].includes(type)) {
      throw new Error('cubeType が不正です');
    }

    const debug = ['true', '1'].includes(
      params.get('debug')
    );

    status.textContent = 'p5.js を読み込み中…';

    await loadScript(
      'https://cdnjs.cloudflare.com/ajax/libs/p5.js/1.11.3/p5.min.js'
    );

    await loadScript('./led-sketch.js');

    if (
      typeof window.setup !== 'function' ||
      typeof window.draw !== 'function'
    ) {
      throw new Error(
        'led-sketch.js の setup / draw が見つかりません'
      );
    }

    const originalSetup = window.setup;
    const originalDraw = window.draw;

    let updatePreview;

    window.setup = function () {
      originalSetup();

      if (debug) {
        const source = document.getElementById(
          'mainCanvas'
        );

        if (!source) {
          throw new Error('mainCanvas が見つかりません');
        }

        updatePreview = makePreview(source, type);
      }

      status.hidden = true;
    };

    window.draw = function () {
      originalDraw();

      if (updatePreview) {
        updatePreview();
      }
    };

    new window.p5();
  } catch (error) {
    fail(error);
  }
}

start();