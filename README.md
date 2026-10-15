# Free Cell Incremental（ブラウザ版）

Godot 4 で制作した「Free Cell Incremental」（`../free_cell_incremental`）を、ブラウザで遊べるように TypeScript へ移植したものです。
ゲームルール・得点式・アップグレード／転生ツリー・実績・エネルギーとスキルは Godot 版と同じ仕様です。仕様の詳細は Godot 版の `docs/` を参照してください。

## 開発

```bash
npm install
npm run dev        # 開発サーバー（http://localhost:5173）
npm test           # ロジックのテスト（Godot 版 GUT テストの移植）
npm run build      # 型チェック + 本番ビルド（dist/）
npm run preview    # ビルド結果の確認
```

`dist/` は相対パスで出力されるため、GitHub Pages・itch.io（HTML5）など任意の静的ホスティングにそのまま置けます。

## 構成

| ディレクトリ | 内容 | Godot 版の対応 |
| --- | --- | --- |
| `src/core/` | 盤面ルール・移動・自動完成・ヒント・エネルギー・転生スキル | `scripts/board/` |
| `src/progress/` | 巨大整数、得点計算、アップグレード／転生／実績カタログ、`GameState`、セーブ | `scripts/progress/`, `scripts/game_state.gd` |
| `src/ui/` | カード・ツリーノードの SVG 描画、盤面レイアウト計算、ダイアログ | `scripts/card_view.gd`, `scripts/ui/` など |
| `src/ui/screens/` | タイトル・メニュー・盤面・オプション画面 | `scenes/*.tscn` と各画面スクリプト |
| `tests/` | Vitest によるロジックテスト | `tests/test_*.gd` |

- 巨大な得点は Godot 版と同じく 10 進数文字列で保持し、演算には `BigInt` を使います。
- カードとツリーノードは Godot 版の `_draw()` の座標をそのまま SVG に写しています。

## Godot 版からの変更点

- **セーブ**: ブラウザの localStorage に自動保存します。オプション画面からファイルへの書き出し・読み込みができ、Godot 版の `save.cfg`（Windows: `%APPDATA%\Godot\app_userdata\Free Cell Incremental\save.cfg`）もそのまま読み込めます。
- **オプション画面**: ウィンドウサイズ設定の代わりにセーブデータ管理を置いています。タイトルの「終了」ボタンはありません。
- **盤面の自動倍率**: Godot 版は「幅に合わせる倍率」を下限にしていましたが、ブラウザでは縦が狭くなりやすいため、高さに合わせて縮小することも許しています。余白があるときは盤面を中央に寄せ、上段（フリーセル／完成置き場）の横並び・縦積みはカードが大きく表示できる方を自動で選びます。
- **操作の追加**: 拡大・縮小・全体表示ボタン、`Ctrl+Z` / `Ctrl+Y`（`Ctrl+Shift+Z`）での手戻し・手送り、タッチ操作（ドラッグ・ダブルタップ・空白ドラッグでのスクロール）に対応しています。
- **確認ダイアログ**: 転生の実行前に確認を挟みます。
- 1 回目のクリックだけで終わった（動かしていない）ドラッグは「そこには置けません。」を表示しません。
