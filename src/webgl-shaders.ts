/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export const VERTEX_SHADER = `
  attribute vec2 a_position;
  varying vec2 v_uv;
  void main() {
    v_uv = a_position * 0.5 + 0.5;
    gl_Position = vec4(a_position, 0.0, 1.0);
  }
`;

export const SIMULATION_FRAGMENT_SHADER = `
  precision highp float;
  varying vec2 v_uv;
  
  uniform sampler2D u_prev_frame;
  uniform vec2 u_texel_size;
  uniform float u_aspect;
  
  // Hand tracking uniforms (10 fingers)
  uniform vec2 u_fingers[10];
  uniform vec2 u_prev_fingers[10];
  uniform float u_finger_active[10];
  uniform float u_radius[10];
  uniform float u_strength[10];
  
  // Damping bounds for non-linear attenuation
  uniform float u_damping_small;  // Surface tension (smaller amplitude, faster decay)
  uniform float u_damping_large;  // Inertia (larger amplitude, slower decay)
  uniform float u_damping_scale;  // Scales the wave amplitude influence
  
  void main() {
    // 9-tap isotropic discrete stencil neighborhood
    vec2 dx = vec2(u_texel_size.x, 0.0);
    vec2 dy = vec2(0.0, u_texel_size.y);
    
    float center = texture2D(u_prev_frame, v_uv).r;
    float left   = texture2D(u_prev_frame, v_uv - dx).r;
    float right  = texture2D(u_prev_frame, v_uv + dx).r;
    float bottom = texture2D(u_prev_frame, v_uv - dy).r;
    float top    = texture2D(u_prev_frame, v_uv + dy).r;
    
    float tl = texture2D(u_prev_frame, v_uv - dx + dy).r;
    float tr = texture2D(u_prev_frame, v_uv + dx + dy).r;
    float bl = texture2D(u_prev_frame, v_uv - dx - dy).r;
    float br = texture2D(u_prev_frame, v_uv + dx - dy).r;
    
    // Wave equation propagation: discrete Laplacian with 9-tap isotropic weights (4/20 cross, 1/20 diagonal)
    // weights sum to 1
    float avg = (4.0 * (left + right + bottom + top) + (tl + tr + bl + br)) / 20.0;
    
    // Retrieve previous height (stored in green channel)
    float previous = texture2D(u_prev_frame, v_uv).g;
    
    // Discrete wave update: next = 2 * average - previous
    float next_height = avg * 2.0 - previous;
    
    // Non-linear damping: small amplitudes decay faster (surface tension) while large amplitudes persist longer (inertia)
    float wave_amp = abs(next_height);
    float damping_t = clamp(wave_amp * u_damping_scale, 0.0, 1.0);
    float damping = mix(u_damping_small, u_damping_large, damping_t);
    next_height *= damping;
    
    // Aspect-ratio-corrected Capsule SDF interaction for fingers
    vec2 aspect_scale = vec2(u_aspect, 1.0);
    vec2 p = v_uv * aspect_scale;
    
    for (int i = 0; i < 10; ++i) {
      vec2 a = u_prev_fingers[i] * aspect_scale;
      vec2 b = u_fingers[i] * aspect_scale;
      
      vec2 pa = p - a;
      vec2 ba = b - a;
      
      float ba_len_sq = dot(ba, ba);
      float is_moving = step(0.000001, ba_len_sq);
      float h = clamp(dot(pa, ba) / max(ba_len_sq, 0.000001), 0.0, 1.0) * is_moving;
      float d = length(pa - ba * h);
      
      float rad = u_radius[i];
      // Wave pressure injection modeling smooth, organic rounded ripples (smooth cosine bell curve)
      float speed = length(ba);
      float speed_multiplier = 0.15 + clamp(speed * 45.0, 0.0, 1.5);
      
      float dist_factor = clamp(d / max(rad, 0.00001), 0.0, 1.0);
      float smooth_profile = 0.5 + 0.5 * cos(dist_factor * 3.14159265);
      float inject = smooth_profile * u_strength[i] * speed_multiplier * u_finger_active[i];
      next_height += inject;
    }
    
    next_height = clamp(next_height, -1.0, 1.0);
    
    // Pack current and previous values: R = next height, G = center (current height becomes previous in next frame cycle)
    gl_FragColor = vec4(next_height, center, 0.0, 1.0);
  }
`;

