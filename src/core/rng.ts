/** 盤面生成に使う乱数。テストでは seed を与えて再現性を持たせる。 */
export interface Rng {
  /** from 以上 to 以下の整数 */
  randiRange(from: number, to: number): number;
}

export function createRng(seed?: number): Rng {
  if (seed === undefined) {
    return {
      randiRange(from, to) {
        return from + Math.floor(Math.random() * (to - from + 1));
      },
    };
  }

  // mulberry32
  let state = seed >>> 0;
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    randiRange(from, to) {
      return from + Math.floor(next() * (to - from + 1));
    },
  };
}
