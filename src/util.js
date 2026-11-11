import { Color, Matrix4, Quaternion, SRGBColorSpace, Vector3 } from "three";

/** Cor em sRGB (como o `Color::srgb` do original); componentes > 1 continuam valendo. */
export const srgb = (r, g, b) => new Color().setRGB(r, g, b, SRGBColorSpace);

const AXIS_X = new Vector3(1, 0, 0);
const AXIS_Y = new Vector3(0, 1, 0);
const AXIS_Z = new Vector3(0, 0, 1);
export const qx = (a) => new Quaternion().setFromAxisAngle(AXIS_X, a);
export const qy = (a) => new Quaternion().setFromAxisAngle(AXIS_Y, a);
export const qz = (a) => new Quaternion().setFromAxisAngle(AXIS_Z, a);

const NO_ROTATION = new Quaternion();

/** Matriz posição → rotação → escala; `s` é número (uniforme) ou [x, y, z]. */
export function tf(x, y, z, q = NO_ROTATION, s = 1) {
  const scale = typeof s === "number" ? new Vector3(s, s, s) : new Vector3(...s);
  return new Matrix4().compose(new Vector3(x, y, z), q, scale);
}

export const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
