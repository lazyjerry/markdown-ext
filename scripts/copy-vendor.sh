#!/usr/bin/env bash
# 把增強預覽要用的第三方靜態檔從 node_modules 複製到 media/，由 npm run build 呼叫。
# 這些檔案是建置產物，不進版控，但會打包進 vsix。
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"

rm -rf media/vendor media/katex
mkdir -p media/vendor media/katex/fonts

cp node_modules/mermaid/dist/mermaid.min.js media/vendor/
cp node_modules/katex/dist/katex.min.css media/katex/
# CSS 的 @font-face 把 woff2 列在最前，webview 一定支援，woff／ttf 不會被請求，不必打包。
cp node_modules/katex/dist/fonts/*.woff2 media/katex/fonts/

echo "copy-vendor: mermaid、katex 已複製到 media/"
