/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export function createShader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) {
    throw new Error('Failed to initialize WebGL shader instance');
  }
  
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  
  const compiled = gl.getShaderParameter(shader, gl.COMPILE_STATUS);
  if (!compiled) {
    const infoLog = gl.getShaderInfoLog(shader) || 'Unknown compilation error';
    gl.deleteShader(shader);
    
    // Extract readable line numbering/formatting for displaying in our UI error panel
    const lines = source.split('\n');
    const formattedSource = lines.map((line, idx) => `${idx + 1}: ${line}`).join('\n');
    throw new Error(`Shader compilation error [${type === gl.VERTEX_SHADER ? 'Vertex' : 'Fragment'} Shader]:\n${infoLog}\n\nShader Source Code:\n${formattedSource}`);
  }
  return shader;
}

export function createProgram(gl: WebGLRenderingContext, vsSource: string, fsSource: string): WebGLProgram {
  const vs = createShader(gl, gl.VERTEX_SHADER, vsSource);
  const fs = createShader(gl, gl.FRAGMENT_SHADER, fsSource);
  
  const program = gl.createProgram();
  if (!program) {
    throw new Error('Failed to construct the WebGL Program context');
  }
  
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  
  const linked = gl.getProgramParameter(program, gl.LINK_STATUS);
  if (!linked) {
    const infoLog = gl.getProgramInfoLog(program) || 'Unknown program link error';
    gl.deleteProgram(program);
    throw new Error(`WebGL Program linkage failed:\n${infoLog}`);
  }
  return program;
}

export function createTexture(gl: WebGLRenderingContext, width: number, height: number): WebGLTexture {
  const texture = gl.createTexture();
  if (!texture) {
    throw new Error('Failed to create WebGL Texture object');
  }
  
  gl.bindTexture(gl.TEXTURE_2D, texture);
  // Allocate static space for the texture. In WebGL1 CLAMP_TO_EDGE is required for non-power-of-two frame buffers
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  
  return texture;
}

export function createFramebuffer(gl: WebGLRenderingContext, texture: WebGLTexture): WebGLFramebuffer {
  const fbo = gl.createFramebuffer();
  if (!fbo) {
    throw new Error('Failed to instantiate WebGL Framebuffer object');
  }
  
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
  
  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  if (status !== gl.FRAMEBUFFER_COMPLETE) {
    gl.deleteFramebuffer(fbo);
    throw new Error(`Framebuffer completeness check failed. Status Code: ${status}`);
  }
  
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return fbo;
}

export interface PingPongTarget {
  read: { texture: WebGLTexture; fbo: WebGLFramebuffer };
  write: { texture: WebGLTexture; fbo: WebGLFramebuffer };
  swap: () => void;
  resize: (width: number, height: number) => void;
  destroy: () => void;
}

export function createPingPongTargets(gl: WebGLRenderingContext, initialWidth: number, initialHeight: number): PingPongTarget {
  let texA = createTexture(gl, initialWidth, initialHeight);
  let fboA = createFramebuffer(gl, texA);
  
  let texB = createTexture(gl, initialWidth, initialHeight);
  let fboB = createFramebuffer(gl, texB);
  
  const state = {
    read: { texture: texA, fbo: fboA },
    write: { texture: texB, fbo: fboB },
  };
  
  // High-performance direct swap mapping
  const swap = () => {
    const temp = state.read;
    state.read = state.write;
    state.write = temp;
  };
  
  const resize = (width: number, height: number) => {
    gl.deleteFramebuffer(state.read.fbo);
    gl.deleteTexture(state.read.texture);
    gl.deleteFramebuffer(state.write.fbo);
    gl.deleteTexture(state.write.texture);
    
    texA = createTexture(gl, width, height);
    fboA = createFramebuffer(gl, texA);
    texB = createTexture(gl, width, height);
    fboB = createFramebuffer(gl, texB);
    
    state.read = { texture: texA, fbo: fboA };
    state.write = { texture: texB, fbo: fboB };
  };
  
  const destroy = () => {
    gl.deleteFramebuffer(state.read.fbo);
    gl.deleteTexture(state.read.texture);
    gl.deleteFramebuffer(state.write.fbo);
    gl.deleteTexture(state.write.texture);
  };
  
  return {
    get read() { return state.read; },
    get write() { return state.write; },
    swap,
    resize,
    destroy
  };
}
