// Painel do Banco do Levi: conta, cofrinho e investimentos; guardar, sacar, investir; rendimento do mês,
// a Selic do dia e projeção de 12 corridas. O servidor confere tudo; aqui só pede e mostra.

import { store } from "../account.js";
import { LOCK_MONTHS, poupanca, project, RATES } from "../edu/bank.js";
import { aoAno, inflacao, SELIC_EXPLICA, selicMudou } from "../edu/dicas.js";
import { brl } from "../edu/economy.js";

const MONTHS = 12;
const SELIC_SEEN = "levi-selic";
const pct = (r) => `${(r * 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;

/** Faixa da Selic: taxa do dia com fonte e data, o que ela vira no jogo e a explicação. */
const selicBox = (notice) => `
  <div class="selic">
    ${notice ? `<p class="changed">${notice}</p>` : ""}
    <p><b>Selic ${RATES.ao_vivo ? "hoje" : "de referência"}: ${aoAno(RATES.selic)}% ao ano</b> · Banco Central, ${RATES.consultado}</p>
    <p>No jogo, 1 corrida = 1 mês: o cofrinho rende <b>${pct(RATES.cofrinho)}</b> por corrida.</p>
    <details><summary>O que é a Selic?</summary><p>${SELIC_EXPLICA}</p></details>
  </div>`;

/** Gráfico de linhas em SVG: o mesmo valor parado, no cofrinho e investido ao longo de 12 corridas. */
function chart(value) {
  const series = [
    ["Parado", 0, "var(--still)"],
    ["Poupança", poupanca(RATES.selic), "var(--poup)"],
    ["Cofrinho", RATES.cofrinho, "var(--save)"],
    ["Investido", RATES.investimento, "var(--invest)"],
  ].map(([name, rate, color]) => ({ name, color, points: project(value, rate, MONTHS) }));
  const [w, h, pad] = [320, 120, 6];
  const max = Math.max(...series.at(-1).points) || 1;
  const x = (i) => pad + (i / MONTHS) * (w - 2 * pad);
  const y = (v) => h - pad - (v / max) * (h - 2 * pad) * 0.9;
  const lines = series
    .map((s) => `<polyline points="${s.points.map((v, i) => `${x(i)},${y(v)}`).join(" ")}" stroke="${s.color}" />`)
    .join("");
  const legend = series
    .map((s) => `<li style="--c:${s.color}"><span>${s.name}</span><b>${brl(s.points.at(-1))}</b></li>`)
    .join("");
  return `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Projeção de ${brl(value)} em ${MONTHS} corridas">${lines}</svg><ul class="legend">${legend}</ul>`;
}

const projection = (value) =>
  `<h3>Se ${brl(value)} ficar ${MONTHS} corridas…</h3>${chart(value)}<p class="note">${inflacao(value, RATES.ipca, MONTHS)}</p>`;

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

  const render = () => {
    const d = account.data;
    if (!d) {
      month.textContent = "";
      body.innerHTML = `
        <p class="lead">Aqui seu dinheiro fica guardado entre as corridas e <b>rende</b>. Com o rendimento você compra skins na loja.</p>
        ${selicBox(notice)}
        <button class="play-button wide" data-act="login">ENTRAR PARA ABRIR MINHA CONTA</button>`;
      return;
    }
    const invested = d.aplicacoes.reduce((s, a) => s + a.valor, 0);
    month.textContent = `MÊS ${d.mes}`;
    const lots = d.aplicacoes
      .map((a) => {
        const left = a.libera_em - d.mes;
        return `<li>${brl(a.valor)} <span>libera em ${left} corrida${left > 1 ? "s" : ""}</span></li>`;
      })
      .join("");
    const preview = Number(amount) > 0 ? Number(amount) * 100 : account.total || 50000;
    const r = account.lastRun;
    const gain = r && r.mes ? r.cofrinho + r.investimento : 0;
    body.innerHTML = `
      ${gain > 0 ? `<p class="yield">Seu dinheiro rendeu <b data-count="${gain}">${brl(0)}</b> nesta corrida!${r.liberado ? ` · ${brl(r.liberado)} de investimento liberado na conta` : ""}</p>` : ""}
      ${selicBox(notice)}
      <div class="accounts">
        <article class="acc acc-conta"><h3>CONTA</h3><b>${brl(d.conta)}</b><p>parado, não rende e perde para a inflação · é o que você gasta na loja</p></article>
        <article class="acc acc-save"><h3>COFRINHO</h3><b>${brl(d.cofrinho)}</b><p>rende a Selic: ${pct(RATES.cofrinho)} por corrida · saca quando quiser</p></article>
        <article class="acc acc-invest"><h3>INVESTIMENTOS</h3><b>${brl(invested)}</b><p>rende mais que o cofrinho: ${pct(RATES.investimento)} por corrida · fica travado ${LOCK_MONTHS} corridas</p>${lots ? `<ul>${lots}</ul>` : ""}</article>
      </div>
      <div class="move">
        <label>Valor <span>R$</span><input id="bank-amount" type="number" inputmode="numeric" min="1" step="1" value="${amount}" placeholder="0"></label>
        <div class="chips">
          <button data-frac="0.25">25%</button><button data-frac="0.5">50%</button><button data-frac="1">TUDO</button>
        </div>
        <div class="actions">
          <button class="act act-save" data-act="guardar">GUARDAR NO COFRINHO</button>
          <button class="act act-invest" data-act="investir">INVESTIR ${LOCK_MONTHS} CORRIDAS</button>
          <button class="act act-out" data-act="sacar">SACAR DO COFRINHO</button>
        </div>
        <p class="msg" role="status">${message}</p>
      </div>
      <div class="projection">
        <div class="projection-chart">${projection(preview)}</div>
        <p class="note">Selic e IPCA do Banco Central na data indicada; poupança pela regra oficial, sem a TR. As taxas mudam, e rendimento passado não garante o futuro.</p>
      </div>`;
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
    const value = Number(amount) > 0 ? Number(amount) * 100 : account.total || 50000;
    body.querySelector(".projection-chart").innerHTML = projection(value);
  });

  body.addEventListener("click", async (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    hooks.sfx("click");
    if (btn.dataset.act === "login") return hooks.login();
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
      await account.bank(act, cents);
      message = { guardar: "Guardado! Vai render a cada corrida.", investir: `Investido! Volta com rendimento em ${LOCK_MONTHS} corridas.`, sacar: "Sacado para a conta." }[act];
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
      // só compara taxa vinda do Banco Central: a de reserva não é "mudança"
      const seen = store.get(SELIC_SEEN, null);
      notice = RATES.ao_vivo && seen !== null && seen !== RATES.selic ? selicMudou(seen, RATES.selic, pct(RATES.cofrinho)) : "";
      if (RATES.ao_vivo) store.set(SELIC_SEEN, RATES.selic);
      render();
    },
  };
}
