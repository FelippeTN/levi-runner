# Levi Runner

Endless runner de 3 faixas no Rio (Copacabana → Lapa → Santa Teresa), feito com three.js.

## Rodar

```sh
pnpm install
python3 server.py      # login e ranking em :8042 (opcional no desenvolvimento)
pnpm dev               # jogo com recarga automática; /api vai para o server.py
pnpm test              # física, colisão, malhas e sombra
./build.sh             # testa e gera dist/; depois sirva com: python3 server.py [porta]
```

## Código

| Arquivo | O que faz |
|---|---|
| `src/main.js` | Monta a cena e roda o laço do jogo, na ordem dos sistemas |
| `src/game.js`, `src/config.js` | Estado da corrida, fases, gerador determinístico, constantes |
| `src/player.js` | Entrada, física (pulo, rolamento, piso) e animações do Levi |
| `src/world/world.js` | Trechos reciclados, fileiras de obstáculos, rolagem e colisão |
| `src/world/zones.js`, `props.js`, `backdrop.js` | Bairros, veículos/cavaletes/placas, fundo (Pão de Açúcar, Cristo) |
| `src/world/textures.js`, `geometry.js`, `art.js` | Texturas e malhas geradas em código, materiais |
| `src/fx.js`, `src/render.js` | Câmera, sol com sombra estável, partículas, bloom e tone mapping |
| `src/ui.js`, `src/audio.js`, `src/ranking.js`, `src/input.js` | HUD, som, login/ranking, teclado e toque |
| `assets/` | Modelo `levi.glb`, sons e fonte (servidos na raiz do site) |
| `tools/` | Scripts Python que geram as animações, os sons e preparam o modelo |
