// Painel do Banco do Levi: conta, cofrinho (a reserva) e investimentos pós-fixado, prefixado e IPCA+; guardar,
// sacar, investir e resgatar a preço de mercado; a Selic do dia, a expectativa do Focus, um simulador de cenários
// e o guia "Aprenda". O servidor confere tudo; aqui só pede e mostra.

import { store } from "../account.js";
import {
  aa, cofrinhoRate, marcacao, monthly, poupanca, prefixadoAA, projectRates, RATES, selicPath, taxaHoje, TIPOS,
} from "../edu/bank.js";
import { aoAno, GUIA_RENDA_FIXA, inflacao, resgateTexto, SELIC_EXPLICA, selicMudou, subiuTexto } from "../edu/dicas.js";
import { brl } from "../edu/economy.js";
import { clubeCard, liberadasPor } from "./clube.js";

const MONTHS = 12;
const SELIC_SEEN = "levi-selic";
const pct = (r) => `${(r * 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
const plural = (n, palavra) => `${n} ${palavra}${n === 1 ? "" : "s"}`;
/** Cenários do simulador: quanto a Selic anda (pontos percentuais) em 12 corridas. */
const CENARIOS = [
  [-3, "Selic cai 3 p.p."],
  [0, "Fica igual"],
  [3, "Selic sobe 3 p.p."],
];
const SOBRE = {
  pos: "Rende mais se a Selic subir e menos se cair. Você sabe a regra, não o valor final. Fica travado até o fim da carência.",
  pre: "Você sabe hoje quanto recebe no fim. Ganha do pós se os juros ficarem abaixo do esperado. Vender antes sai a preço de mercado.",
  ipca: "Paga a inflação mais um juro real travado: protege o poder de compra. Prazo longo, para objetivos longos.",
};

/** Faixa da Selic: taxa do dia com fonte e data, a expectativa do mercado, o que vira no jogo e a explicação. */
const selicBox = (notice) => `
  <div class="selic">
    ${notice ? `<p class="changed">${notice}</p>` : ""}
    <p><b>Selic ${RATES.ao_vivo ? "hoje" : "de referência"}: ${aoAno(RATES.selic)}% ao ano</b> · Banco Central, ${RATES.consultado}</p>
    <p>Mercado espera Selic média de <b>${aoAno(RATES.selic_esperada)}%</b> nas próximas reuniões do Copom · Boletim Focus, ${RATES.focus_consultado}</p>
    <p>No jogo, 1 corrida = 1 mês: o cofrinho rende <b>${pct(RATES.cofrinho)}</b> por corrida.</p>
    <details><summary>O que é a Selic?</summary><p>${SELIC_EXPLICA}</p></details>
  </div>`;

/** Gráfico de linhas em SVG: o mesmo valor em cada lugar ao longo de 12 corridas, com a Selic andando `delta`. */
function chart(value, delta) {
  const path = selicPath(RATES.selic, delta, MONTHS);
  const series = [
    ["Parado", path.map(() => 0), "var(--still)"],
    ["Poupança", path.map(poupanca), "var(--poup)"],
    ["Cofrinho", path.map(cofrinhoRate), "var(--save)"],
    ["Pós", path.map(TIPOS.pos.rate), "var(--invest)"],
    ["Pré", path.map(TIPOS.pre.rate), "var(--pre)"],
    ["IPCA+", path.map(TIPOS.ipca.rate), "var(--ipca)"],
  ].map(([name, rates, color]) => ({ name, color, points: projectRates(value, rates) }));
  const [w, h, pad] = [320, 120, 6];
  // escala do menor ao maior saldo: a partir do zero, as diferenças de poucos por cento sumiriam
  const all = series.flatMap((s) => s.points);
  const [min, max] = [Math.min(...all), Math.max(...all)];
  const x = (i) => pad + (i / MONTHS) * (w - 2 * pad);
  const y = (v) => h - pad - ((v - min) / (max - min || 1)) * (h - 2 * pad);
  const lines = series
    .map((s) => `<polyline points="${s.points.map((v, i) => `${x(i)},${y(v)}`).join(" ")}" stroke="${s.color}" />`)
    .join("");
  const legend = series
    .map((s) => `<li style="--c:${s.color}"><span>${s.name}</span><b>${brl(s.points.at(-1))}</b></li>`)
    .join("");
  const svg = `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Projeção de ${brl(value)} em ${MONTHS} corridas">${lines}</svg>`;
  return { html: `${svg}<ul class="legend">${legend}</ul>`, pos: series[3].points, pre: series[4].points };
}

