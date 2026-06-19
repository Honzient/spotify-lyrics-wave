/**
 * scene.js — AAA 级 3D 海洋场景
 *
 * 图形管线:
 *   - 512×512 高分辨率 PlaneGeometry (每顶点 Gerstner + Jacobian)
 *   - 强定向光 (太阳波光) + 天空渐变球
 *   - EffectComposer → RenderPass → UnrealBloomPass (辉光溢出)
 *   - ACES 色调映射
 */

const OceanScene = (() => {
  'use strict';

  let _renderer, _scene, _camera, _ocean, _material, _clock;
  let _composer, _bloomPass;
  let _isRunning = false, _animId = null;

  // =========================================================================
  // 初始化
  // =========================================================================
  function init(canvas) {
    // ── WebGL 渲染器 ────────────────────────────────────
    _renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance',
      stencil: false,
      depth: true
    });
    _renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    _renderer.setSize(window.innerWidth, window.innerHeight);
    _renderer.outputColorSpace = THREE.SRGBColorSpace;
    _renderer.toneMapping = THREE.ACESFilmicToneMapping;
    _renderer.toneMappingExposure = CONFIG.OCEAN.TONE_MAPPING_EXPOSURE;

    // ── 场景 ────────────────────────────────────────────
    _scene = new THREE.Scene();
    _scene.background = new THREE.Color(0x0a1628);
    _scene.fog = new THREE.FogExp2(0x0a1628, 0.00008);

    // ── 相机 (沙滩视角) ─────────────────────────────────
    const cfg = CONFIG.OCEAN;
    _camera = new THREE.PerspectiveCamera(
      cfg.CAMERA_FOV,
      window.innerWidth / window.innerHeight,
      cfg.CAMERA_NEAR,
      cfg.CAMERA_FAR
    );
    _camera.position.set(...cfg.CAMERA_POS);
    _camera.lookAt(...cfg.CAMERA_LOOK);

    // ── 光照 ────────────────────────────────────────────
    // 环境 (微弱填充)
    const ambient = new THREE.AmbientLight(0x1a3a55, 0.35);
    _scene.add(ambient);

    // 半球光 (天空/海面)
    const hemi = new THREE.HemisphereLight(0x88ccff, 0x003355, 0.6);
    _scene.add(hemi);

    // ★ 强定向光 — 模拟太阳 (产生镜面高光 → Bloom 辉光)
    const sun = new THREE.DirectionalLight(0xffeedd, 2.5);
    sun.position.set(20, 25, -15);
    _scene.add(sun);

    // ── 天空球 ──────────────────────────────────────────
    const skyGeo = new THREE.SphereGeometry(52, 40, 40);
    const skyMat = new THREE.ShaderMaterial({
      vertexShader: `
        varying vec3 vWP;
        void main() { vec4 w = modelMatrix * vec4(position,1.0); vWP = w.xyz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
      `,
      fragmentShader: `
        varying vec3 vWP;
        uniform vec3 u_cam;
        void main() {
          float h = normalize(vWP - u_cam).y;
          vec3 horizon = vec3(0.45,0.65,0.88); vec3 top = vec3(0.08,0.13,0.22);
          float t = smoothstep(-0.08,0.3,h);
          gl_FragColor = vec4(mix(horizon,top,t), 1.0);
        }
      `,
      uniforms: { u_cam: { value: _camera.position } },
      side: THREE.BackSide,
      depthWrite: false
    });
    const sky = new THREE.Mesh(skyGeo, skyMat);
    sky.renderOrder = -1;
    _scene.add(sky);

    // ── 海面几何 (高分辨率) ────────────────────────────
    const planeGeo = new THREE.PlaneGeometry(
      cfg.PLANE_SIZE, cfg.PLANE_SIZE,
      cfg.PLANE_SEGMENTS, cfg.PLANE_SEGMENTS
    );
    planeGeo.rotateX(-Math.PI / 2);

    _material = createOceanMaterial();
    _ocean = new THREE.Mesh(planeGeo, _material);
    _ocean.renderOrder = 0;
    _ocean.position.y = -0.5;
    _scene.add(_ocean);

    // ── 后处理管线 ──────────────────────────────────────
    // RenderPass → UnrealBloomPass → 输出
    const renderPass = new RenderPass(_scene, _camera);

    _bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      cfg.BLOOM_STRENGTH,
      cfg.BLOOM_RADIUS,
      cfg.BLOOM_THRESHOLD
    );

    _composer = new EffectComposer(_renderer);
    _composer.addPass(renderPass);
    _composer.addPass(_bloomPass);

    // ── 时钟 ────────────────────────────────────────────
    _clock = new THREE.Clock();

    console.log('✅ AAA 3D 海洋场景已初始化 (512² 网格 + Bloom 后处理)');
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

    // 更新 Shader uniforms (时间 + 音频)
    if (_material) {
      _material.uniforms.u_time.value = elapsed;
      _material.uniforms.u_bassEnergy.value = AudioAnalyzer.getBass();
      _material.uniforms.u_midEnergy.value  = AudioAnalyzer.getMid();
      _material.uniforms.u_highEnergy.value = AudioAnalyzer.getHigh();
      _material.uniforms.u_cameraPos.value.copy(_camera.position);
    }

    // 更新天空
    const skyObj = _scene.children.find(c => c.renderOrder === -1);
    if (skyObj && skyObj.material.uniforms) {
      skyObj.material.uniforms.u_cam.value.copy(_camera.position);
    }

    // ★ 通过 EffectComposer 渲染 (含 Bloom)
    _composer.render();
  }

  // =========================================================================
  // 窗口大小调整
  // =========================================================================
  function resize(w, h) {
    if (_renderer) {
      _renderer.setSize(w, h);
      if (_camera) { _camera.aspect = w / Math.max(h, 1); _camera.updateProjectionMatrix(); }
      if (_composer) { _composer.setSize(w, h); }
      if (_bloomPass) { _bloomPass.resolution.set(w, h); }
    }
  }

  return { init, start, stop, resize, getCamera: () => _camera, getScene: () => _scene };
})();
