/**
 * glsl — the WebGL2 helper every effect in this wing composes over: get a
 * context, compile two shaders, wire a fullscreen triangle, manage a
 * texture, tear it all down — as library calls, so an effect module ends up
 * being its GLSL strings plus a draw loop. Dependency-free, no React.
 *
 * UV CONVENTION — `v_uv` is DOM-oriented: (0,0) top-left, (1,1)
 * bottom-right, matching how a painted canvas looks on screen. `a_position`
 * stays GL clip space ([-1,1], y up). `FULLSCREEN_VERTEX` does the flip
 * once so `texture(u_tex, v_uv)` samples right-side up — that's why
 * `uploadTexture` defaults `flipY: false`; the vertex shader carries the
 * convention, not the pixel store.
 *
 * DISPOSAL CONTRACT — every `create*` below returns a handle whose
 * `dispose()` deletes exactly what it allocated, nothing it borrowed, and
 * disposal is idempotent. A `Framebuffer` owns its texture, a `Program`
 * owns its shaders, a `PingPong` owns both of its framebuffers.
 *
 * HALF-FLOAT FALLBACK — `createFramebuffer` / `createPingPong` render to
 * half-float color when `EXT_color_buffer_float` (or the half-float
 * variant) is available and requested, else silently fall back to RGBA8.
 * Read the returned `precision` rather than assuming it — effects that
 * iterate (blur passes, sim steps) should lower their count on "byte".
 */

export type GLContext = WebGL2RenderingContext;

export type GLOptions = {
  alpha?: boolean;
  antialias?: boolean;
  premultipliedAlpha?: boolean;
  powerPreference?: WebGLPowerPreference;
  preserveDrawingBuffer?: boolean;
};

/** Create a WebGL2 context with the house defaults (antialias false, low-power). Returns null when unavailable. */
export function createGL(
  canvas: HTMLCanvasElement,
  options: GLOptions = {},
): GLContext | null {
  return canvas.getContext("webgl2", {
    alpha: options.alpha ?? false,
    antialias: options.antialias ?? false,
    premultipliedAlpha: options.premultipliedAlpha ?? true,
    powerPreference: options.powerPreference ?? "low-power",
    preserveDrawingBuffer: options.preserveDrawingBuffer ?? false,
  });
}

function mustCreate<T>(value: T | null, what: string): T {
  if (value === null)
    throw new Error(`glsl: failed to allocate ${what} (context lost?)`);
  return value;
}

export type UniformValue =
  number | boolean | number[] | Float32Array | Int32Array;

export type Program = {
  program: WebGLProgram;
  /** Location per uniform name found in the linked program (introspected via getActiveUniform) — never null-lookups at draw time. */
  uniforms: Record<string, WebGLUniformLocation>;
  /** Attribute locations by name. */
  attributes: Record<string, number>;
  use(): void;
  /**
   * Sets uniforms by their declared GLSL type, introspected at link time:
   * a number lands as float or int as the shader declares it; an array
   * lands as vec2/3/4, a matrix, or a uniform ARRAY of those (pass the
   * flat values — 24 floats for `vec4 u_waves[6]`). Unknown names are
   * ignored silently (effects share shader fragments).
   */
  set(values: Record<string, UniformValue>): void;
  /** Bind a texture to a unit and set the sampler uniform. */
  texture(name: string, texture: WebGLTexture, unit: number): void;
  dispose(): void;
};

const VERSION_RE = /^\s*#version\b/;

function ensureVersion(source: string, isFragment: boolean): string {
  if (VERSION_RE.test(source)) return source;
  return isFragment
    ? `#version 300 es\nprecision highp float;\n${source}`
    : `#version 300 es\n${source}`;
}

function compileShader(
  gl: GLContext,
  type: number,
  source: string,
  stage: "vertex" | "fragment",
): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader;
  const log = gl.getShaderInfoLog(shader) ?? "(no shader log)";
  const numbered = source
    .split("\n")
    .map((line, i) => `${i + 1}: ${line}`)
    .join("\n");
  console.error(`glsl: ${stage} shader failed to compile\n${log}\n${numbered}`);
  gl.deleteShader(shader);
  return null;
}

