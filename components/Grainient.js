import { useEffect, useRef, useState } from "react";
import styles from "./Grainient.module.css";

const VS_GL2 = `#version 300 es
in vec2 position;
void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

const FS_GL2 = `#version 300 es
precision highp float;

uniform float uTime;
uniform float uAmplitude;
uniform vec3 uColorStops[3];
uniform vec2 uResolution;
uniform float uBlend;

out vec4 fragColor;

vec3 permute(vec3 x) {
  return mod(((x * 34.0) + 1.0) * x, 289.0);
}

float snoise(vec2 v){
  const vec4 C = vec4(
      0.211324865405187, 0.366025403784439,
      -0.577350269189626, 0.024390243902439
  );
  vec2 i  = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod(i, 289.0);

  vec3 p = permute(
      permute(i.y + vec3(0.0, i1.y, 1.0))
    + i.x + vec3(0.0, i1.x, 1.0)
  );

  vec3 m = max(
      0.5 - vec3(
          dot(x0, x0),
          dot(x12.xy, x12.xy),
          dot(x12.zw, x12.zw)
      ),
      0.0
  );
  m = m * m;
  m = m * m;

  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);

  vec3 g;
  g.x  = a0.x  * x0.x  + h.x  * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

struct ColorStop {
  vec3 color;
  float position;
};

#define COLOR_RAMP(colors, factor, finalColor) { int index = 0; for (int i = 0; i < 2; i++) { ColorStop currentColor = colors[i]; bool isInBetween = currentColor.position <= factor; index = int(mix(float(index), float(i), float(isInBetween))); } ColorStop currentColor = colors[index]; ColorStop nextColor = colors[index + 1]; float range = nextColor.position - currentColor.position; float lerpFactor = (factor - currentColor.position) / range; finalColor = mix(currentColor.color, nextColor.color, lerpFactor); }

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;

  ColorStop colors[3];
  colors[0] = ColorStop(uColorStops[0], 0.0);
  colors[1] = ColorStop(uColorStops[1], 0.5);
  colors[2] = ColorStop(uColorStops[2], 1.0);

  vec3 rampColor;
  COLOR_RAMP(colors, uv.x, rampColor);

  float height = snoise(vec2(uv.x * 2.0 + uTime * 0.08, uTime * 0.18)) * 0.5 * uAmplitude;
  height = exp(height);
  height = (uv.y * 2.0 - height + 0.2);
  float intensity = 0.6 * height;

  float midPoint = 0.20;
  float auroraAlpha = smoothstep(midPoint - uBlend * 0.5, midPoint + uBlend * 0.5, intensity);

  vec3 auroraColor = intensity * rampColor;
  fragColor = vec4(auroraColor * auroraAlpha, auroraAlpha * 0.85);
}
`;

const VS_GL1 = `
attribute vec2 position;
void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

const FS_GL1 = `
precision highp float;
uniform float uTime;
uniform float uAmplitude;
uniform vec3 uColorStops[3];
uniform vec2 uResolution;
uniform float uBlend;

vec3 permute(vec3 x) {
  return mod(((x * 34.0) + 1.0) * x, 289.0);
}

float snoise(vec2 v){
  const vec4 C = vec4(
      0.211324865405187, 0.366025403784439,
      -0.577350269189626, 0.024390243902439
  );
  vec2 i  = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod(i, 289.0);

  vec3 p = permute(
      permute(i.y + vec3(0.0, i1.y, 1.0))
    + i.x + vec3(0.0, i1.x, 1.0)
  );

  vec3 m = max(
      0.5 - vec3(
          dot(x0, x0),
          dot(x12.xy, x12.xy),
          dot(x12.zw, x12.zw)
      ),
      0.0
  );
  m = m * m;
  m = m * m;

  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);

  vec3 g;
  g.x  = a0.x  * x0.x  + h.x  * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;

  vec3 rampColor;
  if (uv.x < 0.5) {
    rampColor = mix(uColorStops[0], uColorStops[1], uv.x * 2.0);
  } else {
    rampColor = mix(uColorStops[1], uColorStops[2], (uv.x - 0.5) * 2.0);
  }

  float height = snoise(vec2(uv.x * 2.0 + uTime * 0.08, uTime * 0.18)) * 0.5 * uAmplitude;
  height = exp(height);
  height = (uv.y * 2.0 - height + 0.2);
  float intensity = 0.6 * height;

  float midPoint = 0.20;
  float auroraAlpha = smoothstep(midPoint - uBlend * 0.5, midPoint + uBlend * 0.5, intensity);

  vec3 auroraColor = intensity * rampColor;
  gl_FragColor = vec4(auroraColor * auroraAlpha, auroraAlpha * 0.85);
}
`;

function createShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Shader compile failed: ${info}`);
  }
  return shader;
}

function createProgram(gl, vsSource, fsSource) {
  const vs = createShader(gl, gl.VERTEX_SHADER, vsSource);
  const fs = createShader(gl, gl.FRAGMENT_SHADER, fsSource);
  const program = gl.createProgram();
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`Program link failed: ${info}`);
  }
  return { program, vs, fs };
}

/**
 * WebGL Simplex Noise Background (Grainient)
 * An interactive GPU fragment shader that renders dynamic, breathing color gradients
 * with autumn warm amber, burnt orange, and ember color stops.
 */
export default function Grainient({
  colorStops = [
    [0.05, 0.035, 0.025], // deep void warm charcoal
    [0.96, 0.52, 0.16],   // warm autumn amber orange
    [0.82, 0.20, 0.10],   // rich glowing ember
  ],
  amplitude = 0.48,
  blend = 0.45,
  speed = 0.35,
}) {
  const canvasRef = useRef(null);
  const [supported, setSupported] = useState(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let gl = null;
    let isGL2 = false;

    try {
      gl = canvas.getContext("webgl2", { alpha: true, antialias: false, depth: false });
      if (gl) isGL2 = true;
      else {
        gl = canvas.getContext("webgl", { alpha: true, antialias: false, depth: false }) ||
             canvas.getContext("experimental-webgl", { alpha: true, antialias: false, depth: false });
      }
    } catch {
      gl = null;
    }

    if (!gl) {
      setSupported(false);
      return;
    }

    let programBundle = null;
    try {
      programBundle = isGL2
        ? createProgram(gl, VS_GL2, FS_GL2)
        : createProgram(gl, VS_GL1, FS_GL1);
    } catch (err) {
      console.warn("Grainient WebGL shader initialization failed:", err);
      setSupported(false);
      return;
    }

    const { program, vs, fs } = programBundle;
    gl.useProgram(program);

    // Quad geometry (2 triangles covering clip space)
    const vertices = new Float32Array([
      -1, -1,
       1, -1,
      -1,  1,
      -1,  1,
       1, -1,
       1,  1,
    ]);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

    const posLoc = gl.getAttribLocation(program, "position");
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    const uTimeLoc = gl.getUniformLocation(program, "uTime");
    const uAmplitudeLoc = gl.getUniformLocation(program, "uAmplitude");
    const uBlendLoc = gl.getUniformLocation(program, "uBlend");
    const uResolutionLoc = gl.getUniformLocation(program, "uResolution");
    const uColorStopsLoc = gl.getUniformLocation(program, "uColorStops");

    // Flatten color stops [r0, g0, b0, r1, g1, b1, r2, g2, b2]
    const flatColors = new Float32Array([
      colorStops[0][0], colorStops[0][1], colorStops[0][2],
      colorStops[1][0], colorStops[1][1], colorStops[1][2],
      colorStops[2][0], colorStops[2][1], colorStops[2][2],
    ]);

    let animId = null;
    let startTime = performance.now();
    let isTabVisible = true;

    const resize = () => {
      if (!canvas) return;
      const width = window.innerWidth;
      const height = window.innerHeight;
      // Cap scale at 1.5 to keep GPU fill rate high and silky smooth
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const w = Math.round(width * dpr);
      const h = Math.round(height * dpr);

      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        gl.viewport(0, 0, w, h);
      }
    };

    resize();
    window.addEventListener("resize", resize, { passive: true });

    const onVisibilityChange = () => {
      isTabVisible = !document.hidden;
      if (isTabVisible && !animId) {
        render();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    const prefersReducedMotion =
      window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const render = () => {
      if (!isTabVisible) {
        animId = null;
        return;
      }

      const elapsed = (performance.now() - startTime) * 0.001 * speed;

      gl.useProgram(program);
      gl.uniform1f(uTimeLoc, elapsed);
      gl.uniform1f(uAmplitudeLoc, amplitude);
      gl.uniform1f(uBlendLoc, blend);
      gl.uniform2f(uResolutionLoc, canvas.width, canvas.height);
      gl.uniform3fv(uColorStopsLoc, flatColors);

      gl.drawArrays(gl.TRIANGLES, 0, 6);

      if (!prefersReducedMotion) {
        animId = requestAnimationFrame(render);
      }
    };

    render();

    return () => {
      if (animId) cancelAnimationFrame(animId);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      try {
        gl.deleteBuffer(buffer);
        gl.deleteShader(vs);
        gl.deleteShader(fs);
        gl.deleteProgram(program);
      } catch {}
    };
  }, [colorStops, amplitude, blend, speed]);

  return (
    <div className={styles.root} aria-hidden="true">
      {supported ? (
        <canvas ref={canvasRef} className={styles.canvas} />
      ) : (
        <div className={styles.fallback} />
      )}
    </div>
  );
}
