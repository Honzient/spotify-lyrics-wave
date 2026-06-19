/**
 * ocean-material.js — AAA 级 3D 物理海洋 Shader
 *
 * 核心图形学特性:
 *   - 8 组 Gerstner Waves + Jacobian Determinant (浪花挤压科学依据)
 *   - Fresnel-Schlick 反射/折射
 *   - 次表面散射 (SSS) — 浪尖透光
 *   - 雅可比泡沫 (Jacobian Foam) — 波浪破碎处精准生沫
 *   - FBM 高频细节扰动
 *   - 正确的音频物理映射 (陡度/相位驱动，非振幅缩放)
 */

// ============================================================================
// 顶点着色器 — Gerstner Waves + Jacobian
// ============================================================================
const OCEAN_VERTEX_SHADER = /* glsl */`
  varying vec3 vWorldPos;
  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying float vHeight;
  varying float vJacobian;   // ★ 雅可比行列式 — 泡沫的科学依据
  varying vec2 vUv;

  uniform float u_time;
  uniform float u_bassEnergy;
  uniform float u_midEnergy;
  uniform float u_highEnergy;

  const float PI = 3.14159265359;
  const float G  = 9.8;

  // =========================================================================
  // 单组 Gerstner Wave (带水平位移 + 雅可比)
  // =========================================================================
  // 返回 height, 更新 tangent/binormal (用于法线), 累加 jacobian
  float gerstnerWave(
    vec3 p, vec2 D, float wavelength, float steepness,
    float amplitude, float speed, float phase,
    inout vec3 T, inout vec3 B, inout float jac
  ) {
    float k = 2.0 * PI / wavelength;
    float omega = sqrt(G * k);
    float f = k * (dot(D, p.xz)) - omega * speed * u_time + phase;
    float c = cos(f);
    float s = sin(f);

    float QA = steepness * amplitude;

    // Height (Y displacement)
    float dy = amplitude * s;

    // Horizontal displacement (XZ — Gerstner particle orbit)
    float dx = -QA * D.x * c;
    float dz = -QA * D.y * c;

    // ★ Jacobian contribution: d(dx)/dx + d(dz)/dz = QA * k * sin(f)
    //   多波叠加时 J_total ≈ 1 + Σ QA_i * k_i * sin(f_i)
    //   J < 1 → 波峰挤压 (泡沫生成!)
    jac += QA * k * s;

    // Tangent / Binormal accumulation
    // T = (1 + d(dx)/dx, d(dy)/dx, d(dz)/dx)
    // B = (d(dx)/dz, d(dy)/dz, 1 + d(dz)/dz)
    T += vec3(
      -QA * D.x * D.x * k * s,
       amplitude * D.x * k * c,
      -QA * D.x * D.y * k * s
    );
    B += vec3(
      -QA * D.x * D.y * k * s,
       amplitude * D.y * k * c,
      -QA * D.y * D.y * k * s
    );

    return dy;
  }

  // =========================================================================
  // 简易 FBM 噪声 (高频细节)
  // =========================================================================
  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i), hash(i + vec2(1,0)), f.x),
      mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), f.x), f.y
    );
  }
  float fbm(vec2 p, int oct) {
    float v = 0.0, a = 0.5, freq = 1.0;
    for (int i = 0; i < 6; i++) { if (i >= oct) break; v += a * noise(p * freq); freq *= 2.0; a *= 0.5; }
    return v;
  }

  // =========================================================================
  // 主入口
  // =========================================================================
  void main() {
    vec3 pos = position;

    // ── 音频调制 (科学方式，非振幅缩放) ──────────────────
    // bassEnergy   → 增加陡峭度 Q (波浪卷得更尖锐 → 更多雅可比泡沫)
    // midEnergy    → 增加中尺度波浪振幅
    // highEnergy   → FBM 微扰动 (表面涟漪)
    float bassQ  = 0.18 + u_bassEnergy * 0.22;    // 陡度: 0.18 → 0.40
    float midAmp = 0.5  + u_midEnergy  * 0.5;     // 中尺度: 50% → 100%
    float highFB = 0.03 + u_highEnergy * 0.09;    // FBM 振幅: 3% → 12%

    vec3 T = vec3(0.0);
    vec3 B = vec3(0.0);
    float jac = 0.0;
    float dy = 0.0;

    // ── 8 组 Gerstner Waves ─────────────────────────────
    // 波浪方向统一: Z+ (从海平线 → 岸边/相机方向)

    // Wave 1: 主涌浪 (大尺度, 长波)
    dy += gerstnerWave(pos, vec2(0.0, 1.0), 5.5, bassQ, 0.85, 0.7, 0.0, T, B, jac);

    // Wave 2: 涌浪偏右
    dy += gerstnerWave(pos, normalize(vec2(0.18, 0.98)), 4.0, bassQ * 0.9, 0.65, 0.75, 1.3, T, B, jac);

    // Wave 3: 涌浪偏左
    dy += gerstnerWave(pos, normalize(vec2(-0.12, 0.99)), 3.2, bassQ * 0.85, 0.55 * midAmp, 0.8, 0.6, T, B, jac);

    // Wave 4: 中尺度 (右)
    dy += gerstnerWave(pos, normalize(vec2(0.28, 0.96)), 2.0, bassQ * 0.75, 0.38 * midAmp, 0.9, 2.0, T, B, jac);

    // Wave 5: 中尺度 (左)
    dy += gerstnerWave(pos, normalize(vec2(-0.22, 0.975)), 1.5, bassQ * 0.7, 0.28 * midAmp, 0.95, 3.1, T, B, jac);

    // Wave 6: 小尺度波纹
    dy += gerstnerWave(pos, normalize(vec2(0.1, 0.995)), 0.9, bassQ * 0.6, 0.16 * midAmp, 1.0, 1.7, T, B, jac);

    // Wave 7: 微波
    dy += gerstnerWave(pos, normalize(vec2(-0.3, 0.955)), 0.55, bassQ * 0.5, 0.09 * midAmp, 1.1, 4.5, T, B, jac);

    // Wave 8: 极微 (高频驱动)
    dy += gerstnerWave(pos, normalize(vec2(0.15, 0.99)), 0.3, bassQ * 0.4, 0.04 * midAmp, 1.2, 3.8, T, B, jac);

    // ── FBM 微扰动 ─────────────────────────────────────
    float fbmDetail = fbm(pos.xz * 4.5 + u_time * 0.15, 4) * highFB;
    dy += fbmDetail;

    // ── 最终 Jacobian ───────────────────────────────────
    // J > 1: 波谷拉伸 (平静), J < 1: 波峰挤压 (泡沫)
    // bassEnergy 越高 → 波浪越尖锐 → Jacobian 越低 → 更多泡沫
    float jacobian = 1.0 + jac;

    // ── 法线 ───────────────────────────────────────────
    // Tangent contributions: base tangent (1,0,0) + T
    // Binormal contributions: base binormal (0,0,1) + B
    vec3 tangent  = normalize(vec3(1.0, 0.0, 0.0) + T);
    vec3 binormal = normalize(vec3(0.0, 0.0, 1.0) + B);
    vec3 N = normalize(cross(binormal, tangent));

    // ── 【精确边界版】屏幕边缘海浪拍打 (鱼缸效应) ───────
    vec4 screenPos = projectionMatrix * modelViewMatrix * vec4(pos.x, dy, pos.z, 1.0);

    float boundaryCrash = 0.0;

    // 安全锁: 仅相机正前方且近景 (w=1~25m) 的顶点参与边缘检测
    if (screenPos.w > 1.0 && screenPos.w < 25.0) {
      vec2 ndc = screenPos.xy / screenPos.w;

      float dLeft   = abs(ndc.x - (-1.0));
      float dRight  = abs(ndc.x - 1.0);
      float dBottom = abs(ndc.y - (-1.0));

      // 极窄的边缘区域 (NDC 0.06 ≈ 屏幕 3%), 带噪声起伏
      float edgeNoise = fbm(pos.xz * 2.5 + u_time * 0.3, 2) * 0.04;

      float crashLeft   = 1.0 - smoothstep(0.0, 0.06 + edgeNoise, dLeft);
      float crashRight  = 1.0 - smoothstep(0.0, 0.06 + edgeNoise, dRight);
      float crashBottom = 1.0 - smoothstep(0.0, 0.08 + edgeNoise, dBottom);

      boundaryCrash = max(crashLeft, max(crashRight, crashBottom));

      // 近景衰减: 太远不生效
      float depthFade = 1.0 - smoothstep(10.0, 25.0, screenPos.w);
      boundaryCrash *= depthFade;
    }

    // 轻微爬升 + 适度白沫 (精准只影响边缘)
    dy += boundaryCrash * 1.2;
    jac -= boundaryCrash * 2.5;
    jacobian = 1.0 + jac;

    // ── 新位置 ─────────────────────────────────────────
    vec3 newPos = vec3(pos.x, dy, pos.z);

    // ── 输出 ───────────────────────────────────────────
    vec4 worldPos = modelMatrix * vec4(newPos, 1.0);
    vWorldPos = worldPos.xyz;
    vNormal = normalize(mat3(modelMatrix) * N);
    vec4 mvPos = modelViewMatrix * vec4(newPos, 1.0);
    vViewDir = normalize(-mvPos.xyz);
    vHeight = dy;
    vJacobian = jacobian;
    vUv = uv;

    gl_Position = projectionMatrix * mvPos;
  }
`;

