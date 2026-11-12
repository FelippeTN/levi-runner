# Levi Runner

Endless runner de 3 faixas no Rio (Copacabana → Lapa → Santa Teresa), feito com three.js, com educação
financeira para o PGE Educa: na corrida, moedas; entre corridas, o Banco do Levi (cofrinho e investimentos que rendem a cada corrida) e a loja de
skins paga com esse dinheiro.

O cofrinho rende a **Selic real**: o `server.py` busca a Selic meta e o IPCA de 12 meses na API do Banco Central
(`api.bcb.gov.br`, séries 432 e 13522) uma vez a cada 24 h, e cada corrida de 200 m ou mais vale um mês dessa taxa.
Há três tipos de investimento, para ensinar a diferença entre eles:

| Tipo | Rende | Prazo | Antes do prazo |
|---|---|---|---|
| Pós-fixado | 105% da Selic de cada mês, como um CDB com carência | 6 corridas (carência) | não resgata |
| Prefixado | taxa travada na aplicação: Selic média esperada pelo **Boletim Focus** (`olinda.bcb.gov.br`) × 105% + prêmio de prazo de 0,5 p.p. | 12 corridas | vende a preço de mercado |
| IPCA+ | IPCA do mês + juro real travado (`jurosRealIpca`) | 24 corridas | vende a preço de mercado |

A venda antecipada usa marcação a mercado (juros subiram, o título vale menos; caíram, vale mais). O painel tem um
simulador "e se a Selic cair/subir 3 p.p." e o guia "Aprenda". Sem saída HTTPS para o Banco Central, vale a última
taxa gravada ou a reserva do `catalog.json` (`selicReserva`, `ipcaReserva`, `selicEsperadaReserva`), e a tela mostra
"Selic de referência".

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

## Assets

Prédios, sobrados, carros, postes, palmeiras, árvores, nuvens, a luz do céu e a maior parte dos efeitos sonoros são
pacotes **CC0** (domínio público) da KayKit, Quaternius, Kenney e Poly Haven. A lista com as fontes está em
[`assets/CREDITS.md`](assets/CREDITS.md). Os arquivos prontos (`assets/scenery.glb`, `scenery.png`, `sky.hdr`,
`sfx/*.wav`) estão no repositório; só é preciso refazê-los ao trocar ou incluir um modelo:

```sh
./tools/fetch_assets.sh          # baixa os originais em .cache/assets/ (fora do git)
node tools/build_scenery.mjs     # junta os modelos em assets/scenery.glb (+ versão de longe) e reduz o céu
./tools/build_sfx.sh             # converte os sons para assets/sfx/
```

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
| `src/world/models.js` | Modelos CC0 do `scenery.glb`: leitura, versão de longe, pintura dos sobrados |
| `src/fx.js`, `src/render.js` | Câmera, sol com sombra estável, partículas, bloom e tone mapping |
| `src/edu/catalog.json` | **Regras e preços** do dinheiro (moeda, % da Selic, juros da corrida, carência, skins), lidos pelo jogo e pelo servidor |
| `src/edu/economy.js`, `bank.js` | Carteira da corrida, juros, dívida; taxas em vigor, tipos de investimento, marcação a mercado, cenários e projeções do banco |
| `src/edu/dicas.js` | Textos da "Dica do Levi", do banco e do guia de renda fixa (para a equipe do PGE Educa revisar) |
| `src/skins.js` | Pinturas e acessórios do Levi |
| `src/ui/` | HUD da corrida, menu e extrato, painéis do Banco e da Loja |
| `src/account.js`, `src/api.js`, `src/ranking.js` | Conta no banco, cliente da API, login e ranking |
| `src/audio.js`, `src/input.js` | Som, teclado e toque |
| `server.py` | Serve o jogo; login, ranking e o dinheiro (o servidor é quem guarda e confere) |
| `assets/` | Modelo `levi.glb`, sons e fonte (servidos na raiz do site) |
| `tools/` | Scripts Python que geram as animações, os sons e preparam o modelo |
