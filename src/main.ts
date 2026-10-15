import "./styles.css";
import { GameState } from "./progress/gameState";
import type { AppContext, Screen, ScreenName } from "./ui/screen";
import { BoardScreen } from "./ui/screens/boardScreen";
import { MenuScreen } from "./ui/screens/menuScreen";
import { OptionsScreen } from "./ui/screens/optionsScreen";
import { TitleScreen } from "./ui/screens/titleScreen";

const root = document.getElementById("app");
if (!root) {
  throw new Error("#app が見つかりません");
}

const gameState = new GameState();
gameState.loadGame();

let current: Screen | null = null;

const context: AppContext = {
  gameState,
  navigate(name: ScreenName) {
    current?.destroy();
    root.replaceChildren();
    current = createScreen(name);
    root.dataset.screen = name;
    root.append(current.element);
    current.mount?.();
    window.scrollTo(0, 0);
  },
};

function createScreen(name: ScreenName): Screen {
  switch (name) {
    case "title":
      return new TitleScreen(context);
    case "menu":
      return new MenuScreen(context);
    case "board":
      return new BoardScreen(context);
    case "options":
      return new OptionsScreen(context);
  }
}

context.navigate("title");
