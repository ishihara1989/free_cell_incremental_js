/** Godot の Color と同じ計算（0〜1 の RGBA）を行う小さな色ユーティリティ */
export interface Color {
  r: number;
  g: number;
  b: number;
  a: number;
}

export function rgba(r: number, g: number, b: number, a = 1): Color {
  return { r, g, b, a };
}

export function darkened(color: Color, amount: number): Color {
  return { r: color.r * (1 - amount), g: color.g * (1 - amount), b: color.b * (1 - amount), a: color.a };
}

export function lightened(color: Color, amount: number): Color {
  return {
    r: color.r + (1 - color.r) * amount,
    g: color.g + (1 - color.g) * amount,
    b: color.b + (1 - color.b) * amount,
    a: color.a,
  };
}

export function lerpColor(from: Color, to: Color, weight: number): Color {
  return {
    r: from.r + (to.r - from.r) * weight,
    g: from.g + (to.g - from.g) * weight,
    b: from.b + (to.b - from.b) * weight,
    a: from.a + (to.a - from.a) * weight,
  };
}

export function withAlpha(color: Color, alpha: number): Color {
  return { ...color, a: alpha };
}

export function css(color: Color): string {
  const channel = (value: number) => Math.round(Math.min(1, Math.max(0, value)) * 255);
  return `rgba(${channel(color.r)},${channel(color.g)},${channel(color.b)},${Math.round(color.a * 1000) / 1000})`;
}