// ============================================================================
// 片段着色器 — 光场光学 (Fresnel + SSS + Jacobian Foam + Bloom-compatible)
// ============================================================================
const OCEAN_FRAGMENT_SHADER = /* glsl */`
  varying vec3 vWorldPos;
  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying float vHeight;
  varying float vJacobian;
  varying vec2 vUv;

  uniform float u_time;
  uniform float u_bassEnergy;
  uniform float u_midEnergy;
  uniform float u_highEnergy;
  uniform vec3 u_cameraPos;
  uniform vec3 u_lightDir;

  // =========================================================================
  // 颜色常量
  // =========================================================================
  const vec3 WATER_DEEP    = vec3(0.01, 0.06, 0.18);  // 深海 — 深蓝
  const vec3 WATER_MID     = vec3(0.01, 0.15, 0.35);  // 中层 — 宝石蓝
  const vec3 WATER_SHALLOW = vec3(0.02, 0.28, 0.52);  // 浅海 — 亮蓝
  const vec3 WATER_SURFACE = vec3(0.06, 0.48, 0.72);  // 海面 — 天蓝
  const vec3 FOAM_COLOR    = vec3(0.90, 0.95, 0.98);  // 白沫
  const vec3 SSS_COLOR     = vec3(0.10, 0.72, 0.58);  // 透光翡翠绿
  const vec3 SKY_TOP       = vec3(0.06, 0.12, 0.25);  // 天顶
  const vec3 SKY_HORIZON   = vec3(0.38, 0.58, 0.82);  // 地平线
  const vec3 SUN_COLOR     = vec3(1.0, 0.95, 0.75);

  // =========================================================================
  // Hash / Noise / FBM (片元着色器版)
  // =========================================================================
  float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
  float noise2(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash2(i), hash2(i+vec2(1,0)), f.x), mix(hash2(i+vec2(0,1)), hash2(i+vec2(1,1)), f.x), f.y);
  }
  float fbm2(vec2 p, int oct) {
    float v = 0.0, a = 0.5, fq = 1.0;
    for (int i = 0; i < 5; i++) { if (i >= oct) break; v += a * noise2(p * fq); fq *= 2.0; a *= 0.5; }
    return v;
  }

  // =========================================================================
  // 主入口
  // =========================================================================
  void main() {
    vec3 N = normalize(vNormal);
    vec3 V = normalize(vViewDir);
    vec3 L = normalize(u_lightDir);
    vec3 H = normalize(L + V);

    // =====================================================================
    // 1. 菲涅尔 — Schlick 近似 (强化 3D 纵深感)
    // =====================================================================
    float NdotV = abs(dot(N, V));
    float F0 = 0.03;  // 水的基底反射率
    float fresnel = F0 + (1.0 - F0) * pow(1.0 - NdotV, 4.5);

    // =====================================================================
    // 2. 天空反射色 (基于反射向量)
    // =====================================================================
    vec3 R = reflect(-V, N);
    float skyBlend = smoothstep(-0.15, 0.5, R.y);
    vec3 skyReflection = mix(SKY_HORIZON, SKY_TOP, skyBlend);

    // =====================================================================
    // 3. 水下次表面散射 (SSS)
    // =====================================================================
    // 光从浪尖背面透射: 视角看向背光面 + 光在对面 → 翡翠绿透光
    float sssBack  = max(0.0, dot(V, -N));      // 看到背面
    float sssLight = max(0.0, dot(L, -N));      // 光照到背面
    float sss = sssBack * sssLight * 0.35;
    // 高波峰处的 SSS 更强 (更薄的水层)
    float crestThin = smoothstep(0.15, 0.55, vHeight);
    sss *= (0.5 + crestThin * 0.5);

    // =====================================================================
    // 4. 水下折射色 (深度映射)
    // =====================================================================
    float depth = 0.25 + vHeight * 0.25;
    depth = clamp(depth, 0.0, 1.0);
    vec3 waterRefraction = mix(WATER_DEEP, WATER_MID, depth);
    waterRefraction = mix(waterRefraction, WATER_SHALLOW, smoothstep(0.5, 0.85, depth));
    waterRefraction = mix(waterRefraction, WATER_SURFACE, smoothstep(0.8, 1.0, depth));

    // =====================================================================
    // 5. 镜面高光 (Specular — Blinn-Phong, 驱动 Bloom)
    // =====================================================================
    float specBlinn = pow(max(dot(N, H), 0.0), 512.0);
    float specBroad = pow(max(dot(N, H), 0.0), 32.0);
    // 高光: 仅浪尖/波面正面 → 输出高强度供 Bloom 抓取
    float specular = specBlinn * 1.8 + specBroad * 0.25;

    // =====================================================================
    // 6. ★ 雅可比泡沫 (JACOBIAN FOAM) — 科学泡沫 ★
    // =====================================================================
    // J < 1.0  → 波峰挤压 → 水被"捏"碎 → 泡沫
    // J < 0.4  → 严重挤压 → 大量泡沫 (波浪破碎)
    // highEnergy 降低阈值 → 音乐高潮时更容易起沫

    float foamBaseThreshold = 0.55;                       // 基础阈值 (更低 = 需要更挤压才起沫)
    float foamThreshold = foamBaseThreshold - u_highEnergy * 0.25;

    // 核心: Jacobian 驱动的泡沫
    float jacFoam = 1.0 - smoothstep(foamThreshold - 0.2, foamThreshold + 0.2, vJacobian);

    // FBM 细碎纹理调制 (浪尾网状拖痕)
    float foamNoise = fbm2(vWorldPos.xz * 8.0 + u_time * 0.25, 3);
    float foamPattern = fbm2(vWorldPos.xz * 3.0 - u_time * 0.15, 4);

    // 纹理化泡沫 (避免均匀色块)
    float texturedFoam = jacFoam * (0.6 + 0.4 * foamNoise);
    // 浪尾网状纹理
    float streakFoam = jacFoam * foamPattern * 0.4;

    // bassEnergy 增强泡沫 (浪卷得更尖锐)
    float totalFoam = texturedFoam * (0.5 + u_bassEnergy * 0.3) + streakFoam * 0.5;

    // =====================================================================
    // 7. 焦散/波光效果
    // =====================================================================
    float causticAng = max(dot(N, L), 0.0);
    float caustics = pow(causticAng, 128.0) * 0.2;
    // 水面下的高频焦散纹理
    float causticTex = fbm2(vWorldPos.xz * 12.0 - u_time * 0.3, 2);
    caustics += causticTex * pow(causticAng, 8.0) * 0.12 * (0.5 + u_midEnergy * 0.5);

    // =====================================================================
    // 8. 合成 — 最终颜色
    // =====================================================================

    // 基础水色 = 菲涅尔混合 (折射 ↔ 反射, 增强 3D 感)
    vec3 color = mix(waterRefraction, skyReflection, fresnel * 0.85);

    // SSS 透光叠加 (翡翠绿透光, 仅在浪尖背光面可见)
    color += sss * SSS_COLOR * (0.4 + u_bassEnergy * 0.3);

    // 镜面高光 (Bloom 抓取目标 — 波光粼粼)
    color += specular * SUN_COLOR * (0.5 + u_midEnergy * 0.3);

    // 焦散
    color += caustics * WATER_SURFACE * 0.5;

    // ★ 雅可比泡沫 (柔和叠加, 不突兀)
    color = mix(color, FOAM_COLOR, clamp(totalFoam * 0.85, 0.0, 1.0));

    // 水下散射暗调 (俯视暗, 斜视亮 — 增强体积感)
    float underwaterDark = smoothstep(-0.05, 0.35, NdotV);
    color *= 0.55 + underwaterDark * 0.45;

    // 远处雾化
    float dist = length(vWorldPos.xz);
    float fog = smoothstep(25.0, 55.0, dist);
    color = mix(color, SKY_HORIZON * 0.45, fog * 0.35);

    // 边缘暗角
    float vignette = 1.0 - smoothstep(0.3, 1.0, abs(vUv.y - 0.5) * 2.0) * 0.2;
    color *= vignette;

    gl_FragColor = vec4(color, 1.0);
  }
`;

// ============================================================================
// 工厂函数
// ============================================================================
function createOceanMaterial() {
  const uniforms = {
    u_time:          { value: 0 },
    u_bassEnergy:    { value: 0 },
    u_midEnergy:     { value: 0 },
    u_highEnergy:    { value: 0 },
    u_cameraPos:     { value: new THREE.Vector3() },
    u_lightDir:      { value: new THREE.Vector3(0.55, 0.75, 0.35).normalize() }
  };

  return new THREE.ShaderMaterial({
    vertexShader: OCEAN_VERTEX_SHADER,
    fragmentShader: OCEAN_FRAGMENT_SHADER,
    uniforms,
    side: THREE.DoubleSide,
    wireframe: false
  });
}
