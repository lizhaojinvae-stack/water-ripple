/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import { Camera, RefreshCw, Hand, Info, MousePointer, Sliders, ChevronDown, ChevronUp, Settings2 } from 'lucide-react';
import { Finger } from './types';
import { VERTEX_SHADER, SIMULATION_FRAGMENT_SHADER, RENDERING_FRAGMENT_SHADER } from './webgl-shaders';
import { createProgram, createPingPongTargets, PingPongTarget } from './utils/webgl-helper';
import CameraSelector from './components/CameraSelector';
import ShaderErrorDisplay from './components/ShaderErrorDisplay';
import AudioPanel from './components/AudioPanel';

// High-quality, professional dark abstract backgrounds optimized for glass liquid refraction shading
export const DEFAULT_BACKGROUND_URL = 'https://images.unsplash.com/photo-1506318137071-a8e063b4bec0?q=80&w=1280&auto=format&fit=crop';

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  
  // App options & tracking states
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [cameraLabel, setCameraLabel] = useState<string>('Initializing Camera...');
  const [handsCount, setHandsCount] = useState<number>(0);
  const [cameraActive, setCameraActive] = useState<boolean>(false);
  const [loadingStatus, setLoadingStatus] = useState<string>('Loading MediaPipe Models...');
  const [isFullyLoaded, setIsFullyLoaded] = useState<boolean>(false);
  const [activeSynthCount, setActiveSynthCount] = useState<number>(0);
  const activeCountRef = useRef<number>(0);
  
  // Water parameters custom state (for interactive tuning matching user request)
  const [rippleRadius, setRippleRadius] = useState<number>(0.026); // Default 0.026 (smaller, tighter)
  const [rippleStrength, setRippleStrength] = useState<number>(0.12); // Default 0.12 (lighter)
  const [ripplePersistence, setRipplePersistence] = useState<number>(0.85); // Default 0.85 (balanced organic duration)
  const [onlyHands, setOnlyHands] = useState<boolean>(false); // Strict gesture tracking fallback gate
  const [paramsExpanded, setParamsExpanded] = useState<boolean>(true); // Expanded by default for visibility
  
  // Background selection custom state (solving "too bright, give screen a background image")
  const [bgType, setBgType] = useState<string>('default'); 
  const [customBgUrl, setCustomBgUrl] = useState<string | null>(null);
  const [bgMix, setBgMix] = useState<number>(0.7); // Default 70% background strength/depth
  const bgMixRef = useRef<number>(0.7);
  const [cameraMix, setCameraMix] = useState<number>(0.5); // Default 50% for vibrant camera presence coexisting with background preset
  const cameraMixRef = useRef<number>(0.5);
  const [blendMode, setBlendMode] = useState<number>(1); // Default to 1 (Screen/Double Exposure) for beautiful coexisting glow effect!
  const blendModeRef = useRef<number>(1);

  // Water parameters refs (read with high-performance inside WebGL loop)
  const rippleRadiusRef = useRef<number>(0.026);
  const rippleStrengthRef = useRef<number>(0.12);
  const ripplePersistenceRef = useRef<number>(0.85);
  const onlyHandsRef = useRef<boolean>(false);

  // Background refs to synchronize with WebGL loop
  const bgTypeRef = useRef<string>('default');
  const activeBgImageRef = useRef<HTMLImageElement | null>(null);
  const textureNeedsUploadRef = useRef<boolean>(false);

  // Error panel states
  const [shaderError, setShaderError] = useState<string | null>(null);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [devicesCount, setDevicesCount] = useState<number>(1);

  // WebGL context & pipeline refs
  const glRef = useRef<WebGLRenderingContext | null>(null);
  const vertexBufferRef = useRef<WebGLBuffer | null>(null);
  const simProgramRef = useRef<WebGLProgram | null>(null);
  const renderProgramRef = useRef<WebGLProgram | null>(null);
  const pingPongRef = useRef<PingPongTarget | null>(null);
  const cameraTexRef = useRef<WebGLTexture | null>(null);
  const bgTexRef = useRef<WebGLTexture | null>(null);

  // Decoupled target references to gather input asynchronously
  const handTargetsRef = useRef<{ x: number; y: number; active: boolean }[]>(
    Array.from({ length: 9 }, () => ({ x: 0.5, y: 0.5, active: false }))
  );

  const mouseTargetRef = useRef<{ x: number; y: number; active: boolean }>({
    x: 0.5,
    y: 0.5,
    active: false,
  });

  // Active smooth finger data used in the 60fps WebGL update cycle
  const fingersRef = useRef<Finger[]>(
    Array.from({ length: 10 }, () => ({
      x: 0.5,
      y: 0.5,
      prevX: 0.5,
      prevY: 0.5,
      active: 0.0,
      radius: 0.026,
      strength: 0.12,
    }))
  );

  // MediaPipe solution instance ref
  const handsInstanceRef = useRef<any>(null);

  // Check for camera devices count
  useEffect(() => {
    if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
      navigator.mediaDevices.enumerateDevices().then((devices) => {
        const cameras = devices.filter((d) => d.kind === 'videoinput');
        setDevicesCount(cameras.length);
      }).catch(err => console.warn('Device lookup failed', err));
    }
  }, []);

  // 1. DYNAMICALLY LOAD MEDIAPIPE HANDS CDN
  useEffect(() => {
    let active = true;
    setLoadingStatus('Fetching MediaPipe packages via CDN...');

    const loadMediaPipe = () => {
      const win = window as any;
      if (win.Hands) {
        initMediaPipe();
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4/hands.js';
      script.crossOrigin = 'anonymous';
      script.async = true;
      script.onload = () => {
        if (!active) return;
        if (win.Hands) {
          initMediaPipe();
        } else {
          setMediaError('MediaPipe Hands module loaded in browser, but constructor is undefined.');
        }
      };
      script.onerror = () => {
        if (!active) return;
        setMediaError('Failed to fetch MediaPipe Hands script from CDN. Please check Internet access.');
      };
      document.body.appendChild(script);
    };

    const initMediaPipe = () => {
      if (!active) return;
      try {
        setLoadingStatus('Initializing hand-tracking neural network...');
        const win = window as any;
        
        const hands = new win.Hands({
          locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4/${file}`,
        });

        hands.setOptions({
          maxNumHands: 2,
          modelComplexity: 1,
          minDetectionConfidence: 0.7,
          minTrackingConfidence: 0.7,
        });

        hands.onResults((results: any) => {
          if (!active) return;
          processHandResults(results);
        });

        handsInstanceRef.current = hands;
        setLoadingStatus('Models loaded. Starting hardware acceleration...');
        setIsFullyLoaded(true);
      } catch (err: any) {
        setMediaError(`MediaPipe initialization failed: ${err?.message || err}`);
      }
    };

    loadMediaPipe();

    return () => {
      active = false;
      if (handsInstanceRef.current) {
        try {
          handsInstanceRef.current.close();
        } catch (e) {}
      }
    };
  }, []);

  // BACKGROUND IMAGE LOADING LOADER
  useEffect(() => {
    bgTypeRef.current = bgType;
    const src = bgType === 'custom' && customBgUrl ? customBgUrl : DEFAULT_BACKGROUND_URL;

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = src;
    img.onload = () => {
      activeBgImageRef.current = img;
      textureNeedsUploadRef.current = true;
    };
  }, [bgType, customBgUrl]);

  // PROCESS MEDIAPIPE RESULTS & MAP TO FINGER UNIFORM SLOTS
  const processHandResults = (results: any) => {
    const handTargets = handTargetsRef.current;
    
    // Deactivate all targets by default, then selectively reactivate based on results
    for (let i = 0; i < 9; i++) {
      handTargets[i].active = false;
    }

    let slotIdx = 0;
    const isFront = facingMode === 'user';

    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
      setHandsCount(results.multiHandLandmarks.length);
      
      // Fingertip landmark IDs in MediaPipe Hand Mesh:
      // Thumb (4), Index (8), Middle (12), Ring (16), Pinky (20)
      const tipIds = [4, 8, 12, 16, 20];

      for (let h = 0; h < Math.min(2, results.multiHandLandmarks.length); h++) {
        const handLandmarks = results.multiHandLandmarks[h];
        
        for (let t = 0; t < tipIds.length; t++) {
          if (slotIdx >= 9) break; // Keep slot 9 exclusively for mouse
          const tipId = tipIds[t];
          const landmark = handLandmarks[tipId];

          if (landmark) {
            const target = handTargets[slotIdx];
            
            // Map coordinate horizontally (flip if using mirrored front camera)
            target.x = isFront ? (1.0 - landmark.x) : landmark.x;
            target.y = 1.0 - landmark.y; // Invert for WebGL texture coordinate system
            target.active = true;
            slotIdx++;
          }
        }
      }
    } else {
      setHandsCount(0);
    }
  };

  // 2. CAMERA FEED ACQUISITION & ROTATION CYCLES
  useEffect(() => {
    let active = true;
    let stream: MediaStream | null = null;
    setCameraActive(false);

    const startCamera = async () => {
      try {
        setCameraLabel('Connecting camera hardware...');
        if (stream) {
          stream.getTracks().forEach((track) => track.stop());
        }

        const constraints = {
          audio: false,
          video: {
            facingMode: facingMode,
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        };

        const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
        if (!active) {
          mediaStream.getTracks().forEach((track) => track.stop());
          return;
        }

        stream = mediaStream;
        
        const video = document.createElement('video');
        video.autoplay = true;
        video.playsInline = true;
        video.muted = true;
        video.srcObject = mediaStream;
        
        video.onloadedmetadata = () => {
          if (!active) return;
          video.play().then(() => {
            videoRef.current = video;
            setCameraActive(true);
            
            // Extract display label of currently connected camera device
            const track = mediaStream.getVideoTracks()[0];
            setCameraLabel(track.label || (facingMode === 'user' ? 'Front Facing Camera' : 'Rear Facing Camera'));
          });
        };
      } catch (err: any) {
        console.error('Camera stream error:', err);
        setMediaError(`Camera Permission Denied or Not Supported. Details: ${err?.message || err}`);
        setCameraLabel('Camera connection failed');
      }
    };

    startCamera();

    return () => {
      active = false;
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [facingMode]);

  // Handle switching camera mode safely
  const toggleCamera = () => {
    setFacingMode((prev) => (prev === 'user' ? 'environment' : 'user'));
  };

  // 3. CORE WEBGL PIPELINE INITIALIZATION & EVENT TICKER
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext('webgl', {
      alpha: false,
      depth: false,
      stencil: false,
      antialias: false,
      isWebGL2: false,
      preserveDrawingBuffer: false,
    });

    if (!gl) {
      setShaderError('Your browser or system does not support standard WebGL1 rendering context.');
      return;
    }
    glRef.current = gl;

    // Compile Shaders & Create WebGL Programs
    try {
      setShaderError(null);
      simProgramRef.current = createProgram(gl, VERTEX_SHADER, SIMULATION_FRAGMENT_SHADER);
      renderProgramRef.current = createProgram(gl, VERTEX_SHADER, RENDERING_FRAGMENT_SHADER);
    } catch (err: any) {
      setShaderError(err?.message || String(err));
      return;
    }

    // Set up fullscreen single-quad vertex buffers
    const vertexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([
        -1.0, -1.0,
         1.0, -1.0,
        -1.0,  1.0,
        -1.0,  1.0,
         1.0, -1.0,
         1.0,  1.0,
      ]),
      gl.STATIC_DRAW
    );
    vertexBufferRef.current = vertexBuffer;

    // Create high-dynamic ping-pong render targets for simulation heightmaps
    const aspect = window.innerWidth / window.innerHeight;
    const simWidth = 512;
    const simHeight = Math.round(512 / aspect);
    pingPongRef.current = createPingPongTargets(gl, simWidth, simHeight);

    // Create persistent camera feed texture context
    const camTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, camTex);
    // Initialize with a 1x1 temporary dark grey solid texture to avoid uninitialized read warnings
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([20, 20, 25, 255]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    cameraTexRef.current = camTex;

    // Create persistent background preset texture context
    const bgTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, bgTex);
    // Initialize with a 1x1 temporary dark teal/nebula grey solid texture
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([10, 15, 20, 255]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    bgTexRef.current = bgTex;

    // Bind viewport dimensions dynamically on screen layout shifts
    const handleResize = () => {
      if (!canvas || !gl || !pingPongRef.current) return;
      
      const width = window.innerWidth;
      const height = window.innerHeight;
      canvas.width = width;
      canvas.height = height;



      const currentAspect = width / height;
      const nextSimW = 512;
      const nextSimH = Math.round(512 / currentAspect);
      
      pingPongRef.current.resize(nextSimW, nextSimH);
    };

    window.addEventListener('resize', handleResize);
    handleResize(); // Initial viewport mapping

    return () => {
      window.removeEventListener('resize', handleResize);
      
      // Clean up GPU memory contexts
      const g = glRef.current;
      if (g) {
        if (vertexBufferRef.current) g.deleteBuffer(vertexBufferRef.current);
        if (simProgramRef.current) g.deleteProgram(simProgramRef.current);
        if (renderProgramRef.current) g.deleteProgram(renderProgramRef.current);
        if (cameraTexRef.current) g.deleteTexture(cameraTexRef.current);
        if (bgTexRef.current) g.deleteTexture(bgTexRef.current);
      }
      if (pingPongRef.current) pingPongRef.current.destroy();
    };
  }, []);

  // 4. ANIMATED TICK LOOP - PIPING SIMULATION AND PRESENTER RENDER
  useEffect(() => {
    let animFrameId = 0;
    let processingHandTracker = false;

    const renderLoop = () => {
      const gl = glRef.current;
      const canvas = canvasRef.current;
      const video = videoRef.current;
      const pp = pingPongRef.current;
      const simProg = simProgramRef.current;
      const rendProg = renderProgramRef.current;
      const camTex = cameraTexRef.current;

      if (!gl || !canvas || !pp || !simProg || !rendProg || !camTex) {
        animFrameId = requestAnimationFrame(renderLoop);
        return;
      }

      // Parallel Non-blocking call of MediaPipe hand detection
      if (video && video.readyState === video.HAVE_ENOUGH_DATA && handsInstanceRef.current && !processingHandTracker) {
        processingHandTracker = true;
        handsInstanceRef.current.send({ image: video })
          .then(() => { processingHandTracker = false; })
          .catch(() => { processingHandTracker = false; });
      }

      const viewWidth = canvas.width;
      const viewHeight = canvas.height;
      const aspect = viewWidth / viewHeight;

      const simWidth = 512;
      const simHeight = Math.round(512 / aspect);

      // WebGL Texture Coordinate Helpers
      const texelX = 1.0 / simWidth;
      const texelY = 1.0 / simHeight;

      // Interpolate finger slots based on asynchronous inputs in handTargetsRef and mouseTargetRef
      const trackingFingers = fingersRef.current;
      const handTargets = handTargetsRef.current;
      const mouseTarget = mouseTargetRef.current;
      // High-performance lerp factor for instant response and ultra-low latency tracking
      const lerpFactor = 0.45;

      // Slots 0 to 8: Hand tracking fingertips
      for (let i = 0; i < 9; i++) {
        const f = trackingFingers[i];
        f.radius = rippleRadiusRef.current;
        f.strength = rippleStrengthRef.current;
        const target = handTargets[i];

        if (target.active) {
          f.prevX = f.x;
          f.prevY = f.y;
          
          if (f.active < 0.05) {
            // First detection frame: initialize previous points to prevent initial huge injection streaks
            f.x = target.x;
            f.y = target.y;
            f.prevX = target.x;
            f.prevY = target.y;
          } else {
            f.x += (target.x - f.x) * lerpFactor;
            f.y += (target.y - f.y) * lerpFactor;
          }
          f.active = 1.0;
        } else {
          f.prevX = f.x;
          f.prevY = f.y;
          // Smoothly decay active state to sustain continuity through brief tracking dropouts
          f.active += (0.0 - f.active) * 0.18;
          if (f.active < 0.01) {
            f.active = 0.0;
          }
        }
      }

      // Slot 9: Mouse/Touch drag interaction (Only active if 仅限手势 (onlyHands) is false)
      const f9 = trackingFingers[9];
      f9.radius = rippleRadiusRef.current;
      f9.strength = rippleStrengthRef.current;
      
      const isMouseActive = mouseTarget.active && !onlyHandsRef.current;
      if (isMouseActive) {
        f9.prevX = f9.x;
        f9.prevY = f9.y;

        if (f9.active < 0.05) {
          f9.x = mouseTarget.x;
          f9.y = mouseTarget.y;
          f9.prevX = mouseTarget.x;
          f9.prevY = mouseTarget.y;
        } else {
          f9.x += (mouseTarget.x - f9.x) * lerpFactor;
          f9.y += (mouseTarget.y - f9.y) * lerpFactor;
        }
        f9.active = 1.0;
      } else {
        f9.prevX = f9.x;
        f9.prevY = f9.y;
        f9.active += (0.0 - f9.active) * 0.18;
        if (f9.active < 0.01) {
          f9.active = 0.0;
        }
      }

      // Track and dispatch active finger/pointer counts dynamically to the audio synthesizer
      let activeCalc = 0;
      for (let i = 0; i < 10; i++) {
        if (trackingFingers[i].active > 0.5) {
          activeCalc++;
        }
      }
      if (activeCalc !== activeCountRef.current) {
        activeCountRef.current = activeCalc;
        setActiveSynthCount(activeCalc);
      }

      // Unpack dynamic fingers vectors to float array buffers
      const uFingers = new Float32Array(20);
      const uPrevFingers = new Float32Array(20);
      const uFingerActive = new Float32Array(10);
      const uRadius = new Float32Array(10);
      const uStrength = new Float32Array(10);

      for (let i = 0; i < 10; i++) {
        const f = trackingFingers[i];
        uFingers[i * 2] = f.x;
        uFingers[i * 2 + 1] = f.y;
        
        uPrevFingers[i * 2] = f.prevX;
        uPrevFingers[i * 2 + 1] = f.prevY;
        
        uFingerActive[i] = f.active;
        uRadius[i] = f.radius;
        uStrength[i] = f.strength;
      }

      // STEP 1: PROPAGATION / WAVE SIMULATION STEP (Render into write ping-pong texture)
      gl.bindFramebuffer(gl.FRAMEBUFFER, pp.write.fbo);
      gl.viewport(0, 0, simWidth, simHeight);

      gl.useProgram(simProg);

      // Bind quad position attribute coordinates
      const aPosSim = gl.getAttribLocation(simProg, 'a_position');
      gl.enableVertexAttribArray(aPosSim);
      gl.bindBuffer(gl.ARRAY_BUFFER, vertexBufferRef.current);
      gl.vertexAttribPointer(aPosSim, 2, gl.FLOAT, false, 0, 0);

      // Feed previous status frame as active texture resource
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, pp.read.texture);
      gl.uniform1i(gl.getUniformLocation(simProg, 'u_prev_frame'), 0);

      // Setup simulation grid properties
      gl.uniform2f(gl.getUniformLocation(simProg, 'u_texel_size'), texelX, texelY);
      gl.uniform1f(gl.getUniformLocation(simProg, 'u_aspect'), aspect);

      // Load finger coordinates & strengths arrays
      gl.uniform2fv(gl.getUniformLocation(simProg, 'u_fingers'), uFingers);
      gl.uniform2fv(gl.getUniformLocation(simProg, 'u_prev_fingers'), uPrevFingers);
      gl.uniform1fv(gl.getUniformLocation(simProg, 'u_finger_active'), uFingerActive);
      gl.uniform1fv(gl.getUniformLocation(simProg, 'u_radius'), uRadius);
      gl.uniform1fv(gl.getUniformLocation(simProg, 'u_strength'), uStrength);

      // Setup wave equation non-linear damping parameters (dynamically controlled by user persistence/trail slider)
      const persistence = ripplePersistenceRef.current;
      const dSmall = 0.70 + 0.30 * persistence;
      const dLarge = 0.83 + 0.19 * persistence;
      const dScale = 8.0;

      gl.uniform1f(gl.getUniformLocation(simProg, 'u_damping_small'), dSmall);
      gl.uniform1f(gl.getUniformLocation(simProg, 'u_damping_large'), dLarge);
      gl.uniform1f(gl.getUniformLocation(simProg, 'u_damping_scale'), dScale);

      // Commit quad raster draw
      gl.drawArrays(gl.TRIANGLES, 0, 6);

      // Finalize propagation logic step & swap Ping-pong targets
      pp.swap();

      // STEP 2: PRESENTATION SCREEN-SPACE SHADING RENDER (With Refraction and High Contrast Specular Highlights)
      gl.bindFramebuffer(gl.FRAMEBUFFER, null); // Render in main system canvas buffer
      gl.viewport(0, 0, viewWidth, viewHeight);

      // 1. Update Camera background feed texture if active/ready (always keep camTex updated if camera active)
      if (video && video.readyState === video.HAVE_ENOUGH_DATA) {
        gl.bindTexture(gl.TEXTURE_2D, camTex);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
      }

      // 2. Update Background presets texture on demand
      const bgTex = bgTexRef.current;
      if (bgTex && activeBgImageRef.current && textureNeedsUploadRef.current) {
        gl.bindTexture(gl.TEXTURE_2D, bgTex);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, activeBgImageRef.current);
        textureNeedsUploadRef.current = false;
      }

      gl.useProgram(rendProg);

      const aPosRend = gl.getAttribLocation(rendProg, 'a_position');
      gl.enableVertexAttribArray(aPosRend);
      gl.bindBuffer(gl.ARRAY_BUFFER, vertexBufferRef.current);
      gl.vertexAttribPointer(aPosRend, 2, gl.FLOAT, false, 0, 0);

      // Bind WebGL Multi-Texture unit slots:
      // Texture 0: Camera background feed
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, camTex);
      gl.uniform1i(gl.getUniformLocation(rendProg, 'u_camera_tex'), 0);

      // Texture 1: Newly propagated heightmaps simulation texture A
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, pp.read.texture);
      gl.uniform1i(gl.getUniformLocation(rendProg, 'u_water_tex'), 1);

      // Texture 2: Background image preset / custom image
      if (bgTex) {
        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D, bgTex);
        gl.uniform1i(gl.getUniformLocation(rendProg, 'u_bg_tex'), 2);
      }

      // Map rendering presentation uniforms
      gl.uniform2f(gl.getUniformLocation(rendProg, 'u_texel_size'), texelX, texelY);
      gl.uniform1f(gl.getUniformLocation(rendProg, 'u_aspect'), aspect);
      gl.uniform1f(gl.getUniformLocation(rendProg, 'u_is_front'), facingMode === 'user' ? 1.0 : 0.0);
      gl.uniform1f(gl.getUniformLocation(rendProg, 'u_camera_mix'), cameraActive ? cameraMixRef.current : 0.0);
      gl.uniform1f(gl.getUniformLocation(rendProg, 'u_bg_mix'), bgMixRef.current);
      gl.uniform1f(gl.getUniformLocation(rendProg, 'u_blend_mode'), blendModeRef.current);

      // Commit screen-space present render
      gl.drawArrays(gl.TRIANGLES, 0, 6);

      animFrameId = requestAnimationFrame(renderLoop);
    };

    animFrameId = requestAnimationFrame(renderLoop);

    return () => {
      cancelAnimationFrame(animFrameId);
    };
  }, [facingMode]);

  // 5. INTERACTION DRAG FALLBACK (MOUSE & MOUSE DRAGGING ACTIONS)
  const mapScreenToGL = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0.5, y: 0.5 };
    const rect = canvas.getBoundingClientRect();
    
    // Normalize coordinates strictly within [0.0, 1.0] viewport bounds
    const x = (clientX - rect.left) / rect.width;
    const y = 1.0 - (clientY - rect.top) / rect.height; // Invert matches WebGL coords
    return { x: Math.max(0.0, Math.min(1.0, x)), y: Math.max(0.0, Math.min(1.0, y)) };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const { x, y } = mapScreenToGL(e.clientX, e.clientY);
    const mouseTarget = mouseTargetRef.current;
    mouseTarget.active = true;
    mouseTarget.x = x;
    mouseTarget.y = y;
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const mouseTarget = mouseTargetRef.current;
    if (!mouseTarget.active) return;
    const { x, y } = mapScreenToGL(e.clientX, e.clientY);
    mouseTarget.x = x;
    mouseTarget.y = y;
  };

  const handlePointerUpOrLeave = () => {
    const mouseTarget = mouseTargetRef.current;
    mouseTarget.active = false;
  };

  const handleRadiusChange = (val: number) => {
    setRippleRadius(val);
    rippleRadiusRef.current = val;
  };

  const handleStrengthChange = (val: number) => {
    setRippleStrength(val);
    rippleStrengthRef.current = val;
  };

  const handlePersistenceChange = (val: number) => {
    setRipplePersistence(val);
    ripplePersistenceRef.current = val;
  };

  const handleCameraMixChange = (val: number) => {
    setCameraMix(val);
    cameraMixRef.current = val;
  };

  const handleBgMixChange = (val: number) => {
    setBgMix(val);
    bgMixRef.current = val;
  };

  const handleBlendModeChange = (val: number) => {
    setBlendMode(val);
    blendModeRef.current = val;
  };

  const handleOnlyHandsChange = (val: boolean) => {
    setOnlyHands(val);
    onlyHandsRef.current = val;
  };

  const clearShaderError = () => {
    setShaderError(null);
  };

  const handleRecompile = () => {
    const gl = glRef.current;
    if (!gl) return;
    try {
      setShaderError(null);
      simProgramRef.current = createProgram(gl, VERTEX_SHADER, SIMULATION_FRAGMENT_SHADER);
      renderProgramRef.current = createProgram(gl, VERTEX_SHADER, RENDERING_FRAGMENT_SHADER);
    } catch (err: any) {
      setShaderError(err?.message || String(err));
    }
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-zinc-950 flex flex-col justify-between select-none">
      
      {/* 1. Fullscreen Primary Render Stage */}
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUpOrLeave}
        onPointerLeave={handlePointerUpOrLeave}
        className="absolute inset-0 w-full h-full cursor-pointer z-10 touch-none block"
      />

      {/* 2. Sleek Translucent HUD (Top & Side Details) */}
      <div className="absolute top-4 left-4 z-40 p-4 rounded-2xl bg-zinc-950/30 border border-zinc-900/30 backdrop-blur-md flex flex-col gap-2 max-w-xs shadow-lg pointer-events-none select-none">
        <div className="flex items-center gap-2">
          <Hand className={`w-4 h-4 ${handsCount > 0 ? 'text-emerald-400 animate-pulse' : 'text-zinc-500'}`} />
          <span className="font-sans text-xs font-bold text-zinc-100 tracking-wide uppercase">
            Active Fingers: <span className={handsCount > 0 ? 'text-emerald-400' : 'text-zinc-400'}>{handsCount > 0 ? (handsCount * 5) : 0}</span>
          </span>
        </div>
        
        <div className="flex items-center gap-2 border-t border-zinc-850/50 pt-2 text-[10px] font-mono text-zinc-400 leading-none">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping-slow" />
          <span>GPU WebGL Accelerated</span>
        </div>
        
        <div className="text-[9px] font-mono text-zinc-500 leading-tight">
          Device Feed: {cameraLabel}
        </div>
      </div>

      {/* 2.5 Collapsible Water Parameters Tuning Card (Fully satisfies user requests) */}
      {isFullyLoaded && cameraActive && !shaderError && (
        <div className="absolute top-36 left-4 z-40 w-full max-w-[280px] pointer-events-auto">
          {!paramsExpanded ? (
            <button
              onClick={() => setParamsExpanded(true)}
              className="flex items-center gap-2 px-4 py-2 bg-zinc-950/40 hover:bg-zinc-950/65 border border-zinc-800/80 backdrop-blur-md rounded-full shadow-lg text-white hover:text-emerald-400 transition-all cursor-pointer select-none active:scale-95 text-xs font-semibold"
            >
              <Settings2 className="w-3.5 h-3.5 text-zinc-300" />
              <span>水波参数调节</span>
              <ChevronDown className="w-3.5 h-3.5 text-zinc-400" />
            </button>
          ) : (
            <div className="p-4 rounded-2xl bg-zinc-950/55 border border-zinc-900/70 backdrop-blur-xl flex flex-col gap-3.5 shadow-2xl animate-fade-in text-zinc-200">
              <div className="flex items-center justify-between border-b border-zinc-805/40 pb-2">
                <span className="font-sans text-xs font-bold tracking-wide uppercase text-zinc-100 flex items-center gap-1.5 leading-none">
                  <Sliders className="w-3.5 h-3.5 text-emerald-400" />
                  水波参数调节
                </span>
                <button
                  onClick={() => setParamsExpanded(false)}
                  className="p-1 hover:bg-zinc-800/40 text-zinc-400 hover:text-zinc-200 rounded-lg cursor-pointer transition-colors"
                  title="收起参数调节"
                >
                  <ChevronUp className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Slider 1: Ripple Radius Control */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between text-[11px] text-zinc-450 font-sans">
                  <span>波及范围 (粗细)</span>
                  <span className="font-mono text-zinc-300">{Math.round((rippleRadius - 0.015) / 0.045 * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0.015"
                  max="0.060"
                  step="0.001"
                  value={rippleRadius}
                  onChange={(e) => handleRadiusChange(parseFloat(e.target.value))}
                  className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-emerald-400 focus:outline-none"
                />
              </div>

              {/* Slider 2: Ripple Strength Control */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between text-[11px] text-zinc-450 font-sans">
                  <span>波纹深浅 (强度)</span>
                  <span className="font-mono text-zinc-300">{Math.round((rippleStrength - 0.04) / 0.31 * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0.04"
                  max="0.35"
                  step="0.01"
                  value={rippleStrength}
                  onChange={(e) => handleStrengthChange(parseFloat(e.target.value))}
                  className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-emerald-400 focus:outline-none"
                />
              </div>

              {/* Slider 3: Ripple Persistence/Trail Duration */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between text-[11px] text-zinc-450 font-sans">
                  <span>拖尾时间 (延迟)</span>
                  <span className="font-mono text-zinc-300">{Math.round((ripplePersistence - 0.1) / 0.86 * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0.10"
                  max="0.96"
                  step="0.01"
                  value={ripplePersistence}
                  onChange={(e) => handlePersistenceChange(parseFloat(e.target.value))}
                  className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-emerald-400 focus:outline-none"
                />
              </div>

              {/* 🖼️ Premium Eye-Safe Background Preset & Custom Switcher */}
              <div className="flex flex-col gap-2 pt-2 border-t border-zinc-900/60">
                <div className="flex items-center justify-between text-[11px] text-zinc-400 font-sans">
                  <span className="font-semibold text-zinc-350">背景图像</span>
                </div>
                
                <div className="flex flex-col gap-1.5">
                  {bgType === 'custom' ? (
                    <button
                      onClick={() => setBgType('default')}
                      className="w-full px-2 py-1.5 text-[10px] bg-zinc-900/40 hover:bg-zinc-800/40 border border-zinc-800/50 text-emerald-400 rounded-lg cursor-pointer flex items-center justify-center gap-1 font-sans transition-colors"
                    >
                      <span>✨ 恢复默认全息星云</span>
                    </button>
                  ) : null}

                  {/* Custom Background Image uploader */}
                  <label
                    className={`px-2 py-1.5 text-[10px] font-sans text-left transition-all border rounded-lg cursor-pointer flex items-center justify-between group ${
                      bgType === 'custom'
                        ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-400 font-medium'
                        : 'bg-zinc-900/30 border-zinc-850/40 text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    <span className="truncate flex items-center gap-1">
                      📁 {customBgUrl ? '已载入自定义背景图' : '点击选择本地图片上传...'}
                    </span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const reader = new FileReader();
                          reader.onload = (event) => {
                            if (event.target?.result) {
                              setCustomBgUrl(event.target.result as string);
                              setBgType('custom');
                            }
                          };
                          reader.readAsDataURL(file);
                        }
                      }}
                    />
                    {bgType === 'custom' && <div className="w-1 h-1 rounded-full bg-emerald-400 shrink-0 ml-1 font-sans" />}
                  </label>
                </div>
              </div>

              {/* ⚡ Human-centric Coexistence Mode Selection panel */}
              <div className="flex flex-col gap-2 pt-2.5 border-t border-zinc-900/60">
                <div className="flex items-center justify-between text-[11px] text-zinc-400 font-sans">
                  <span className="font-semibold text-zinc-350">并存融合模式</span>
                </div>
                
                <div className="grid grid-cols-2 gap-1.5">
                  {[
                    { id: 1, name: '双曝光 (Screen)', desc: '高亮发光并存(推荐)' },
                    { id: 0, name: '柔和半透 (Mix)', desc: '经典半透明遮罩' },
                    { id: 3, name: '戏剧柔光 (Soft)', desc: '艺术反差叠加' },
                    { id: 2, name: '重叠暗色 (Mult)', desc: '暗色遮罩融合' }
                  ].map((item) => {
                    const isSel = blendMode === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleBlendModeChange(item.id)}
                        className={`px-1.5 py-1 text-[9px] font-sans text-left transition-all border rounded-md cursor-pointer flex flex-col ${
                          isSel
                            ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-400'
                            : 'bg-zinc-900/20 border-zinc-850/30 text-zinc-450 hover:text-zinc-200 hover:border-zinc-800'
                        }`}
                      >
                        <span className="font-medium truncate">{item.name}</span>
                        <span className="text-[7.5px] opacity-70 leading-none mt-0.5 scale-95 origin-left truncate">{item.desc}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Slider: Background Image Depth/Mix Strength */}
              <div className="flex flex-col gap-1.5 pt-2.5 border-t border-zinc-900/60">
                <div className="flex items-center justify-between text-[11px] text-zinc-400 font-sans">
                  <span className="font-semibold text-zinc-350">背景深浅度</span>
                  <span className="font-mono text-zinc-300">{Math.round(bgMix * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0.00"
                  max="1.00"
                  step="0.01"
                  value={bgMix}
                  onChange={(e) => handleBgMixChange(parseFloat(e.target.value))}
                  className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-emerald-400 focus:outline-none"
                />
                <div className="text-[9px] text-zinc-500 leading-normal">
                  控制背景色调强浅。设置为 0% 时仅保留纯暗色
                </div>
              </div>

              {/* Slider: Camera Image Depth/Mix Strength */}
              <div className="flex flex-col gap-1.5 pt-2.5 border-t border-zinc-900/60">
                <div className="flex items-center justify-between text-[11px] text-zinc-400 font-sans">
                  <span className="font-semibold text-zinc-350">摄像头画面深浅度</span>
                  <span className="font-mono text-zinc-300">{Math.round(cameraMix * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0.00"
                  max="1.00"
                  step="0.01"
                  value={cameraMix}
                  onChange={(e) => handleCameraMixChange(parseFloat(e.target.value))}
                  className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-emerald-400 focus:outline-none"
                />
                <div className="text-[9px] text-zinc-500 leading-normal">
                  控制摄像头实况融合深浅。设置为 0% 时仅保留背景
                </div>
              </div>

              {/* Toggle 3: STRICT GESTURES ONLY */}
              <label className="flex items-start gap-2 pt-2 border-t border-zinc-900/60 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={onlyHands}
                  onChange={(e) => handleOnlyHandsChange(e.target.checked)}
                  className="mt-0.5 rounded border-zinc-850 bg-zinc-900 text-emerald-500 focus:ring-emerald-400 focus:ring-offset-zinc-950 h-3.5 w-3.5 cursor-pointer accent-emerald-500"
                />
                <div className="flex flex-col select-none">
                  <span className="font-sans text-[11px] font-semibold text-zinc-300 group-hover:text-zinc-100 transition-colors">
                    仅限摄像头手势控制
                  </span>
                  <span className="text-[9px] text-zinc-500 leading-normal">
                    开启后将禁用屏幕鼠标/触屏，身体其他部位不会在画面内产生任何干扰波纹
                  </span>
                </div>
              </label>
            </div>
          )}
        </div>
      )}

      {/* 3. Initial Spin/Loading Overlay Panel */}
      {(!isFullyLoaded || !cameraActive) && !shaderError && !mediaError && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center p-6 bg-zinc-950">
          <div className="flex flex-col items-center gap-6 max-w-sm text-center">
            <div className="relative">
              <div className="w-14 h-14 border-4 border-zinc-800 border-t-emerald-400 rounded-full animate-spin" />
              <Hand className="w-6 h-6 text-zinc-300 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
            </div>
            
            <div className="space-y-2">
              <h1 className="font-sans text-lg font-bold text-zinc-100 tracking-wide">
                Water Ripple Refractor
              </h1>
              <p className="font-sans text-xs text-zinc-400 leading-normal">
                {loadingStatus}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 4. Non-fatal System-wide Media / Permission Alert Modal */}
      {mediaError && (
        <div className="absolute inset-0 z-50 flex items-center justify-center p-6 bg-zinc-950/90 backdrop-blur-md">
          <div className="w-full max-w-md p-6 bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl flex flex-col gap-4 text-center">
            <div className="mx-auto w-12 h-12 bg-amber-500/10 border border-amber-500/30 text-amber-500 rounded-full flex items-center justify-center">
              <Info className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h3 className="font-sans text-base font-bold text-zinc-100">Camera Permission Required</h3>
              <p className="font-sans text-xs text-zinc-400 leading-relaxed">
                This physical liquid simulation requires active camera privileges as background texture. Please grant permission or enable your computer camera to resolve.
              </p>
            </div>
            <p className="p-3 bg-zinc-950 border border-zinc-850 rounded-xl font-mono text-[10px] text-zinc-400 leading-normal text-left overflow-x-auto whitespace-pre-wrap">
              {mediaError}
            </p>
            <button
              onClick={() => {
                setMediaError(null);
                // Trigger fallback straight to mouse interactions immediately
                setIsFullyLoaded(true);
                setCameraActive(true);
              }}
              className="w-full py-2.5 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-sans text-xs font-bold rounded-xl transition-colors cursor-pointer"
            >
              Skip Camera (Interact with Mouse or Touch)
            </button>
          </div>
        </div>
      )}

      {/* 5. Floating Interactive Desktop Overlay Tip */}
      {isFullyLoaded && cameraActive && !shaderError && (
        <div id="mouse-fallback-tip" className="absolute top-20 left-4 z-40 bg-zinc-950/20 backdrop-blur-md border border-zinc-900/30 p-2 px-3 rounded-full flex items-center gap-1.5 shadow text-zinc-400 max-w-xs pointer-events-none select-none text-[10px] font-sans">
          <MousePointer className="w-3.5 h-3.5 text-zinc-300" />
          <span>Tap/Drag or wave hands to create circular waves</span>
        </div>
      )}

      {/* 6. Active Shader Compile Fail Warnings (Interactive) */}
      {shaderError && (
        <ShaderErrorDisplay
          error={shaderError}
          onClear={clearShaderError}
          onRetry={handleRecompile}
        />
      )}

      {/* 7. Camera facing direction selectors (Top-Right) */}
      {isFullyLoaded && cameraActive && !shaderError && (
        <CameraSelector
          facingMode={facingMode}
          onToggle={toggleCamera}
          availableDevicesCount={devicesCount}
        />
      )}

      {/* 9. Serene Interactive Soundscape player & background music toggle */}
      {isFullyLoaded && cameraActive && !shaderError && (
        <AudioPanel activeInteractionCount={activeSynthCount} />
      )}

    </div>
  );
}