function setFloatUniform(
  gl: GLContext,
  location: WebGLUniformLocation,
  value: number[] | Float32Array,
): void {
  switch (value.length) {
    case 1:
      gl.uniform1fv(location, value);
      return;
    case 2:
      gl.uniform2fv(location, value);
      return;
    case 3:
      gl.uniform3fv(location, value);
      return;
    case 4:
      gl.uniform4fv(location, value);
      return;
    case 9:
      gl.uniformMatrix3fv(location, false, value);
      return;
    case 16:
      gl.uniformMatrix4fv(location, false, value);
      return;
    default:
      return; // unrecognized arity — ignored, not thrown, to stay forgiving across shared shaders
  }
}

function setIntUniform(
  gl: GLContext,
  location: WebGLUniformLocation,
  value: Int32Array,
): void {
  switch (value.length) {
    case 1:
      gl.uniform1iv(location, value);
      return;
    case 2:
      gl.uniform2iv(location, value);
      return;
    case 3:
      gl.uniform3iv(location, value);
      return;
    case 4:
      gl.uniform4iv(location, value);
      return;
    default:
      return;
  }
}

type UniformInfo = { type: number; size: number };

function isIntegerType(gl: GLContext, type: number): boolean {
  return (
    type === gl.INT ||
    type === gl.BOOL ||
    type === gl.SAMPLER_2D ||
    type === gl.SAMPLER_CUBE ||
    type === gl.INT_VEC2 ||
    type === gl.INT_VEC3 ||
    type === gl.INT_VEC4 ||
    type === gl.BOOL_VEC2 ||
    type === gl.BOOL_VEC3 ||
    type === gl.BOOL_VEC4 ||
    type === gl.UNSIGNED_INT
  );
}

/** Dispatch by the uniform's declared type; returns false when the type is not one this kit knows. */
function setByType(
  gl: GLContext,
  location: WebGLUniformLocation,
  info: UniformInfo,
  value: number[] | Float32Array | Int32Array,
): boolean {
  const floats = value instanceof Int32Array ? Float32Array.from(value) : value;
  const ints = value instanceof Int32Array ? value : Int32Array.from(value);
  switch (info.type) {
    case gl.FLOAT:
      gl.uniform1fv(location, floats);
      return true;
    case gl.FLOAT_VEC2:
      gl.uniform2fv(location, floats);
      return true;
    case gl.FLOAT_VEC3:
      gl.uniform3fv(location, floats);
      return true;
    case gl.FLOAT_VEC4:
      gl.uniform4fv(location, floats);
      return true;
    case gl.FLOAT_MAT2:
      gl.uniformMatrix2fv(location, false, floats);
      return true;
    case gl.FLOAT_MAT3:
      gl.uniformMatrix3fv(location, false, floats);
      return true;
    case gl.FLOAT_MAT4:
      gl.uniformMatrix4fv(location, false, floats);
      return true;
    case gl.INT:
    case gl.BOOL:
    case gl.SAMPLER_2D:
    case gl.SAMPLER_CUBE:
      gl.uniform1iv(location, ints);
      return true;
    case gl.INT_VEC2:
    case gl.BOOL_VEC2:
      gl.uniform2iv(location, ints);
      return true;
    case gl.INT_VEC3:
    case gl.BOOL_VEC3:
      gl.uniform3iv(location, ints);
      return true;
    case gl.INT_VEC4:
    case gl.BOOL_VEC4:
      gl.uniform4iv(location, ints);
      return true;
    default:
      return false;
  }
}

function applyUniform(
  gl: GLContext,
  location: WebGLUniformLocation,
  value: UniformValue,
  info?: UniformInfo,
): void {
  if (typeof value === "boolean") {
    gl.uniform1i(location, value ? 1 : 0);
    return;
  }
  if (typeof value === "number") {
    // A float sent to an int or sampler uniform is INVALID_OPERATION —
    // the declared type decides.
    if (info && isIntegerType(gl, info.type)) gl.uniform1i(location, value);
    else gl.uniform1f(location, value);
    return;
  }
  if (info && setByType(gl, location, info, value)) return;
  if (value instanceof Int32Array) {
    setIntUniform(gl, location, value);
    return;
  }
  setFloatUniform(gl, location, value);
}

