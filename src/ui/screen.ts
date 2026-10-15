import type { GameState } from "../progress/gameState";

export interface Screen {
  readonly element: HTMLElement;
  /** 画面が DOM に追加された後に呼ばれる */
  mount?(): void;
  /** 画面を離れるときに呼ばれる（イベント解除など） */
  destroy(): void;
}

export type ScreenName = "title" | "menu" | "board" | "options";

export interface AppContext {
  gameState: GameState;
  navigate(screen: ScreenName): void;
}
