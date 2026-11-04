#!/bin/sh
# Gera dist/ pronto para servir. Uso: ./build.sh
set -e
cargo build --release --target wasm32-unknown-unknown
wasm-bindgen --target web --no-typescript --out-dir dist target/wasm32-unknown-unknown/release/levi-runner.wasm
cp index.html dist/
cp -r assets dist/
# o server.py entrega estes .gz; a música fica de fora porque o gzip quase não a reduz
gzip -9kf dist/levi-runner_bg.wasm dist/levi-runner.js dist/assets/levi.glb
