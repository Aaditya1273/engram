/**
 * Pure hand-tracking math used by the headset input layer (src/headset/input.ts).
 * Kept free of three.js and WebXR so it can be unit-tested with synthetic joint data.
 */

export interface V3 {
  x: number;
  y: number;
  z: number;
}

/** A pinch whose hand travels this far sideways is a flick, not a select. */
export const FLICK_M = 0.07;
/** Pinches held longer than this are always selects (the hand drifted, it wasn't a swipe). */
export const FLICK_MAX_MS = 800;
/** Hands unseen for longer than this pause the session. */
export const HANDS_LOST_MS = 2000;
/** Wrist travel is divided by this so a ~15 cm movement ≈ 1 unit, the same scale as the pointer path. */
export const WRIST_SCALE = 0.15;
/** Finger curl matters less than where the hand goes; it also carries more tracking jitter. */
export const CURL_WEIGHT = 0.4;

const dot = (a: V3, b: V3) => a.x * b.x + a.y * b.y + a.z * b.z;

/**
 * What a pinch release means. `right` is the head's right vector in world space, so a flick is
 * judged relative to where the user is looking, not to the room.
 * Swipe semantics: moving the hand left brings what's on the right into view (+1).
 */
export function pinchAction(start: V3 | null, end: V3 | null | undefined, heldMs: number, right: V3): 'select' | 1 | -1 {
  if (!start || !end || heldMs >= FLICK_MAX_MS) return 'select';
  const dx = dot({ x: end.x - start.x, y: end.y - start.y, z: end.z - start.z }, right);
  if (Math.abs(dx) <= FLICK_M) return 'select';
  return dx < 0 ? 1 : -1;
}

/** Wrist travel since `origin`, rotated into the head's yaw frame at capture start and scaled. */
export function wristInYawFrame(wrist: V3, origin: V3, yaw: number): [number, number, number] {
  const dx = wrist.x - origin.x, dy = wrist.y - origin.y, dz = wrist.z - origin.z;
  // Rotation by -yaw about +Y (same as THREE.Quaternion.setFromAxisAngle(Y, -yaw)).
  const c = Math.cos(-yaw), s = Math.sin(-yaw);
  return [(dx * c + dz * s) / WRIST_SCALE, dy / WRIST_SCALE, (-dx * s + dz * c) / WRIST_SCALE];
}

/** Five fingertip-to-wrist distances normalised by hand size, down-weighted. Missing tips read 0. */
export function fingerCurls(wrist: V3, tips: (V3 | null)[], handSize: number): number[] {
  const size = Math.max(0.03, handSize);
  return tips.map((p) => (p ? (Math.hypot(p.x - wrist.x, p.y - wrist.y, p.z - wrist.z) / size) * CURL_WEIGHT : 0));
}

export const handsLost = (nowMs: number, lastSeenMs: number) => nowMs - lastSeenMs > HANDS_LOST_MS;
