/**
 * ocean-material.js — 自定义 Three.js ShaderMaterial
 *
 * 顶点着色器: 8 组 Gerstner Waves 真实 Y 轴位移 + FBM 细节噪声
 * 片段着色器: 法线计算 + 反射/折射 + Fresnel + 焦散 + 浪尖白沫
 *
 * 波浪方向: 从远处 (Z-) 向岸边 (Z+) 涌来
 * 相机: 沙滩视角，略微俯视海面
 */

// ============================================================================
// 顶点着色器 — Gerstner Waves 位移
// ============================================================================
const OCEAN_VERTEX_SHADER = /* glsl */`
  varying vec3 vWorldPos;        // 世界空间位置
  varying vec3 vNormal;          // 表面法线
  varying vec3 vViewDir;         // 视线方向
  varying float vHeight;         // 波浪高度 (用于白沫检测)
  varying vec2 vUv;

  uniform float u_time;
  uniform float u_bassEnergy;
  uniform float u_midEnergy;
  uniform float u_highEnergy;

  const float PI = 3.14159265359;
  const float G = 9.8;

  // ── Gerstner Wave 辅助函数 ──────────────────────────
  // 返回值: y 方向位移
  float gerstnerWave(vec3 p, vec2 dir, float wavelength, float steepness, float amplitude, float speed, float phase, out vec3 tangent, out vec3 binormal) {
    float k = 2.0 * PI / wavelength;
    float omega = sqrt(G * k);
    float f = k * (dot(dir, p.xz) - speed * omega * phase * u_time);
    float c = cos(f);
    float s = sin(f);

    // Gerstner 位移
    float dy = amplitude * s;
    tangent   = vec3(1.0 - dir.x * dir.x * steepness * c, dir.x * steepness * s, -dir.x * dir.y * steepness * c);
    binormal  = vec3(-dir.x * dir.y * steepness * c, dir.y * steepness * s, 1.0 - dir.y * dir.y * steepness * c);

    return dy;
  }

  // ── 简易噪声 (用于细节位移) ─────────────────────────
  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1,0)), f.x), mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), f.x), f.y);
  }

  float fbm(vec2 p, int octaves) {
    float v = 0.0, a = 0.5, f = 1.0;
    for (int i = 0; i < 5; i++) { if (i >= octaves) break; v += a * noise(p * f); f *= 2.0; a *= 0.5; }
    return v;
  }

  void main() {
    vec3 pos = position; // 原始平面顶点 (XZ 平面)

    // ── 音频调制 ─────────────────────────────────────
    float bassAmp  = u_bassEnergy;
    float midAmp   = u_midEnergy;
    float highAmp  = u_highEnergy;

    // ── 8 组 Gerstner Waves ─────────────────────────
    // 方向、波长、陡度、振幅、速度、相位
    vec3 tangent = vec3(1,0,0), binormal = vec3(0,0,1);
    float totalDy = 0.0;

    // Wave 1: 主涌浪，从远方 (Z-) 向岸边 (Z+) 涌来
    vec2 d1 = vec2(0.0, 1.0); // Z+ 方向 (朝向岸边)
    vec3 t1, b1;
    totalDy += gerstnerWave(pos, d1, 4.0, 0.22, 0.6 * (0.5 + bassAmp * 1.0), 0.8, 0.0, t1, b1);
    tangent += t1; binormal += b1;

    // Wave 2: 第二涌浪 (偏右)
    vec2 d2 = normalize(vec2(0.2, 0.98));
    vec3 t2, b2;
    totalDy += gerstnerWave(pos, d2, 2.8, 0.20, 0.45 * (0.5 + bassAmp * 0.8), 0.9, 1.5, t2, b2);
    tangent += t2; binormal += b2;

    // Wave 3: 偏左
    vec2 d3 = normalize(vec2(-0.15, 0.99));
    vec3 t3, b3;
    totalDy += gerstnerWave(pos, d3, 2.2, 0.18, 0.35 * (0.5 + bassAmp * 0.7), 1.0, 0.7, t3, b3);
    tangent += t3; binormal += b3;

    // Wave 4: 中尺度 (偏右强)
    vec2 d4 = normalize(vec2(0.35, 0.94));
    vec3 t4, b4;
    totalDy += gerstnerWave(pos, d4, 1.5, 0.16, 0.25 * (0.5 + midAmp * 0.8), 1.1, 2.2, t4, b4);
    tangent += t4; binormal += b4;

    // Wave 5: 中尺度 (偏左)
    vec2 d5 = normalize(vec2(-0.25, 0.97));
    vec3 t5, b5;
    totalDy += gerstnerWave(pos, d5, 1.1, 0.14, 0.2 * (0.5 + midAmp * 0.7), 1.2, 3.0, t5, b5);
    tangent += t5; binormal += b5;

    // Wave 6: 小尺度波纹 (中高频驱动)
    vec2 d6 = normalize(vec2(0.1, 0.995));
    vec3 t6, b6;
    totalDy += gerstnerWave(pos, d6, 0.7, 0.12, 0.12 * (0.4 + highAmp * 0.8), 1.3, 1.1, t6, b6);
    tangent += t6; binormal += b6;

    // Wave 7: 微波纹
    vec2 d7 = normalize(vec2(-0.3, 0.95));
    vec3 t7, b7;
    totalDy += gerstnerWave(pos, d7, 0.45, 0.10, 0.07 * (0.4 + highAmp * 0.9), 1.4, 4.2, t7, b7);
    tangent += t7; binormal += b7;

    // Wave 8: 极微
    vec2 d8 = normalize(vec2(0.15, 0.99));
    vec3 t8, b8;
    totalDy += gerstnerWave(pos, d8, 0.28, 0.08, 0.04 * (0.5 + highAmp * 0.7), 1.5, 2.8, t8, b8);
    tangent += t8; binormal += b8;

    // ── FBM 细节位移 ─────────────────────────────────
    float fbmDetail = fbm(pos.xz * 3.0 + u_time * 0.2, 4) * 0.08 * (0.3 + midAmp * 0.7);
    totalDy += fbmDetail;

    // ── 应用位移 ─────────────────────────────────────
    vec3 newPos = vec3(pos.x, totalDy, pos.z);

    // ── 法线 = cross(binormal, tangent) ──────────────
    vec3 N = normalize(cross(normalize(binormal), normalize(tangent)));

    // ── 输出 ─────────────────────────────────────────
    vec4 worldPos = modelMatrix * vec4(newPos, 1.0);
    vWorldPos = worldPos.xyz;
    vNormal = normalize(mat3(modelMatrix) * N);
    vec4 mvPos = modelViewMatrix * vec4(newPos, 1.0);
    vViewDir = normalize(-mvPos.xyz); // 从顶点指向相机
    vHeight = totalDy;
    vUv = uv;

    gl_Position = projectionMatrix * mvPos;
  }
`;

