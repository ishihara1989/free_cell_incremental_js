/**
 * セーブデータの永続化。ブラウザでは localStorage に JSON で保存する。
 * Godot 版の save.cfg（ConfigFile 形式）の取り込みにも対応する。
 */
export const SAVE_STORAGE_KEY = "free_cell_incremental.save.v1";
export const SAVE_FORMAT_ID = "free-cell-incremental";
export const SAVE_FORMAT_VERSION = 1;

export interface SaveData {
  current_points: string;
  rebirth_points: number;
  rebirth_count: number;
  purchased_upgrades: string[];
  purchased_rebirth_upgrades: string[];
  total_clears: number;
  total_upgrade_purchases: number;
  unlocked_achievements: string[];
  auto_complete_enabled: boolean;
  selected_settings: Record<string, number>;
}

/** 読み込み直後の未検証データ。値の検証は GameState 側で行う。 */
export type RawSaveData = Partial<Record<keyof SaveData, unknown>>;

export interface SaveStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** localStorage が使えない環境（プライベートモード等）ではメモリ上に保持する */
export function createDefaultStorage(): SaveStorage {
  try {
    const storage = globalThis.localStorage;
    const probeKey = `${SAVE_STORAGE_KEY}.probe`;
    storage.setItem(probeKey, "1");
    storage.removeItem(probeKey);
    return storage;
  } catch {
    return createMemoryStorage();
  }
}

export function createMemoryStorage(): SaveStorage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, value),
    removeItem: (key) => void values.delete(key),
  };
}

export class SaveRepository {
  constructor(
    private readonly storage: SaveStorage,
    private readonly key = SAVE_STORAGE_KEY,
  ) {}

  hasSaveData(): boolean {
    try {
      return this.storage.getItem(this.key) !== null;
    } catch {
      return false;
    }
  }

  load(): RawSaveData | null {
    try {
      const text = this.storage.getItem(this.key);
      if (text === null) {
        return null;
      }
      return parseSaveText(text);
    } catch {
      return null;
    }
  }

  save(data: SaveData): boolean {
    try {
      this.storage.setItem(this.key, serializeSaveData(data));
      return true;
    } catch {
      return false;
    }
  }

  clear(): void {
    try {
      this.storage.removeItem(this.key);
    } catch {
      // 削除できなくても致命的ではない
    }
  }
}

export function serializeSaveData(data: SaveData): string {
  return JSON.stringify({ format: SAVE_FORMAT_ID, version: SAVE_FORMAT_VERSION, progress: data }, null, 2);
}

/**
 * エクスポートした JSON、または Godot 版の save.cfg を読み取る。
 * どちらとも解釈できない場合は null。
 */
export function parseSaveText(text: string): RawSaveData | null {
  const trimmed = text.trim().replace(/^﻿/, "");
  if (trimmed.startsWith("{")) {
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (parsed && typeof parsed === "object") {
        const record = parsed as Record<string, unknown>;
        const progress = record.progress && typeof record.progress === "object" ? record.progress : record;
        return progress as RawSaveData;
      }
    } catch {
      return null;
    }
    return null;
  }
  return parseGodotConfig(trimmed);
}

/** Godot ConfigFile の [progress] セクションを読み取る */
export function parseGodotConfig(text: string, section = "progress"): RawSaveData | null {
  const values: Record<string, unknown> = {};
  let currentSection = "";
  let foundSection = false;
  const lines = text.split(/\r?\n/);
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex].trim();
    if (line.length === 0 || line.startsWith(";")) {
      continue;
    }
    const sectionMatch = /^\[(.+)\]$/.exec(line);
    if (sectionMatch) {
      currentSection = sectionMatch[1].trim();
      foundSection ||= currentSection === section;
      continue;
    }
    const separator = line.indexOf("=");
    if (separator < 0) {
      continue;
    }
    const key = line.slice(0, separator).trim();
    let valueText = line.slice(separator + 1).trim();
    // 辞書・配列は複数行にまたがることがあるので、括弧が閉じるまで連結する
    while (!isBalanced(valueText) && lineIndex + 1 < lines.length) {
      lineIndex += 1;
      valueText += "\n" + lines[lineIndex];
    }
    if (currentSection !== section) {
      continue;
    }
    values[key] = parseGodotValue(valueText);
  }

  if (!foundSection) {
    return null;
  }
  return values as RawSaveData;
}

function isBalanced(text: string): boolean {
  let depth = 0;
  let inString = false;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (inString) {
      if (char === "\\") {
        index += 1;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }
    if (char === '"') {
      inString = true;
    } else if (char === "[" || char === "{" || char === "(") {
      depth += 1;
    } else if (char === "]" || char === "}" || char === ")") {
      depth -= 1;
    }
  }
  return depth <= 0 && !inString;
}

function parseGodotValue(valueText: string): unknown {
  let text = valueText.trim();
  // Array[String]([...]) のような型付き配列表記を外す
  const typedArray = /^Array\[[A-Za-z0-9_]+\]\(([\s\S]*)\)$/.exec(text);
  if (typedArray) {
    text = typedArray[1].trim();
  }
  if (text === "true" || text === "false") {
    return text === "true";
  }
  if (/^-?\d+$/.test(text)) {
    // 安全な整数範囲を超える値は精度を落とさないよう文字列のまま扱う
    const asNumber = Number(text);
    return Number.isSafeInteger(asNumber) ? asNumber : text;
  }
  if (/^-?\d*\.\d+(e-?\d+)?$/i.test(text)) {
    return Number(text);
  }
  try {
    return JSON.parse(text);
  } catch {
    return text.replace(/^"|"$/g, "");
  }
}
