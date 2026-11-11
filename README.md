# Levi Runner

Endless runner de 3 faixas no Rio (Copacabana → Lapa → Santa Teresa), feito com three.js, com educação
financeira para o PGE Educa: na corrida, portais POUPAR / INVESTIR / COMPRAR / APOSTAR e a reserva de emergência
como vida extra; entre corridas, o Banco do Levi (cofrinho e investimentos que rendem a cada corrida) e a loja de
skins paga com esse dinheiro.

## Rodar

```sh
pnpm install
python3 server.py      # login e ranking em :8042 (opcional no desenvolvimento)
pnpm dev               # jogo com recarga automática; /api vai para o server.py (LEVI_API troca o endereço)
pnpm test              # física, colisão, economia, malhas, sombra (node) e regras do banco (python)
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
| `src/edu/catalog.json` | **Regras e preços** do dinheiro (moeda, taxas, carência, skins), lidos pelo jogo e pelo servidor |
| `src/edu/economy.js`, `bank.js` | Carteira da corrida, portais, juros; projeções do banco |
| `src/edu/dicas.js` | Textos da "Dica do Levi" (para a equipe do PGE Educa revisar) |
| `src/skins.js` | Pinturas e acessórios do Levi |
| `src/ui/` | HUD da corrida, menu e extrato, painéis do Banco e da Loja |
| `src/account.js`, `src/api.js`, `src/ranking.js` | Conta no banco, cliente da API, login e ranking |
| `src/audio.js`, `src/input.js` | Som, teclado e toque |
| `server.py` | Serve o jogo; login, ranking e o dinheiro (o servidor é quem guarda e confere) |
| `assets/` | Modelo `levi.glb`, sons e fonte (servidos na raiz do site) |
| `tools/` | Scripts Python que geram as animações, os sons e preparam o modelo |