export const RENDERING_FRAGMENT_SHADER = `
  precision highp float;
  varying vec2 v_uv;
  
  uniform sampler2D u_camera_tex;
  uniform sampler2D u_water_tex;
  uniform vec2 u_texel_size;
  uniform float u_aspect;
  uniform float u_is_front; // 1.0 if front camera reflection active, 0.0 otherwise
  
  void main() {
    float height = texture2D(u_water_tex, v_uv).r;
    
    float h_l = texture2D(u_water_tex, v_uv - vec2(u_texel_size.x, 0.0)).r;
    float h_r = texture2D(u_water_tex, v_uv + vec2(u_texel_size.x, 0.0)).r;
    float h_b = texture2D(u_water_tex, v_uv - vec2(0.0, u_texel_size.y)).r;
    float h_t = texture2D(u_water_tex, v_uv + vec2(0.0, u_texel_size.y)).r;
    
    // Compute gradient (grad) driving refraction offset (unnormalized)
    vec2 grad = vec2(h_r - h_l, h_t - h_b);
    
    // Beautiful pure Liquid Glass rendering parameters optimized for high transparency and realism
    float refraction_str = 0.22;
    float lens_str       = 0.28;
    float dispersion     = 0.016;
    float normal_fact    = 4.5;
    float spec_sharp     = 5.0;
    float spec_broad     = 0.08; // Extremely low broad sheen to avoid hazy or milky white overlay
    float spec_rough_sh  = 180.0;
    float spec_rough_br  = 8.0;
    
    // Scale expansion of magnifying lens under wave peaks using Discrete Laplacian curvature
    float L = h_l + h_r + h_b + h_t - 4.0 * height;
    
    // Refraction UV displacement incorporating the lens curvature item
    vec2 total_offset = grad * (refraction_str - L * lens_str);
    
    // Mirror alignment logic if camera facing direction is front/user
    float is_front_cam = step(0.5, u_is_front);
    vec2 base_uv = vec2(mix(v_uv.x, 1.0 - v_uv.x, is_front_cam), v_uv.y);
    
    // Negate horizontal offsets in refraction matching relative camera mirror geometry
    float x_dir = mix(1.0, -1.0, is_front_cam);
    vec2 offset_r = total_offset * (1.0 - dispersion);
    vec2 offset_g = total_offset;
    vec2 offset_b = total_offset * (1.0 + dispersion);
    
    offset_r.x *= x_dir;
    offset_g.x *= x_dir;
    offset_b.x *= x_dir;
    
    vec2 uv_r = clamp(base_uv + offset_r, 0.001, 0.999);
    vec2 uv_g = clamp(base_uv + offset_g, 0.001, 0.999);
    vec2 uv_b = clamp(base_uv + offset_b, 0.001, 0.999);
    
    // Sample RGB chromatic dispersion
    vec3 base_col = vec3(
      texture2D(u_camera_tex, uv_r).r,
      texture2D(u_camera_tex, uv_g).g,
      texture2D(u_camera_tex, uv_b).b
    );
    
    // Wave Depth shading (Neutral colorless shading: Crests of waves bright, Troughs dark)
    float height_blend = clamp(height * 0.75 + 0.5, 0.0, 1.0);
    vec3 crest_color = vec3(1.0) * (1.0 + max(0.0, height) * 0.01);
    vec3 trough_color = vec3(1.0) * (1.0 - abs(min(0.0, height)) * 0.08); // Accentuate refractive shadows
    vec3 base_shading = mix(trough_color, crest_color, height_blend);
    
    vec3 shaded_camera = base_col * base_shading;
    
    // Schlick's approximation for water Fresnel Reflections (Normal incidence R0 = 0.02)
    vec3 N = normalize(vec3(-grad.x * normal_fact, -grad.y * normal_fact, 1.0));
    vec3 V = vec3(0.0, 0.0, 1.0);
    float cos_theta = clamp(dot(N, V), 0.0, 1.0);
    
    float R0 = 0.02;
    float F = R0 + (1.0 - R0) * pow(1.0 - cos_theta, 5.0);
    
    // Surface ambient reflection is tuned extremely low to guarantee perfect colorless glass transparency
    vec3 env_reflection_col = vec3(1.0) * 1.15;
    vec3 final_color = mix(shaded_camera, env_reflection_col, F * 0.12);
    
    // Dual-Lobe Specular reflection: High intensity sharp specular + soft outer broad sheen
    vec3 L_dir = normalize(vec3(0.28, 0.42, 0.86));
    vec3 R_vec = reflect(-L_dir, N);
    float spec_intensity = max(dot(R_vec, V), 0.0);
    
    float spec_sharp_lobe = pow(spec_intensity, spec_rough_sh) * spec_sharp;
    float spec_broad_lobe = pow(spec_intensity, spec_rough_br) * spec_broad;
    
    vec3 highlight = vec3(1.0) * (spec_sharp_lobe + spec_broad_lobe);
    
    // Combine refraction and reflection with specular sheen
    final_color += highlight;
    
    gl_FragColor = vec4(final_color, 1.0);
  }
`;