/** O que o cenário ensina: quem ganhou entre pré e pós, e quanto valeria vender o pré no meio do caminho. */
function licao(value, delta, pos, pre) {
  const dif = pre.at(-1) - pos.at(-1);
  const quem =
    Math.abs(dif) < 100
      ? "Neste cenário, prefixado e pós-fixado terminam praticamente empatados."
      : `Neste cenário, o prefixado termina <b>${brl(Math.abs(dif))} ${dif > 0 ? "acima" : "abaixo"}</b> do pós-fixado.`;
  const meio = MONTHS / 2;
  // na corrida 6 a Selic já andou metade do caminho, e o mercado passa a pedir taxa nova para o mesmo prazo
  const hoje = monthly(prefixadoAA(RATES.selic_esperada + delta / 2));
  const venda = marcacao(pre[meio], RATES.prefixado, hoje, meio);
  const gap = venda - pre[meio];
  const vender =
    Math.abs(gap) < 100
      ? `Vendendo o prefixado na corrida ${meio}, sairia pela curva (${brl(venda)}): os juros não mudaram.`
      : `Vendendo o prefixado na corrida ${meio}, sairia por <b>${brl(venda)}</b>, ${brl(Math.abs(gap))} ${gap < 0 ? "abaixo" : "acima"} da curva: é a marcação a mercado.`;
  return `<p class="lesson">${quem}</p><p class="lesson">${vender}</p>`;
}

const projection = (value, delta) => {
  const c = chart(value, delta);
  return `${c.html}${licao(value, delta, c.pos, c.pre)}<p class="note">${inflacao(value, RATES.ipca, MONTHS)}</p>`;
};

const guia = () => `
  <div class="guia">
    <h3>APRENDA: PÓS, PRÉ E IPCA+</h3>
    ${GUIA_RENDA_FIXA.map((g) => `<details><summary>${g.titulo}</summary><p>${g.texto}</p></details>`).join("")}
  </div>`;

/** Uma aplicação: tipo, regra, prazo e, no pré e no IPCA+, o preço de venda hoje. */
function lot(a, mes, confirmar) {
  const t = TIPOS[a.tipo] ?? TIPOS.pos;
  const left = a.libera_em - mes;
  const regra = a.tipo === "pre" ? `travado em ${aa(a.taxa_aa)} ao ano` : a.tipo === "ipca" ? `IPCA + ${aa(a.taxa_aa)} ao ano` : t.regra();
  let venda = `<div class="sell"><span>sem resgate antes do vencimento (carência)</span></div>`;
  if (t.liquido) {
    const preco = marcacao(a.valor, a.taxa, taxaHoje(a.tipo), left);
    venda = `<div class="sell"><span>Vender hoje: <b>${brl(preco)}</b></span>
      <button class="mini" data-act="resgatar" data-id="${a.id}">${confirmar === a.id ? "CONFIRMAR VENDA" : "RESGATAR"}</button></div>`;
  }
  return `<li class="lot lot-${a.tipo}">
    <div class="lot-head"><em class="badge">${t.selo}</em><b>${brl(a.valor)}</b><span>vence em ${plural(left, "corrida")}</span></div>
    <p>${regra} · aplicado ${brl(a.aplicado ?? a.valor)}</p>${venda}</li>`;
}

/**
 * @param {HTMLElement} sheet
 * @param {import("../account.js").Account} account
 * @param {{sfx: (name: string, rate?: number) => void, login: () => void}} hooks
 */