/**
 * Compile + link; logs getShaderInfoLog / getProgramInfoLog to
 * console.error with the failing source line numbered, returns null on
 * failure. Prepends `#version 300 es` + `precision highp float;` to the
 * fragment if absent, and `#version 300 es` to the vertex if absent.
 */
export function createProgram(
  gl: GLContext,
  vertex: string,
  fragment: string,
): Program | null {
  const vs = compileShader(
    gl,
    gl.VERTEX_SHADER,
    ensureVersion(vertex, false),
    "vertex",
  );
  const fs = compileShader(
    gl,
    gl.FRAGMENT_SHADER,
    ensureVersion(fragment, true),
    "fragment",
  );
  if (!vs || !fs) {
    if (vs) gl.deleteShader(vs);
    if (fs) gl.deleteShader(fs);
    return null;
  }
  const program = gl.createProgram();
  if (!program) {
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    return null;
  }
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error(
      `glsl: program failed to link\n${gl.getProgramInfoLog(program) ?? "(no program log)"}`,
    );
    gl.deleteProgram(program);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    return null;
  }

  const uniforms: Record<string, WebGLUniformLocation> = {};
  const uniformInfo: Record<string, UniformInfo> = {};
  const uniformCount = gl.getProgramParameter(
    program,
    gl.ACTIVE_UNIFORMS,
  ) as number;
  for (let i = 0; i < uniformCount; i += 1) {
    const info = gl.getActiveUniform(program, i);
    if (!info) continue;
    const name = info.name.replace(/\[0\]$/, "");
    const location = gl.getUniformLocation(program, name);
    if (location) {
      uniforms[name] = location;
      uniformInfo[name] = { type: info.type, size: info.size };
    }
  }
  const attributes: Record<string, number> = {};
  const attributeCount = gl.getProgramParameter(
    program,
    gl.ACTIVE_ATTRIBUTES,
  ) as number;
  for (let i = 0; i < attributeCount; i += 1) {
    const info = gl.getActiveAttrib(program, i);
    if (!info) continue;
    attributes[info.name] = gl.getAttribLocation(program, info.name);
  }

  let disposed = false;
  return {
    program,
    uniforms,
    attributes,
    use: () => gl.useProgram(program),
    set(values) {
      gl.useProgram(program);
      for (const [name, value] of Object.entries(values)) {
        const location = uniforms[name];
        // Unknown uniform: effects share shader fragments, silently skip.
        if (location) applyUniform(gl, location, value, uniformInfo[name]);
      }
    },
    texture(name, tex, unit) {
      const location = uniforms[name];
      if (!location) return;
      gl.useProgram(program);
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.uniform1i(location, unit);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      gl.deleteProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
    },
  };
}

