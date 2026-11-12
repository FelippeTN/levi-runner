// Clube do Investidor na tela: o cartão do nível (loja e banco) e a trilha dos níveis com o que cada um libera.

import { CLUBE, clube } from "../edu/bank.js";
import { CLUBE_EXPLICA } from "../edu/dicas.js";
import { brl } from "../edu/economy.js";
import { SKINS } from "../skins.js";

/** Skins que cada nível libera. */
export const liberadasPor = (nivelId) => Object.values(SKINS).filter((s) => s.nivel === nivelId);

/**
 * Cartão do nível: selo, rendimentos e barra até o próximo nível com o que ele libera.
 * @param {number} rendimentos centavos
 * @param {string} [act] data-act do cartão, se ele for um botão
 */
export function clubeCard(rendimentos, act) {
  const { atual, proximo, falta, progresso } = clube(rendimentos);
  const premio = proximo && liberadasPor(proximo.id).map((s) => s.nome).join(", ");
  const meta = proximo
    ? `Faltam <b>${brl(falta)}</b> de rendimentos para ${proximo.selo} ${proximo.nome}${premio ? ` · libera ${premio}` : ""}`
    : "Nível máximo! Todos os itens do clube estão liberados.";
  const tag = act ? "button" : "div";
  return `<${tag} class="clube-card"${act ? ` data-act="${act}"` : ""}>
    <span class="clube-selo" aria-hidden="true">${atual.selo}</span>
    <span class="clube-info">
      <small>CLUBE DO INVESTIDOR</small>
      <strong>${atual.nome.toUpperCase()}</strong>
      <span class="clube-bar" style="--p:${(progresso * 100).toFixed(1)}%"><i></i></span>
      <span class="clube-meta">Seu dinheiro já rendeu ${brl(rendimentos)} · ${meta}</span>
    </span>
  </${tag}>`;
}

/** Trilha dos níveis: o mínimo de rendimentos de cada um e o que libera; marca os alcançados e o atual. */
export function trilha(rendimentos) {
  const { atual } = clube(rendimentos);
  const itens = CLUBE.map((n) => {
    const cls = n.id === atual.id ? "now" : rendimentos >= n.rendimentos ? "done" : "";
    const libera = liberadasPor(n.id).map((s) => s.nome).join(", ");
    return `<li class="${cls}"><span>${n.selo}</span><b>${n.nome}</b><em>${n.rendimentos ? `${brl(n.rendimentos)} em juros` : "todo mundo começa aqui"}</em>${libera ? `<small>libera ${libera}</small>` : ""}</li>`;
  }).join("");
  return `<div class="trilha"><ol>${itens}</ol><p>${CLUBE_EXPLICA}</p></div>`;
}
