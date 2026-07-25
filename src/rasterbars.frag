//---------------------------------------------------
// Dancing rasterbars
// 
// v1.0  2021-04-22  Initial version by Reine Larsson
// v1.1  2021-09-25  Updated at Impulse Internal #22
//---------------------------------------------------

uniform vec2 iResolution;
uniform float iTime;
uniform float iTimeDelta;
uniform int iFrame;
uniform vec4 iMouse;
uniform sampler2D iChannel0;
uniform sampler2D iChannel1;
uniform sampler2D iChannel2;
uniform sampler2D iChannel3;
uniform vec4 iDate;
uniform float iSampleRate;

const float planeDist = 1.0-0.825;

#define RESOLUTION  iResolution
#define TIME        iTime
#define PI          3.141592654
#define TAU         (2.0*PI)
#define ROT(a)      mat2(cos(a), sin(a), -sin(a), cos(a))
#define PCOS(x)     (0.5+0.5*cos(x))
#define BPM         125.0
#define DSP_STR     1.5

vec4 alphaBlend(vec4 back, vec4 front) {
  float w = front.w + back.w*(1.0-front.w);
  vec3 xyz = (front.xyz*front.w + back.xyz*back.w*(1.0-front.w))/w;
  return w > 0.0 ? vec4(xyz, w) : vec4(0.0);
}

vec3 alphaBlend(vec3 back, vec4 front) {
  return mix(back, front.xyz, front.w);
}

float tanh_approx(float x) {
  float x2 = x*x;
  return clamp(x*(26.0 + x2)/(26.0+9.0*x2), -1.0, 1.0);
}

float hash(float co) {
  return fract(sin(co*12.9898) * 13758.5453);
}

float sRGB(float t) { 
  return mix(1.055*pow(t, 1./2.4) - 0.055, 12.92*t, step(t, 0.0031308)); 
}

vec3 sRGB(in vec3 c) { 
  return vec3 (sRGB(c.x), sRGB(c.y), sRGB(c.z)); 
}

// License: MIT, author: Inigo Quilez: https://iquilezles.org/www/index.htm
vec3 postProcess(vec3 col, vec2 q) {
  col = clamp(col, 0.0, 1.0);
  col = sRGB(col);
  col = col*0.6+0.4*col*col*(3.0-2.0*col);
  col = mix(col, vec3(dot(col, vec3(0.33))), -0.4);
  col *=0.5+0.5*pow(19.0*q.x*q.y*(1.0-q.x)*(1.0-q.y),0.7);
  float edge = 1.0 - smoothstep(0.18, 0.72, min(min(q.x, q.y), min(1.0-q.x, 1.0-q.y)));
  col = mix(col, vec3(0.06, 0.03, 0.01), 0.20*edge);
  col *= mix(1.0, 0.68, edge);
  col.b *= mix(1.0, 0.42, edge);
  col.r *= mix(1.0, 0.88, edge);
  return col;
}

vec3 offset(float z) {
  float a = z;
  vec2 p = -0.15*(vec2(cos(a), sin(a*sqrt(2.0))) + vec2(cos(a*sqrt(0.75)), sin(a*sqrt(0.5))));
  return vec3(p, z);
}

vec3 doffset(float z) {
  float eps = 0.1;
  return 0.5*(offset(z + eps) - offset(z - eps))/eps;
}

vec3 ddoffset(float z) {
  float eps = 0.1;
  return 0.5*(doffset(z + eps) - doffset(z - eps))/eps;
}

vec3 sinebar(vec2 uv, vec3 color, float speed, float amp, float inc) {
  float y = sin(uv.y + speed + uv.y) * amp + inc;
  uv.x += (y * 0.3) * 1.4;
  float scale = pow(abs(1.0 - distance(y, uv.x)), 20.0);
  return color * tanh_approx(scale);
}

vec3 rasterbars(vec2 p, float h) {
  float th = TAU*h;
  vec2 p1 = p*ROT(PI*0.11*TIME + th);
  vec2 p2 = p*ROT(PI*0.12*TIME + th);
  vec2 p3 = p*ROT(PI*0.13*TIME + th);
  vec2 p4 = p*ROT(PI*0.14*TIME + th);
  vec3 color = vec3(0.0);
  float speed = TIME * 2.213;
  color += sinebar(p1, vec3(0.95, 0.18, 0.08), speed+1.9, 0.20, 0.7);
  color += sinebar(p2, vec3(0.95, 0.45, 0.08), speed+1.2, 0.31, 0.6);
  color += sinebar(p3, vec3(1.0, 0.16, 0.06), speed+0.5, 0.12, 0.8);
  color += sinebar(p4, vec3(1.0, 0.78, 0.18), speed+0.3, 0.16, 0.8);
  return color;
}

float getsat(vec3 c) {
  float mi = min(min(c.x, c.y), c.z);
  float ma = max(max(c.x, c.y), c.z);
  return (ma - mi)/(ma+ 1e-7);
}

