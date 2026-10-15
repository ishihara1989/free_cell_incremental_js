import { defineConfig } from "vitest/config";

export default defineConfig({
  // 相対パスで出力し、GitHub Pages や itch.io などサブパス配信でもそのまま動くようにする
  base: "./",
  build: {
    target: "es2022",
  },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
});
