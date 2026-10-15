/**
 * 巨大な整数を 10 進数文字列として扱うユーティリティ。
 * セーブデータ互換のため値は文字列で保持し、演算は BigInt で行う。
 */
export type IntegerLike = string | number | bigint | null | undefined;

export function normalize(value: IntegerLike): string {
  if (typeof value === "string") {
    const digits = value.replace(/[^0-9]/g, "");
    return digits.length === 0 ? "0" : trimLeadingZeroes(digits);
  }
  if (typeof value === "bigint") {
    return value < 0n ? "0" : value.toString();
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return BigInt(Math.max(0, Math.trunc(value))).toString();
  }
  return "0";
}

function toBigInt(value: IntegerLike): bigint {
  return BigInt(normalize(value));
}

export function formatInteger(value: IntegerLike): string {
  return normalize(value).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** 7 桁以上は 1.23e6 のような指数表記にする */
export function formatIconCost(value: IntegerLike): string {
  const digits = normalize(value);
  if (digits.length <= 6) {
    return formatInteger(digits);
  }

  let exponent = digits.length - 1;
  const roundedDigits = digits.slice(0, 4).padEnd(4, "0");
  let mantissa = Number(roundedDigits.slice(0, 3));
  if (Number(roundedDigits[3]) >= 5) {
    mantissa += 1;
    if (mantissa >= 1000) {
      mantissa = 100;
      exponent += 1;
    }
  }
  return `${Math.floor(mantissa / 100)}.${String(mantissa % 100).padStart(2, "0")}e${exponent}`;
}

export function makeFromLog10(valueLog10: number): string {
  if (valueLog10 <= 0) {
    return "1";
  }

  const digitCount = Math.floor(valueLog10) + 1;
  if (digitCount <= 18) {
    return normalize(BigInt(Math.floor(10 ** valueLog10 + 0.000000001)));
  }

  const leadingDigitCount = 15;
  const fractionalPart = valueLog10 - Math.floor(valueLog10);
  const leadingValue = Math.floor(10 ** (fractionalPart + (leadingDigitCount - 1)));
  const leadingText = String(leadingValue).padStart(leadingDigitCount, "0");
  return trimLeadingZeroes(leadingText + "0".repeat(Math.max(0, digitCount - leadingDigitCount)));
}

export function getLog10(value: IntegerLike): number {
  const digits = normalize(value);
  if (digits === "0") {
    return -Infinity;
  }
  const leadingLength = Math.min(15, digits.length);
  const leadingValue = Number(digits.slice(0, leadingLength));
  return digits.length - leadingLength + Math.log(leadingValue) / Math.log(10);
}

export function canAfford(cost: IntegerLike, points: IntegerLike): boolean {
  return compare(points, cost) >= 0;
}

export function costToInt(cost: IntegerLike): number {
  return Number(normalize(cost));
}

export function add(left: IntegerLike, right: IntegerLike): string {
  return (toBigInt(left) + toBigInt(right)).toString();
}

/** 結果が負になる場合は "0" を返す */
export function subtract(left: IntegerLike, right: IntegerLike): string {
  const result = toBigInt(left) - toBigInt(right);
  return result <= 0n ? "0" : result.toString();
}

export function compare(left: IntegerLike, right: IntegerLike): number {
  const a = toBigInt(left);
  const b = toBigInt(right);
  return a < b ? -1 : a > b ? 1 : 0;
}

export function multiplyByInt(value: IntegerLike, multiplier: number): string {
  if (multiplier <= 0) {
    return "0";
  }
  return (toBigInt(value) * BigInt(Math.trunc(multiplier))).toString();
}

export function trimLeadingZeroes(text: string): string {
  const trimmed = text.replace(/^0+/, "");
  return trimmed.length === 0 ? "0" : trimmed;
}