/** The house fullscreen vertex shader (a_position in [-1,1] over one oversized triangle, passes v_uv in [0,1]). Effects that only need a fragment pass import this. */
export const FULLSCREEN_VERTEX = `
in vec2 a_position;
out vec2 v_uv;

void main() {
  v_uv = vec2((a_position.x + 1.0) * 0.5, 1.0 - (a_position.y + 1.0) * 0.5);
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

export type FullscreenTriangle = { draw(): void; dispose(): void };

/** One oversized triangle covering the clip-space square — the house alternative to a two-triangle quad, no diagonal seam. */
export function createFullscreenTriangle(
  gl: GLContext,
  program: Program,
): FullscreenTriangle {
  const vao = mustCreate(gl.createVertexArray(), "fullscreen triangle VAO");
  const buffer = mustCreate(gl.createBuffer(), "fullscreen triangle buffer");
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 3, -1, -1, 3]),
    gl.STATIC_DRAW,
  );
  const location = program.attributes.a_position;
  if (location !== undefined) {
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(location, 2, gl.FLOAT, false, 0, 0);
  }
  gl.bindVertexArray(null);

  let disposed = false;
  return {
    draw: () => {
      gl.bindVertexArray(vao);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      gl.deleteVertexArray(vao);
      gl.deleteBuffer(buffer);
    },
  };
}

export type TextureOptions = {
  flipY?: boolean;
  linear?: boolean;
  wrap?: "clamp" | "repeat";
  premultiply?: boolean;
};

// Tracks the last-uploaded size per texture so uploadTexture can pick the texSubImage2D fast path.
const textureSizes = new WeakMap<
  WebGLTexture,
  { width: number; height: number }
>();

function sourceSize(source: TexImageSource): { width: number; height: number } {
  if (
    typeof HTMLVideoElement !== "undefined" &&
    source instanceof HTMLVideoElement
  ) {
    return { width: source.videoWidth, height: source.videoHeight };
  }
  const sized = source as unknown as { width: number; height: number };
  return { width: sized.width, height: sized.height };
}

/** Upload (or re-upload with texSubImage2D when dimensions match) a canvas/image/video into a texture. Returns the same WebGLTexture when `existing` is passed and sizes match. */
export function uploadTexture(
  gl: GLContext,
  source: TexImageSource,
  options: TextureOptions = {},
  existing: WebGLTexture | null = null,
): WebGLTexture {
  const {
    flipY = false,
    linear = true,
    wrap = "clamp",
    premultiply = false,
  } = options;
  const texture = existing ?? mustCreate(gl.createTexture(), "texture");
  const size = sourceSize(source);
  const previous = existing ? textureSizes.get(existing) : undefined;
  const reused =
    previous !== undefined &&
    previous.width === size.width &&
    previous.height === size.height;

  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, flipY);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, premultiply);

  if (reused) {
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, source);
  } else {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    textureSizes.set(texture, size);
  }

  const filter = linear ? gl.LINEAR : gl.NEAREST;
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  const wrapMode = wrap === "repeat" ? gl.REPEAT : gl.CLAMP_TO_EDGE;
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrapMode);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrapMode);
  return texture;
}

/** An empty RGBA8 (or half-float when requested and supported) texture of a size. */
export function createEmptyTexture(
  gl: GLContext,
  width: number,
  height: number,
  halfFloat = false,
): WebGLTexture {
  const texture = mustCreate(gl.createTexture(), "empty texture");
  const useHalfFloat = halfFloat && supportsHalfFloat(gl);
  const internalFormat = useHalfFloat ? gl.RGBA16F : gl.RGBA8;
  const type = useHalfFloat ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE;
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    internalFormat,
    width,
    height,
    0,
    gl.RGBA,
    type,
    null,
  );
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  textureSizes.set(texture, { width, height });
  return texture;
}

export type Mesh = {
  vao: WebGLVertexArrayObject;
  count: number;
  /** cols×rows vertex grid; positions in [-1,1], uv in [0,1], plus `a_cell` (col,row) per vertex. */
  cols: number;
  rows: number;
  draw(): void;
  dispose(): void;
};

/** An indexed grid mesh (TRIANGLES) with attributes a_position (vec2), a_uv (vec2), a_cell (vec2); binds attributes by the program's attribute locations. For cloth, fold, tile, and shard effects — vertex shaders displace it. */
export function createGridMesh(
  gl: GLContext,
  program: Program,
  cols: number,
  rows: number,
): Mesh {
  const vao = mustCreate(gl.createVertexArray(), "grid mesh VAO");
  const positionBuffer = mustCreate(
    gl.createBuffer(),
    "grid mesh position buffer",
  );
  const uvBuffer = mustCreate(gl.createBuffer(), "grid mesh uv buffer");
  const cellBuffer = mustCreate(gl.createBuffer(), "grid mesh cell buffer");
  const indexBuffer = mustCreate(gl.createBuffer(), "grid mesh index buffer");
  const vertsX = cols + 1;
  const vertsY = rows + 1;
  const vertexCount = vertsX * vertsY;
  const positions = new Float32Array(vertexCount * 2);
  const uvs = new Float32Array(vertexCount * 2);
  const cells = new Float32Array(vertexCount * 2);

  // row 0 (t=0) sits at clip y=1 — DOM top maps to GL top.
  let v = 0;
  for (let row = 0; row < vertsY; row += 1) {
    for (let col = 0; col < vertsX; col += 1) {
      const u = col / cols;
      const t = row / rows;
      positions[v * 2] = u * 2 - 1;
      positions[v * 2 + 1] = 1 - t * 2;
      uvs[v * 2] = u;
      uvs[v * 2 + 1] = t;
      cells[v * 2] = col;
      cells[v * 2 + 1] = row;
      v += 1;
    }
  }

  const quadCount = cols * rows;
  const indexCount = quadCount * 6;
  const useShort = vertexCount <= 65535;
  const indices = useShort
    ? new Uint16Array(indexCount)
    : new Uint32Array(indexCount);
  // CCW winding in clip space: row increases downward, so c/d sit below a/b.
  let i = 0;
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const a = row * vertsX + col,
        b = a + 1,
        c = a + vertsX,
        d = c + 1;
      indices[i] = a;
      indices[i + 1] = c;
      indices[i + 2] = b;
      indices[i + 3] = b;
      indices[i + 4] = c;
      indices[i + 5] = d;
      i += 6;
    }
  }

  gl.bindVertexArray(vao);
  const bindAttribute = (
    buffer: WebGLBuffer,
    name: string,
    data: Float32Array,
  ) => {
    const location = program.attributes[name];
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    if (location === undefined) return; // program doesn't use this attribute — buffer stays allocated, unbound
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(location, 2, gl.FLOAT, false, 0, 0);
  };
  bindAttribute(positionBuffer, "a_position", positions);
  bindAttribute(uvBuffer, "a_uv", uvs);
  bindAttribute(cellBuffer, "a_cell", cells);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
  gl.bindVertexArray(null);

  const indexType = useShort ? gl.UNSIGNED_SHORT : gl.UNSIGNED_INT;
  let disposed = false;
  return {
    vao,
    count: indexCount,
    cols,
    rows,
    draw: () => {
      gl.bindVertexArray(vao);
      gl.drawElements(gl.TRIANGLES, indexCount, indexType, 0);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      gl.deleteVertexArray(vao);
      gl.deleteBuffer(positionBuffer);
      gl.deleteBuffer(uvBuffer);
      gl.deleteBuffer(cellBuffer);
      gl.deleteBuffer(indexBuffer);
    },
  };
}

export type Framebuffer = {
  fbo: WebGLFramebuffer;
  texture: WebGLTexture;
  width: number;
  height: number;
  /** "half" when a float-renderable format was used, "byte" for RGBA8. */
  precision: "half" | "byte";
  bind(): void;
  dispose(): void;
};

/** Half-float when `EXT_color_buffer_float` (or `EXT_color_buffer_half_float`) is available and `halfFloat` is requested; otherwise RGBA8. Callers read `precision` to lower iteration counts. */
export function createFramebuffer(
  gl: GLContext,
  width: number,
  height: number,
  halfFloat = false,
): Framebuffer {
  const fbo = mustCreate(gl.createFramebuffer(), "framebuffer");
  const wantHalfFloat = halfFloat && supportsHalfFloat(gl);
  let precision: "half" | "byte" = wantHalfFloat ? "half" : "byte";
  let texture = createEmptyTexture(gl, width, height, wantHalfFloat);
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(
    gl.FRAMEBUFFER,
    gl.COLOR_ATTACHMENT0,
    gl.TEXTURE_2D,
    texture,
    0,
  );
  if (
    wantHalfFloat &&
    gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE
  ) {
    // Renderable half-float was reported supported but this format/size combo isn't — fall back.
    gl.deleteTexture(texture);
    precision = "byte";
    texture = createEmptyTexture(gl, width, height, false);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      texture,
      0,
    );
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  let disposed = false;
  return {
    fbo,
    texture,
    width,
    height,
    precision,
    bind: () => {
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.viewport(0, 0, width, height);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      gl.deleteFramebuffer(fbo);
      gl.deleteTexture(texture);
    },
  };
}

export type PingPong = {
  read: Framebuffer;
  write: Framebuffer;
  swap(): void;
  precision: "half" | "byte";
  dispose(): void;
};

/** Two framebuffers for feedback effects (blur passes, ripple sims); `swap()` exchanges which is read from and written to. Both share one precision — `write` matches whatever `read` actually landed on, so a pass never mixes buffer formats. */
export function createPingPong(
  gl: GLContext,
  width: number,
  height: number,
  halfFloat = false,
): PingPong {
  const read = createFramebuffer(gl, width, height, halfFloat);
  const write = createFramebuffer(gl, width, height, read.precision === "half");
  const pingpong: PingPong = {
    read,
    write,
    precision: read.precision,
    swap() {
      const tmp = pingpong.read;
      pingpong.read = pingpong.write;
      pingpong.write = tmp;
    },
    dispose() {
      pingpong.read.dispose();
      pingpong.write.dispose();
    },
  };
  return pingpong;
}

/** Bind the default framebuffer and set the viewport to the canvas. */
export function bindScreen(gl: GLContext): void {
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
}

export type ResizeResult = {
  width: number;
  height: number;
  dpr: number;
  changed: boolean;
};

/** Size the canvas backing store from its CSS box × min(devicePixelRatio, dprCap) × renderScale; sets gl.viewport; returns whether it changed. */
export function resizeGL(
  gl: GLContext,
  canvas: HTMLCanvasElement,
  options: { dprCap?: number; renderScale?: number } = {},
): ResizeResult {
  const { dprCap = 2, renderScale = 1 } = options;
  const dpr = Math.min(window.devicePixelRatio || 1, dprCap);
  const width = Math.max(1, Math.floor(canvas.clientWidth * dpr * renderScale));
  const height = Math.max(
    1,
    Math.floor(canvas.clientHeight * dpr * renderScale),
  );
  const changed = canvas.width !== width || canvas.height !== height;
  if (changed) {
    canvas.width = width;
    canvas.height = height;
  }
  gl.viewport(0, 0, width, height);
  return { width, height, dpr, changed };
}

/** Attach webglcontextlost (preventDefault + onLost) and webglcontextrestored (onRestored) listeners; returns a detach function. */
export function onContextLoss(
  canvas: HTMLCanvasElement,
  onLost: () => void,
  onRestored?: () => void,
): () => void {
  const handleLost = (event: Event) => {
    event.preventDefault();
    onLost();
  };
  const handleRestored = () => onRestored?.();
  canvas.addEventListener("webglcontextlost", handleLost);
  canvas.addEventListener("webglcontextrestored", handleRestored);
  return () => {
    canvas.removeEventListener("webglcontextlost", handleLost);
    canvas.removeEventListener("webglcontextrestored", handleRestored);
  };
}

const halfFloatSupport = new WeakMap<GLContext, boolean>();

/** Whether float colour buffers can be rendered to (memoised per context). */
export function supportsHalfFloat(gl: GLContext): boolean {
  const cached = halfFloatSupport.get(gl);
  if (cached !== undefined) return cached;
  const supported = Boolean(
    gl.getExtension("EXT_color_buffer_float") ??
    gl.getExtension("EXT_color_buffer_half_float"),
  );
  halfFloatSupport.set(gl, supported);
  return supported;
}

/** Read back RGBA bytes from the current framebuffer (tests use this to prove pixels were painted). */
export function readPixels(
  gl: GLContext,
  x: number,
  y: number,
  width: number,
  height: number,
): Uint8Array {
  const pixels = new Uint8Array(width * height * 4);
  gl.readPixels(x, y, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  return pixels;
}

// Shared GLSL snippets — `kx_` prefixed so concatenated fragments never collide.

/** Hash + value noise + fbm, deterministic from uv — no time seed. Feed it `v_uv * scale (+ time)` yourself if an effect wants motion. */
export const GLSL_NOISE = `
float kx_hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
float kx_noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(kx_hash(i), kx_hash(i + vec2(1.0, 0.0)), u.x),
             mix(kx_hash(i + vec2(0.0, 1.0)), kx_hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float kx_fbm(vec2 p) {
  float sum = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 5; i += 1) { sum += amp * kx_noise(p); p *= 2.02; amp *= 0.5; }
  return sum;
}
`;

/** Rec. 709 relative luminance of a linear/display colour. */
export const GLSL_LUMA = `
float kx_luma(vec3 color) { return dot(color, vec3(0.2126, 0.7152, 0.0722)); }
`;

/** sRGB ⇄ linear conversion, IEC 61966-2-1. */
export const GLSL_SRGB = `
vec3 kx_srgbToLinear(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }
vec3 kx_linearToSrgb(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
`;
