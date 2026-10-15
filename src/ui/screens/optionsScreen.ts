import { parseSaveText } from "../../progress/saveRepository";
import { alertDialog, confirmDialog } from "../dialog";
import { button, el } from "../dom";
import type { AppContext, Screen } from "../screen";

const GODOT_SAVE_PATH = "%APPDATA%\\Godot\\app_userdata\\Free Cell Incremental\\save.cfg";

/**
 * オプション画面。Godot 版のウィンドウサイズ設定はブラウザでは不要なため、
 * セーブデータの書き出し・読み込み（Godot 版 save.cfg の取り込みを含む）を置く。
 */
export class OptionsScreen implements Screen {
  readonly element: HTMLElement;
  private readonly fileInput: HTMLInputElement;

  constructor(private readonly ctx: AppContext) {
    this.fileInput = el("input", { attrs: { type: "file", accept: ".json,.cfg,.txt,application/json,text/plain", hidden: true } });
    this.fileInput.addEventListener("change", () => void this.onFileSelected());

    this.element = el("div", { className: "screen title-screen options-screen" }, [
      el("h1", { className: "title-logo title-logo-small", text: "オプション" }),
      el("p", { className: "title-subtitle", text: "データ管理" }),
      el("div", { className: "panel title-card options-card" }, [
        el("h2", { className: "card-title", text: "セーブデータ" }),
        el("p", {
          className: "card-description",
          text: "進行状況はこのブラウザに自動で保存されます。ブラウザのサイトデータを消すと失われるため、必要に応じてファイルへ書き出してください。",
        }),
        el("div", { className: "options-actions" }, [
          button("ファイルへ書き出す", () => this.exportSave(), "btn btn-primary"),
          button("ファイルから読み込む", () => this.fileInput.click(), "btn"),
          this.fileInput,
        ]),
        el("p", { className: "note" }, [
          "Godot 版の save.cfg も読み込めます。Windows での保存場所:",
          el("code", { className: "path", text: GODOT_SAVE_PATH }),
        ]),
        button("タイトルへ戻る", () => this.ctx.navigate("title"), "btn btn-back"),
      ]),
    ]);
  }

  destroy(): void {}

  private exportSave(): void {
    const text = this.ctx.gameState.exportSaveText();
    const blob = new Blob([text], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const date = new Date();
    const stamp = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
    const link = el("a", { attrs: { href: url, download: `free-cell-incremental-save-${stamp}.json` } });
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  private async onFileSelected(): Promise<void> {
    const file = this.fileInput.files?.[0];
    this.fileInput.value = "";
    if (!file) {
      return;
    }
    const text = await file.text();
    if (!parseSaveText(text)) {
      await alertDialog("読み込めませんでした", "セーブデータとして認識できないファイルです。");
      return;
    }
    const confirmed = await confirmDialog({
      title: "セーブデータを読み込む",
      message: `「${file.name}」の内容で現在の進行状況を上書きします。よろしいですか？`,
      okLabel: "読み込む",
      danger: true,
    });
    if (!confirmed) {
      return;
    }
    if (this.ctx.gameState.importSaveText(text)) {
      await alertDialog("読み込みました", "セーブデータを読み込みました。タイトル画面の「続きから」で再開できます。");
      this.ctx.navigate("title");
    } else {
      await alertDialog("読み込めませんでした", "セーブデータの形式が正しくないか、保存に失敗しました。");
    }
  }
}
