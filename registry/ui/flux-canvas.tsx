"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cn } from "@/registry/lib/utils";

export type FluxVariant = "mesh" | "warp";

export type FluxCanvasProps = {
  variant?: FluxVariant;
  speed?: number;
  /** Pointer subtly displaces the field. */
  interactive?: boolean;
  /** CSS custom properties resolved to the three shader colors. */
  colorVars?: [string, string, string];
  /** Force the static-gradient fallback (also used when WebGL2 is absent). */
  forceFallback?: boolean;
  children?: React.ReactNode;
  className?: string;
};

const VERT = `#version 300 es
in vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }`;

const FRAG = `#version 300 es
precision highp float;
out vec4 o;
uniform vec2 u_res;
uniform float u_time;
uniform vec2 u_ptr;
uniform int u_variant;
uniform vec3 u_c0;
uniform vec3 u_c1;
uniform vec3 u_c2;

// hash + value noise
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p){
  vec2 i = floor(p); vec2 f = fract(p);
  vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(hash(i), hash(i+vec2(1,0)), u.x),
             mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), u.x), u.y);
}
float fbm(vec2 p){ return 0.6*noise(p) + 0.4*noise(p*2.03 + 5.1); }

void main(){
  vec2 uv = gl_FragCoord.xy / u_res;
  vec2 asp = vec2(u_res.x / u_res.y, 1.0);
  vec2 st = uv * asp;
  vec2 ptr = u_ptr * asp;
  float t = u_time;

  vec3 col;
  if (u_variant == 0) {
    // mesh: three drifting radial blobs, smoothly mixed
    vec2 a = vec2(0.5 + 0.30*sin(t*0.7), 0.5 + 0.24*cos(t*0.6)) * asp + (ptr-0.5*asp)*0.15;
    vec2 b = vec2(0.5 + 0.28*cos(t*0.5+2.0), 0.5 + 0.30*sin(t*0.4+1.0)) * asp;
    vec2 c = vec2(0.5 + 0.26*sin(t*0.45+4.0), 0.5 + 0.22*cos(t*0.55+3.0)) * asp;
    float wa = 1.0 / (0.06 + dot(st-a, st-a));
    float wb = 1.0 / (0.06 + dot(st-b, st-b));
    float wc = 1.0 / (0.06 + dot(st-c, st-c));
    float s = wa + wb + wc;
    col = (u_c0*wa + u_c1*wb + u_c2*wc) / s;
  } else {
    // warp: domain-warped noise tinted between the tokens
    vec2 q = vec2(fbm(st*2.0 + t*0.10), fbm(st*2.0 - t*0.12 + 3.0));
    vec2 r = st*2.5 + q*1.4 + (ptr-0.5*asp)*0.3;
    float n = fbm(r + t*0.06);
    col = mix(u_c2, mix(u_c0, u_c1, smoothstep(0.35, 0.7, n)), smoothstep(0.2, 0.9, n));
  }
  o = vec4(col, 1.0);
}`;

function readColor(cssVar: string, fallback: [number, number, number]) {
  if (typeof window === "undefined") return fallback;
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue(cssVar)
    .trim();
  if (!raw) return fallback;
  // Resolve any CSS color (oklch/hex/rgb) via a probe element.
  const probe = document.createElement("span");
  probe.style.color = raw;
  probe.style.display = "none";
  document.body.appendChild(probe);
  const rgb = getComputedStyle(probe).color;
  probe.remove();
  const m = rgb.match(/[\d.]+/g);
  if (!m || m.length < 3) return fallback;
  return [Number(m[0]) / 255, Number(m[1]) / 255, Number(m[2]) / 255] as [
    number,
    number,
    number,
  ];
}

/**
 * A gradient with a pulse: a tiny WebGL2 fragment shader drives a mesh of
 * drifting color blobs or a domain-warped noise field, tinted from your
 * theme tokens. Falls back to a static CSS gradient with no WebGL2 or on
 * context loss; freezes to one frame under reduced motion.
 *
 * Ships `draft` until broad device QA (battery, driver variance) clears.
 */
