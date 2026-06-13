/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Finger {
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  active: number; // 1.0 for active, 0.0 for inactive
  radius: number;
  strength: number;
}

export type AppMode = 'liquid' | 'crystal';

export interface CameraConfig {
  facingMode: 'user' | 'environment';
  deviceId?: string;
}
