# Levi Runner

Endless runner de 3 faixas no Rio (Copacabana → Lapa → Santa Teresa), feito com three.js, com educação
financeira para o PGE Educa: na corrida, moedas; entre corridas, o Banco do Levi (cofrinho e investimentos que rendem a cada corrida) e a loja de
skins paga com esse dinheiro.

O cofrinho rende a **Selic real**: o `server.py` busca a Selic meta e o IPCA de 12 meses na API do Banco Central
(`api.bcb.gov.br`, séries 432 e 13522) uma vez a cada 24 h, e cada corrida de 200 m ou mais vale um mês dessa taxa.
O investimento travado paga 130% dela. Sem saída HTTPS para o Banco Central, vale a última taxa gravada ou a reserva
do `catalog.json` (`selicReserva`, `ipcaReserva`), e a tela mostra "Selic de referência".

## Rodar

```sh
pnpm install
python3 server.py      # login e ranking em :8042 (opcional no desenvolvimento)
pnpm dev               # jogo com recarga automática; /api vai para o server.py (LEVI_API troca o endereço)
pnpm test              # física, colisão, economia, malhas, sombra (node) e regras do banco (python)
./build.sh             # testa e gera dist/; depois sirva com: python3 server.py [porta]
```

Com `?stats` no endereço (ex.: `localhost:5173/?stats`) aparece um painel com FPS, draw calls, triângulos e a
resolução atual, para conferir o desempenho em qualquer aparelho.

## Desempenho

- **LOD do cenário**: o trecho nasce no fundo na versão de longe (malhas com menos polígonos de `Art.low`, cores lisas
  num material só, sem sombra) e ganha a versão de perto ao passar de 110 m, um trecho por quadro, com os mesmos sorteios.
- **LOD dos obstáculos**: veículos (55 m), cavaletes e placas (35 m) trocam de nível com histerese.
- **Moedas instanciadas**: todas em 3 draw calls, uma por nível (cheia, 40 m, 110 m).
- **Resolução adaptativa**: cai 0,25× quando a média passa de 20 ms e volta quando folga, sem ficar oscilando.

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
| `src/edu/catalog.json` | **Regras e preços** do dinheiro (moeda, % da Selic, juros da corrida, carência, skins), lidos pelo jogo e pelo servidor |
| `src/edu/economy.js`, `bank.js` | Carteira da corrida, portais, juros, dívida; taxas em vigor, poupança e projeções do banco |
| `src/edu/dicas.js` | Textos da "Dica do Levi" e do banco (para a equipe do PGE Educa revisar) |
| `src/skins.js` | Pinturas e acessórios do Levi |
| `src/ui/` | HUD da corrida, menu e extrato, painéis do Banco e da Loja |
| `src/account.js`, `src/api.js`, `src/ranking.js` | Conta no banco, cliente da API, login e ranking |
| `src/audio.js`, `src/input.js` | Som, teclado e toque |
| `server.py` | Serve o jogo; login, ranking e o dinheiro (o servidor é quem guarda e confere) |
| `assets/` | Modelo `levi.glb`, sons e fonte (servidos na raiz do site) |
| `tools/` | Scripts Python que geram as animações, os sons e preparam o modelo |