export function FluxCanvas({
  variant = "mesh",
  speed = 0.5,
  interactive = true,
  colorVars = ["--primary", "--secondary", "--background"],
  forceFallback = false,
  children,
  className,
}: FluxCanvasProps) {
  const motionSafe = useMotionSafe();
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [failed, setFailed] = React.useState(false);

  const useFallback = forceFallback || failed;

  React.useEffect(() => {
    if (useFallback) return;
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const gl = canvas.getContext("webgl2", {
      antialias: false,
      alpha: false,
      powerPreference: "low-power",
    });
    if (!gl) {
      setFailed(true);
      return;
    }

    const compile = (type: number, src: string) => {
      const sh = gl.createShader(type);
      if (!sh) return null;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      return sh;
    };
    const vs = compile(gl.VERTEX_SHADER, VERT);
    const fs = compile(gl.FRAGMENT_SHADER, FRAG);
    const prog = gl.createProgram();
    if (!vs || !fs || !prog) {
      setFailed(true);
      return;
    }
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      setFailed(true);
      return;
    }
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]),
      gl.STATIC_DRAW,
    );
    const loc = gl.getAttribLocation(prog, "p");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const u = {
      res: gl.getUniformLocation(prog, "u_res"),
      time: gl.getUniformLocation(prog, "u_time"),
      ptr: gl.getUniformLocation(prog, "u_ptr"),
      variant: gl.getUniformLocation(prog, "u_variant"),
      c0: gl.getUniformLocation(prog, "u_c0"),
      c1: gl.getUniformLocation(prog, "u_c1"),
      c2: gl.getUniformLocation(prog, "u_c2"),
    };
    gl.uniform1i(u.variant, variant === "mesh" ? 0 : 1);

    const applyColors = () => {
      const [v0, v1, v2] = colorVars;
      const c0 = readColor(v0, [0.36, 0.4, 0.95]);
      const c1 = readColor(v1, [0.2, 0.22, 0.3]);
      const c2 = readColor(v2, [0.08, 0.09, 0.12]);
      gl.uniform3fv(u.c0, c0);
      gl.uniform3fv(u.c1, c1);
      gl.uniform3fv(u.c2, c2);
    };

    // Internal render scale + DPR cap keep the shader cheap.
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const renderScale = 0.75;
    const resize = () => {
      const w = Math.max(1, Math.floor(container.clientWidth * dpr * renderScale));
      const h = Math.max(1, Math.floor(container.clientHeight * dpr * renderScale));
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
      gl.uniform2f(u.res, w, h);
    };

    const ptr = { x: 0.5, y: 0.5 };
    const onPointer = (e: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      ptr.x = (e.clientX - rect.left) / rect.width;
      ptr.y = 1 - (e.clientY - rect.top) / rect.height;
    };
    if (interactive) container.addEventListener("pointermove", onPointer);

    const ro = new ResizeObserver(resize);
    ro.observe(container);
    resize();
    applyColors();

    const themeObserver = new MutationObserver(applyColors);
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    let raf = 0;
    let start = 0;
    let visible = true;
    const smoothPtr = { x: 0.5, y: 0.5 };

    const frame = (now: number) => {
      if (!start) start = now;
      const t = ((now - start) / 1000) * speed;
      smoothPtr.x += (ptr.x - smoothPtr.x) * 0.06;
      smoothPtr.y += (ptr.y - smoothPtr.y) * 0.06;
      gl.uniform1f(u.time, t);
      gl.uniform2f(u.ptr, smoothPtr.x, smoothPtr.y);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      raf = requestAnimationFrame(frame);
    };

    const drawStatic = () => {
      gl.uniform1f(u.time, 1.7);
      gl.uniform2f(u.ptr, 0.5, 0.5);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    const onContextLost = (e: Event) => {
      e.preventDefault();
      cancelAnimationFrame(raf);
      setFailed(true);
    };
    canvas.addEventListener("webglcontextlost", onContextLost);

    const io = new IntersectionObserver(
      ([entry]) => {
        visible = entry?.isIntersecting ?? true;
        if (!motionSafe) return;
        if (visible && !document.hidden && !raf) {
          start = 0;
          raf = requestAnimationFrame(frame);
        } else if (!visible) {
          cancelAnimationFrame(raf);
          raf = 0;
        }
      },
      { threshold: 0 },
    );
    io.observe(container);

    const onVisibility = () => {
      if (!motionSafe) return;
      if (document.hidden) {
        cancelAnimationFrame(raf);
        raf = 0;
      } else if (visible && !raf) {
        start = 0;
        raf = requestAnimationFrame(frame);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    if (motionSafe) {
      raf = requestAnimationFrame(frame);
    } else {
      drawStatic();
    }

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      themeObserver.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      canvas.removeEventListener("webglcontextlost", onContextLost);
      if (interactive) container.removeEventListener("pointermove", onPointer);
      gl.deleteProgram(prog);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      gl.deleteBuffer(buf);
    };
  }, [variant, speed, interactive, colorVars, motionSafe, useFallback]);

  return (
    <div
      ref={containerRef}
      className={cn("relative overflow-hidden", className)}
    >
      {useFallback ? (
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background: `radial-gradient(120% 120% at 30% 20%, var(${colorVars[0]}) 0%, transparent 55%), radial-gradient(120% 120% at 80% 80%, var(${colorVars[1]}) 0%, var(${colorVars[2]}) 70%)`,
          }}
        />
      ) : (
        <canvas ref={canvasRef} aria-hidden className="absolute inset-0 size-full" />
      )}
      <div className="relative z-10">{children}</div>
    </div>
  );
}
