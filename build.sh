#!/bin/sh
# Gera dist/ pronto para servir com o server.py. Uso: ./build.sh
set -e
pnpm install --frozen-lockfile
pnpm test
pnpm build
# o server.py entrega estes .gz; os sons ficam de fora porque o gzip quase não os reduz
gzip -9kf dist/js/*.js dist/levi.glb