vec3 rgb_lerp(in vec3 a, in vec3 b, in float x) {
  vec3 ic = mix(a, b, x);
  vec3 safeIc = ic + vec3(1e-6, 0.0, 0.0);

  float targetSat = mix(getsat(a), getsat(b), x);
  float satDelta = abs(getsat(safeIc) - targetSat);

  vec3 chromaAxis = normalize(vec3(
    2.0 * safeIc.x - safeIc.y - safeIc.z,
    2.0 * safeIc.y - safeIc.x - safeIc.z,
    2.0 * safeIc.z - safeIc.y - safeIc.x
  ));

  float lightness = dot(vec3(1.0), safeIc);
  float directionWeight = dot(chromaAxis, normalize(safeIc));

  safeIc += DSP_STR * chromaAxis * satDelta * directionWeight * lightness;
  return clamp(safeIc, 0.0, 1.0);
}

// Sample one rasterbar plane, rotate it in local space, and remap the color before blending
vec4 plane(vec3 ro, vec3 pp, vec3 off, float aa, float n) {
  float hn = hash(n);
  float hn0 = hn;
  float hn1 = fract(1667.0*hn);
  float z = mix(0.1, 0.3, PCOS(0.05*n));
  float pd = length(ro - pp);

  vec2 p = (pp-off*1.0*vec3(1.0, 1.0, 0.0)).xy;
  p *= ROT(mix(0.125, 0.66, hn1)*TIME);
  p /= z;

  vec3 col = rasterbars(p, hn0);
  col = clamp(col, 0.0, 1.0);
  col = rgb_lerp(col, col.yzx, tanh_approx(0.5*length(p)));
  float t = max(max(col.x, col.y), col.z);
  t = sqrt(t);

  return vec4(col, t);
}

// Compose the final view color by marching planes, fading them, and blending with the sky
vec3 color(vec3 ww, vec3 uu, vec3 vv, vec3 ro, vec2 p) {
  float lp = length(p);
  vec2 np = p + 1.0/RESOLUTION.xy;
  const float rdd_per = 10.0;
  float rdd = 2.05 + 0.20*pow(lp, 1.25) + 0.08*PCOS(rdd_per*p.x)*PCOS(rdd_per*p.y);

  vec3 rd = normalize(p.x*uu + p.y*vv + rdd*ww);
  vec3 nrd = normalize(np.x*uu + np.y*vv + rdd*ww);

  const int furthest = 8;
  const int fadeFrom = max(furthest-6, 0);
  float nz = floor(ro.z / planeDist);
  vec3 skyCol = vec3(0.0);
  vec4 acol = vec4(0.0);
  const float cutOff = 0.95;

  // Steps from nearest to furthest plane and accumulates the color 
  for (int i = 1; i <= furthest; ++i) {
    float pz = planeDist*nz + planeDist*float(i);
    float pd = (pz - ro.z)/rd.z;

    // Sample a nearby ray to estimate the plane's screen-space thickness
    if (pd > 0.0 && acol.w < cutOff) {
      vec3 pp = ro + rd*pd;
      vec3 npp = ro + nrd*pd;
      float aa = 3.0*length(pp - npp);
      vec3 off = offset(pp.z);
      vec4 pcol = plane(ro, pp, off, aa, nz+float(i));
      float nz = pp.z-ro.z;
      float fadeIn = smoothstep(planeDist*float(furthest), planeDist*float(fadeFrom), nz);
      float fadeOut = smoothstep(0.0, planeDist*0.1, nz);
      pcol.w *= fadeOut*fadeIn;
      pcol = clamp(pcol, 0.0, 1.0);
      acol = alphaBlend(pcol, acol);
    } 
    else {
      acol.w = acol.w > cutOff ? 1.0 : acol.w;
      break;
    }
  }

  vec3 col = alphaBlend(skyCol, acol);
  return col;
}

// Build the animated camera basis and render the current frame color
vec3 effect(vec2 p) {
  float tm  = planeDist*TIME*BPM/60.0;
  vec3 ro   = offset(tm);
  vec3 dro  = doffset(tm);
  vec3 ddro = ddoffset(tm);

  vec3 ww = normalize(dro);
  vec3 uu = normalize(cross(normalize(vec3(0.0,1.0,0.0)+ddro), ww));
  vec3 vv = normalize(cross(ww, uu));

  vec3 col = color(ww, uu, vv, ro, p);
  return col;
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 q = fragCoord/RESOLUTION.xy;
  vec2 p = -1. + 2. * q;
  p.x *= RESOLUTION.x/RESOLUTION.y;
  vec3 col = effect(p);
  col = postProcess(col, q);
  fragColor = vec4(col, 1.0);
}

out vec4 fragColor;

void mainImage(out vec4, in vec2);

void main(void) { 
  mainImage(fragColor,gl_FragCoord.xy); 
}