// ============================================================================
// 片段着色器 — 物理水面渲染
// ============================================================================
const OCEAN_FRAGMENT_SHADER = /* glsl */`
  varying vec3 vWorldPos;
  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying float vHeight;
  varying vec2 vUv;

  uniform float u_time;
  uniform float u_bassEnergy;
  uniform float u_midEnergy;
  uniform float u_highEnergy;
  uniform vec3 u_cameraPos;
  uniform vec3 u_lightDir;

  const vec3 WATER_DEEP    = vec3(0.0, 0.15, 0.25);
  const vec3 WATER_SHALLOW = vec3(0.0, 0.35, 0.55);
  const vec3 WATER_SURFACE = vec3(0.0, 0.55, 0.78);
  const vec3 FOAM_COLOR    = vec3(0.85, 0.93, 0.98);
  const vec3 SKY_TOP       = vec3(0.05, 0.10, 0.18);
  const vec3 SKY_HORIZON   = vec3(0.4, 0.6, 0.85);
  const vec3 SUN_COLOR     = vec3(1.0, 0.95, 0.8);

  void main() {
    vec3 N = normalize(vNormal);
    vec3 V = normalize(vViewDir);
    vec3 L = normalize(u_lightDir);

    // ── 菲涅尔 (Schlick) ──────────────────────────────
    float NdotV = abs(dot(N, V));
    float fresnel = 0.02 + 0.98 * pow(1.0 - NdotV, 4.0);

    // ── 天空反射色 ────────────────────────────────────
    // 基于反射向量在 Y 轴的分量: 高→天空顶, 低→地平线
    vec3 R = reflect(-V, N);
    float skyBlend = smoothstep(-0.2, 1.0, R.y);
    vec3 skyColor = mix(SKY_HORIZON, SKY_TOP, skyBlend);

    // ── 水下折射色 ────────────────────────────────────
    // 深水区域颜色更深，浅水更亮
    float depth = 0.3 + vHeight * 0.3;
    depth = clamp(depth, 0.0, 1.0);
    vec3 waterColor = mix(WATER_DEEP, WATER_SHALLOW, depth);
    waterColor = mix(waterColor, WATER_SURFACE, smoothstep(0.5, 1.0, depth));

    // ── 焦散光斑 ──────────────────────────────────────
    // 基于观察角度的简化焦散
    float causticAngle = dot(N, L);
    float caustics = pow(max(causticAngle, 0.0), 32.0) * 0.15;
    caustics += pow(max(dot(N, V), 0.0), 80.0) * 0.08;

    // ── 镜面高光 ──────────────────────────────────────
    vec3 H = normalize(L + V);
    float specular = pow(max(dot(N, H), 0.0), 256.0) * 0.5;
    specular += pow(max(dot(N, H), 0.0), 16.0) * 0.15;

    // ── 混合反射 & 折射 ───────────────────────────────
    vec3 color = mix(waterColor, skyColor, fresnel * 0.7);

    // 音波驱动的波光增强
    float sparkleBoost = 0.5 + u_highEnergy * 0.5;
    color += specular * SUN_COLOR * sparkleBoost;
    color += caustics * WATER_SURFACE * (0.5 + u_bassEnergy * 0.5);

    // ── 浪尖白沫 ──────────────────────────────────────
    float foamThreshold = 0.35 - u_highEnergy * 0.2;
    float foamEdge = smoothstep(foamThreshold - 0.06, foamThreshold + 0.06, vHeight);
    float foamIntensity = foamEdge * (0.15 + u_highEnergy * 0.85);
    color = mix(color, FOAM_COLOR, foamIntensity);

    // ── 远处雾化 ──────────────────────────────────────
    float dist = length(vWorldPos.xz);
    float fog = smoothstep(20.0, 50.0, dist);
    color = mix(color, SKY_HORIZON * 0.5, fog * 0.4);

    // ── 水下次表面散射 (SSS 近似) ────────────────────
    float sss = max(0.0, dot(V, -N)) * 0.08;
    color += sss * WATER_SHALLOW;

    // ── 暗角 ──────────────────────────────────────────
    float vignette = 1.0 - smoothstep(0.3, 1.0, abs(vUv.y - 0.5) * 2.0) * 0.25;
    color *= vignette;

    gl_FragColor = vec4(color, 1.0);
  }
`;

// ============================================================================
// 创建 Ocean ShaderMaterial
// ============================================================================
function createOceanMaterial() {
  const uniforms = {
    u_time:          { value: 0 },
    u_bassEnergy:    { value: 0 },
    u_midEnergy:     { value: 0 },
    u_highEnergy:    { value: 0 },
    u_cameraPos:     { value: new THREE.Vector3() },
    u_lightDir:      { value: new THREE.Vector3(0.5, 0.8, 0.3).normalize() }
  };

  return new THREE.ShaderMaterial({
    vertexShader: OCEAN_VERTEX_SHADER,
    fragmentShader: OCEAN_FRAGMENT_SHADER,
    uniforms,
    side: THREE.DoubleSide,
    wireframe: false
  });
}