export function bankPanel(sheet, account, hooks) {
  const body = sheet.querySelector(".sheet-body");
  const month = sheet.querySelector(".month");
  let amount = "";
  let message = "";
  let celebrated = null;
  let notice = "";
  let tipo = "pos";
  let cenario = 0;
  /** id da aplicação esperando o segundo clique para vender com prejuízo */
  let confirmar = null;

  const preview = () => (Number(amount) > 0 ? Number(amount) * 100 : account.total || 50000);
  const projectionBlock = () => `
    <div class="projection">
      <h3>Se ${brl(preview())} ficar ${MONTHS} corridas…</h3>
      <div class="chips cenarios">${CENARIOS.map(([d, nome]) => `<button data-cen="${d}" aria-pressed="${d === cenario}">${nome}</button>`).join("")}</div>
      <div class="projection-chart">${projection(preview(), cenario)}</div>
      <p class="note">Selic e IPCA do Banco Central e expectativa do Boletim Focus na data indicada; poupança pela regra oficial, sem a TR. O simulador é um exemplo: as taxas mudam, e rendimento passado não garante o futuro.</p>
    </div>`;

  const render = () => {
    const d = account.data;
    if (!d) {
      month.textContent = "";
      body.innerHTML = `
        <p class="lead">Aqui seu dinheiro fica guardado entre as corridas e <b>rende</b>. Com o rendimento você compra skins na loja.</p>
        ${selicBox(notice)}
        <button class="play-button wide" data-act="login">ENTRAR PARA ABRIR MINHA CONTA</button>
        ${projectionBlock()}
        ${guia()}`;
      return;
    }
    const invested = d.aplicacoes.reduce((s, a) => s + a.valor, 0);
    month.textContent = `MÊS ${d.mes}`;
    const lots = d.aplicacoes.map((a) => lot(a, d.mes, confirmar)).join("");
    const r = account.lastRun;
    const gain = r && r.mes ? r.cofrinho + r.investimento : 0;
    const t = TIPOS[tipo];
    body.innerHTML = `
      ${gain > 0 ? `<p class="yield">Seu dinheiro rendeu <b data-count="${gain}">${brl(0)}</b> nesta corrida!${r.liberado ? ` · ${brl(r.liberado)} de investimento liberado na conta` : ""}</p>` : ""}
      ${r?.subiu ? `<p class="yield levelup">${subiuTexto(r.subiu, liberadasPor(r.subiu.id))}</p>` : ""}
      ${clubeCard(account.rendimentos)}
      ${selicBox(notice)}
      <div class="accounts">
        <article class="acc acc-conta"><h3>CONTA</h3><b>${brl(d.conta)}</b><p>parado, não rende e perde para a inflação · é o que você gasta na loja</p></article>
        <article class="acc acc-save"><h3>COFRINHO · SUA RESERVA</h3><b>${brl(d.cofrinho)}</b><p>pós-fixado com liquidez diária: rende a Selic, ${pct(RATES.cofrinho)} por corrida · saca quando quiser, sem perder nada</p></article>
        <article class="acc acc-invest"><h3>INVESTIMENTOS</h3><b>${brl(invested)}</b><p>${lots ? "rendem mais que o cofrinho em troca de prazo" : "nenhuma aplicação ainda: escolha um tipo abaixo"}</p>${lots ? `<ul class="lots">${lots}</ul>` : ""}</article>
      </div>
      <div class="move">
        <label>Valor <span>R$</span><input id="bank-amount" type="number" inputmode="numeric" min="1" step="1" value="${amount}" placeholder="0"></label>
        <div class="chips">
          <button data-frac="0.25">25%</button><button data-frac="0.5">50%</button><button data-frac="1">TUDO</button>
        </div>
        <div class="tipos" role="group" aria-label="Tipo de investimento">
          ${Object.entries(TIPOS)
            .map(([k, v]) => `<button class="tipo tipo-${k}" data-tipo="${k}" aria-pressed="${k === tipo}"><b>${v.nome}</b><span>${v.regra()}</span><span>${plural(v.prazo, "corrida")}</span></button>`)
            .join("")}
        </div>
        <p class="tipo-info">${SOBRE[tipo]}</p>
        <div class="actions">
          <button class="act act-save" data-act="guardar">GUARDAR NO COFRINHO</button>
          <button class="act act-invest act-${tipo}" data-act="investir">INVESTIR NO ${t.selo} · ${plural(t.prazo, "CORRIDA")}</button>
          <button class="act act-out" data-act="sacar">SACAR DO COFRINHO</button>
        </div>
        <p class="msg" role="status">${message}</p>
      </div>
      ${projectionBlock()}
      ${guia()}`;
    const counter = body.querySelector("[data-count]");
    if (counter && celebrated !== r) {
      celebrated = r;
      countUp(counter, gain);
    } else if (counter) counter.textContent = brl(gain);
  };

  const countUp = (el, value) => {
    const start = performance.now();
    hooks.sfx("coin", 1.2);
    const step = (now) => {
      const k = Math.min((now - start) / 900, 1);
      el.textContent = brl(value * (1 - (1 - k) ** 3));
      if (k < 1) requestAnimationFrame(step);
      else hooks.sfx("powerup");
    };
    requestAnimationFrame(step);
  };

  body.addEventListener("input", (e) => {
    if (e.target.id !== "bank-amount") return;
    amount = e.target.value;
    // atualiza só a projeção, sem redesenhar o campo em que a pessoa está digitando
    body.querySelector(".projection h3").textContent = `Se ${brl(preview())} ficar ${MONTHS} corridas…`;
    body.querySelector(".projection-chart").innerHTML = projection(preview(), cenario);
  });

  /** Venda antes do vencimento; com prejuízo, o primeiro clique só avisa. */
  const resgatar = async (btn) => {
    const id = Number(btn.dataset.id);
    const a = account.data.aplicacoes.find((x) => x.id === id);
    if (!a) return;
    const left = a.libera_em - account.data.mes;
    const preco = marcacao(a.valor, a.taxa, taxaHoje(a.tipo), left);
    if (preco < a.valor - 100 && confirmar !== id) {
      confirmar = id;
      const noFim = Math.round(a.valor * (1 + a.taxa) ** left);
      message = `Vender agora sai por ${brl(preco)}, ${brl(a.valor - preco)} abaixo da curva. Levando até o vencimento, ${a.tipo === "pre" ? `você recebe ${brl(noFim)}` : "você recebe a inflação mais a taxa combinada"}. Clique de novo para confirmar.`;
      return render();
    }
    confirmar = null;
    btn.disabled = true;
    try {
      message = resgateTexto(await account.bank("resgatar", null, { id }));
      hooks.sfx("powerup");
    } catch (err) {
      message = err.message;
    }
    render();
  };

  body.addEventListener("click", async (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    hooks.sfx("click");
    if (btn.dataset.act === "login") return hooks.login();
    if (btn.dataset.act === "resgatar") return resgatar(btn);
    confirmar = null;
    if (btn.dataset.tipo) {
      tipo = btn.dataset.tipo;
      return render();
    }
    if (btn.dataset.cen) {
      cenario = Number(btn.dataset.cen);
      return render();
    }
    if (btn.dataset.frac) {
      amount = String(Math.floor((account.data.conta * Number(btn.dataset.frac)) / 100));
      return render();
    }
    const act = btn.dataset.act;
    if (!act) return;
    const cents = Math.round(Number(amount) * 100);
    if (!(cents > 0)) {
      message = "Escolha um valor primeiro.";
      return render();
    }
    btn.disabled = true;
    try {
      await account.bank(act, cents, act === "investir" ? { tipo } : {});
      message = {
        guardar: "Guardado! Vai render a cada corrida.",
        investir: `Investido no ${TIPOS[tipo].nome.toLowerCase()}! Vence em ${plural(TIPOS[tipo].prazo, "corrida")}.`,
        sacar: "Sacado para a conta.",
      }[act];
      amount = "";
      hooks.sfx("powerup");
    } catch (err) {
      message = err.message;
    }
    render();
  });

  account.addEventListener("change", () => !sheet.hidden && render());
  return {
    show() {
      message = "";
      confirmar = null;
      // só compara taxa vinda do Banco Central: a de reserva não é "mudança"
      const seen = store.get(SELIC_SEEN, null);
      notice = RATES.ao_vivo && seen !== null && seen !== RATES.selic ? selicMudou(seen, RATES.selic, pct(RATES.cofrinho)) : "";
      if (RATES.ao_vivo) store.set(SELIC_SEEN, RATES.selic);
      render();
    },
  };
}
