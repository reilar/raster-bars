//---------------------------------------------------
// Dancing rasterbars
// 
// v1.0  2021-04-22  Initial version by Reine Larsson
// v1.1  2021-09-25  Updated at Impulse Internal #22
//---------------------------------------------------

varying vec2 v_texcoord;
uniform vec2 iResolution;
uniform float iTime;
uniform vec4 iMouse;

#ifdef GL_ES
precision highp float;
#endif

#define PI 3.14159265358979323846

vec2 rot2d(vec2 uv, float a)
{
    uv -= 0.5;
    uv = mat2(cos(a),-sin(a),sin(a),cos(a)) * uv;
    uv += 0.5;
    return uv;
}

vec3 sinebar(vec2 uv, vec3 color, float speed, float amp, float width, float inc)
{
    float y = sin(uv.y + speed + uv.y) * amp + inc;
    uv.x += (y * 0.3) * 1.4;
    float scale = pow(1. - distance(y, uv.x), 22.0);
    return color * scale;
}

vec3 raster(vec2 fc)
{
    vec2 uv = fc / iResolution.xy;
    vec2 uv1 = rot2d(uv,PI*0.11*iTime);
    vec2 uv2 = rot2d(uv,PI*0.12*iTime);
    vec2 uv3 = rot2d(uv,PI*0.13*iTime);
    vec2 uv4 = rot2d(uv,PI*0.14*iTime);
    vec3 color = vec3(0.0);
    float speed = iTime * 2.2;
    color += sinebar(uv1, vec3(0.7, 0.0, 0.4), speed+1.9, 0.20, 0.05, 0.7);
    color += sinebar(uv2, vec3(0.7, 0.4, 0.0), speed+1.2, 0.31, 0.24, 0.6);
    color += sinebar(uv3, vec3(1.0, 0.0, 0.0), speed+0.5, 0.12, 0.17, 0.8);
    color += sinebar(uv4, vec3(1.0, 0.7, 0.0), speed+0.3, 0.16, 0.12, 0.8);
    return color;
}

void mainImage(out vec4 fragColor, in vec2 fragCoord)
{
    vec3 color = raster(fragCoord);
    fragColor = vec4(color, 1.);
}

void main(void) 
{ 
    mainImage(gl_FragColor, v_texcoord*iResolution.xy); 
}

