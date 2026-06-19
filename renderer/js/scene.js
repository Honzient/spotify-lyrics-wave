/**
 * scene.js — Three.js 3D 海洋场景
 *
 * - 沙滩视角相机 (PerspectiveCamera, 侧视略俯角)
 * - 高细分 PlaneGeometry + 自定义 ShaderMaterial
 * - 天空球
 * - 渲染循环
 */

const OceanScene = (() => {
  'use strict';

  let _renderer, _scene, _camera, _ocean, _material, _clock;
  let _isRunning = false, _animId = null;

  // =========================================================================
  // 初始化
  // =========================================================================
  function init(canvas) {
    // ── 渲染器 ────────────────────────────────────────
    _renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance'
    });
    _renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    _renderer.setSize(window.innerWidth, window.innerHeight);
    _renderer.outputColorSpace = THREE.SRGBColorSpace;
    _renderer.toneMapping = THREE.ACESFilmicToneMapping;
    _renderer.toneMappingExposure = 1.2;

    // ── 场景 ──────────────────────────────────────────
    _scene = new THREE.Scene();

    // ── 相机 (沙滩视角) ───────────────────────────────
    const camCfg = CONFIG.OCEAN;
    _camera = new THREE.PerspectiveCamera(
      camCfg.CAMERA_FOV,
      window.innerWidth / window.innerHeight,
      camCfg.CAMERA_NEAR,
      camCfg.CAMERA_FAR
    );
    _camera.position.set(...camCfg.CAMERA_POS);
    _camera.lookAt(...camCfg.CAMERA_LOOK);

    // ── 光照 ──────────────────────────────────────────
    // 环境光: 模拟天空漫反射
    const ambient = new THREE.AmbientLight(0x4a8fba, 0.6);
    _scene.add(ambient);

    // 半球光: 天空/地面
    const hemi = new THREE.HemisphereLight(0x88ccff, 0x003355, 0.7);
    _scene.add(hemi);

    // 定向光: 模拟阳光 (侧面投射产生闪烁)
    const sun = new THREE.DirectionalLight(0xffeedd, 2.5);
    sun.position.set(15, 20, -10);
    _scene.add(sun);

    // ── 天空球 ────────────────────────────────────────
    const skyGeo = new THREE.SphereGeometry(50, 32, 32);
    const skyMat = new THREE.ShaderMaterial({
      vertexShader: `
        varying vec3 vWorldPos;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorldPos = wp.xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vWorldPos;
        uniform vec3 u_cameraPos;
        void main() {
          float h = normalize(vWorldPos - u_cameraPos).y;
          vec3 horizon = vec3(0.4, 0.6, 0.85);
          vec3 top = vec3(0.05, 0.10, 0.18);
          float t = smoothstep(-0.05, 0.35, h);
          gl_FragColor = vec4(mix(horizon, top, t), 1.0);
        }
      `,
      uniforms: { u_cameraPos: { value: _camera.position } },
      side: THREE.BackSide,
      depthWrite: false
    });
    const sky = new THREE.Mesh(skyGeo, skyMat);
    sky.renderOrder = -1;
    _scene.add(sky);

    // ── 海面几何体 ────────────────────────────────────
    const planeGeo = new THREE.PlaneGeometry(
      camCfg.PLANE_SIZE, camCfg.PLANE_SIZE,
      camCfg.PLANE_SEGMENTS, camCfg.PLANE_SEGMENTS
    );
    planeGeo.rotateX(-Math.PI / 2); // 转为水平 (XZ 平面)

    _material = createOceanMaterial();
    _ocean = new THREE.Mesh(planeGeo, _material);
    _ocean.renderOrder = 0;
    _scene.add(_ocean);

    // ── 时钟 ──────────────────────────────────────────
    _clock = new THREE.Clock();

    console.log('✅ 3D 海洋场景已初始化');
    return true;
  }

  // =========================================================================
  // 渲染循环
  // =========================================================================
  function start() {
    if (_isRunning) return;
    _isRunning = true;
    _clock.start();
    _loop();
    console.log('🌊 海洋渲染已启动');
  }

  function stop() {
    _isRunning = false;
    if (_animId) { cancelAnimationFrame(_animId); _animId = null; }
  }

  function _loop() {
    if (!_isRunning) return;
    _animId = requestAnimationFrame(_loop);

    const dt = Math.min(_clock.getDelta(), 0.1);
    const elapsed = _clock.elapsedTime;

    // 更新 Shader uniforms (音频 + 时间)
    if (_material) {
      _material.uniforms.u_time.value = elapsed;
      _material.uniforms.u_bassEnergy.value = AudioAnalyzer.getBass();
      _material.uniforms.u_midEnergy.value  = AudioAnalyzer.getMid();
      _material.uniforms.u_highEnergy.value = AudioAnalyzer.getHigh();
      _material.uniforms.u_cameraPos.value.copy(_camera.position);
    }

    // 更新天空 uniform
    const skyObj = _scene.children.find(c => c.renderOrder === -1);
    if (skyObj && skyObj.material.uniforms) {
      skyObj.material.uniforms.u_cameraPos.value.copy(_camera.position);
    }

    _renderer.render(_scene, _camera);
  }

  // =========================================================================
  // 窗口大小调整
  // =========================================================================
  function resize(w, h) {
    if (_renderer) {
      _renderer.setSize(w, h);
      if (_camera) {
        _camera.aspect = w / Math.max(h, 1);
        _camera.updateProjectionMatrix();
      }
    }
  }

  // =========================================================================
  // 获取元素
  // =========================================================================
  function getCamera() { return _camera; }
  function getScene() { return _scene; }
  function getRenderer() { return _renderer; }

  return { init, start, stop, resize, getCamera, getScene, getRenderer };
})();
