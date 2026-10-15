import { confirmDialog } from "../dialog";
import { button, el } from "../dom";
import type { AppContext, Screen } from "../screen";

/** タイトル画面（Godot 版 title_screen.gd の移植）。ブラウザ版では「終了」を置かない。 */
export class TitleScreen implements Screen {
  readonly element: HTMLElement;
  private readonly continueButton: HTMLButtonElement;
  private readonly newGameButton: HTMLButtonElement;

  constructor(private readonly ctx: AppContext) {
    this.continueButton = button("続きから", () => this.onContinue(), "btn btn-title btn-primary");
    this.newGameButton = button("はじめから", () => void this.onNewGame(), "btn btn-title");
    this.element = el("div", { className: "screen title-screen" }, [
      el("h1", { className: "title-logo", text: "Free Cell Incremental" }),
      el("p", { className: "title-subtitle", text: "フリーセル × インクリメンタル" }),
      el("div", { className: "panel title-card" }, [
        el("div", { className: "title-buttons" }, [
          this.continueButton,
          this.newGameButton,
          button("オプション", () => this.ctx.navigate("options"), "btn btn-title"),
        ]),
      ]),
    ]);
    this.refreshContinueState();
  }

  mount(): void {
    (this.continueButton.disabled ? this.newGameButton : this.continueButton).focus({ preventScroll: true });
  }

  destroy(): void {}

  private refreshContinueState(): void {
    this.continueButton.disabled = !this.ctx.gameState.hasSaveData();
    this.continueButton.classList.toggle("btn-primary", !this.continueButton.disabled);
    this.newGameButton.classList.toggle("btn-primary", this.continueButton.disabled);
  }

  private onContinue(): void {
    if (!this.ctx.gameState.loadGame()) {
      this.refreshContinueState();
      return;
    }
    this.ctx.navigate("menu");
  }

  private async onNewGame(): Promise<void> {
    if (this.ctx.gameState.hasSaveData()) {
      const confirmed = await confirmDialog({
        title: "セーブデータを上書き",
        message: "現在のセーブデータを消去して、最初から始めますか？",
        okLabel: "はじめから",
        danger: true,
      });
      if (!confirmed) {
        return;
      }
    }
    this.ctx.gameState.resetProgress();
    this.ctx.navigate("menu");
  }
}
