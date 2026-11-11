// Loja do Levi: escolher uma skin já veste o Levi do menu (provador); comprar só com o saldo da conta.

import { RATES, runsText, runsUntil } from "../edu/bank.js";
import { brl } from "../edu/economy.js";
import { SKINS } from "../skins.js";

const LIST = Object.values(SKINS);
/** amostra da pintura no cartão: cabeça, detalhes e corpo */
const swatch = (s) => {
  const c = s.cores ?? { branco: "#d9dde8", azul: "#1b6fe0", corpo: "#ffffff" };
  return `<i class="swatch" style="--a:${c.branco};--b:${c.azul};--c:${c.corpo}"></i>`;
};
const ICON = { oculos: "😎", panama: "🎩", prancha: "🏄" };

/**
 * @param {HTMLElement} sheet
 * @param {import("../account.js").Account} account
 * @param {{preview: (pintura: string, acessorio: string | null, back: boolean) => void, sfx: (name: string) => void, login: () => void}} hooks
 */
export function shopPanel(sheet, account, hooks) {
  const body = sheet.querySelector(".sheet-body");
  const balance = sheet.querySelector(".month");
  let selected = "classico";
  let message = "";

  const equipped = () => ({ pintura: account.data?.pintura ?? "classico", acessorio: account.data?.acessorio ?? null });

  /** Veste no provador a skin escolhida, mantendo a outra metade do que está equipado. */
  const tryOn = () => {
    const e = equipped(), s = SKINS[selected];
    hooks.preview(s.tipo === "pintura" ? s.id : e.pintura, s.tipo === "acessorio" ? s.id : e.acessorio, !!s.costas);
  };

  const render = () => {
    const d = account.data;
    const owned = (id) => id === "classico" || !!d?.skins.includes(id);
    const e = equipped();
    balance.textContent = d ? `CONTA ${brl(d.conta)}` : "";
    const cards = LIST.map((s) => {
      const wearing = e.pintura === s.id || e.acessorio === s.id;
      const tag = wearing ? "VESTINDO" : owned(s.id) ? "SUA" : s.preco ? brl(s.preco) : "GRÁTIS";
      return `<button class="card${s.id === selected ? " on" : ""}${owned(s.id) ? " owned" : ""}" data-skin="${s.id}">
        ${s.tipo === "pintura" ? swatch(s) : `<i class="icon">${ICON[s.modelo] ?? "★"}</i>`}
        <span>${s.nome}</span><em>${tag}</em></button>`;
    }).join("");

    const s = SKINS[selected];
    let detail;
    if (!d) {
      detail = `<p>Experimente à vontade. Para comprar, entre com seu usuário.</p><button class="play-button wide" data-act="login">ENTRAR</button>`;
    } else if (owned(s.id)) {
      const wearing = e.pintura === s.id || e.acessorio === s.id;
      detail = wearing
        ? s.tipo === "acessorio"
          ? `<button class="act act-out" data-act="tirar">TIRAR ${s.nome.toUpperCase()}</button>`
          : `<p>Você está vestindo esta.</p>`
        : `<button class="play-button wide" data-act="vestir">VESTIR</button>`;
    } else {
      const missing = s.preco - d.conta;
      const total = account.total, per = account.perRun;
      const runs = (rate) => runsText(runsUntil(s.preco, total, per, rate));
      const plan = total >= s.preco
        ? `Você tem ${brl(total)} no total: saque do cofrinho para a conta e compre.`
        : `Faltam ${brl(s.preco - total)}. Guardando, ${runs(0)}; investindo, ${runs(RATES.investimento)}.`;
      detail = `
        <button class="play-button wide" data-act="comprar" ${missing > 0 ? "disabled" : ""}>COMPRAR · ${brl(s.preco)}</button>
        ${missing > 0 ? `<p class="hint-line">${plan}</p>` : ""}
        <button class="act act-goal" data-act="meta">${account.goal === s.id ? "ESTA É SUA META ✓" : "QUERO ESTA (VIRAR META)"}</button>`;
    }
    body.innerHTML = `
      <p class="lead">Toque numa skin para provar no Levi.</p>
      <div class="cards">${cards}</div>
      <div class="detail"><h3>${s.nome}</h3>${detail}<p class="msg" role="status">${message}</p></div>`;
  };

  body.addEventListener("click", async (ev) => {
    const btn = ev.target.closest("button");
    if (!btn) return;
    hooks.sfx("click");
    message = "";
    if (btn.dataset.skin) {
      selected = btn.dataset.skin;
      tryOn();
      return render();
    }
    const act = btn.dataset.act;
    if (act === "login") return hooks.login();
    if (act === "meta") {
      account.goal = selected;
      message = "Meta marcada! Ela aparece no menu com quanto falta.";
      return render();
    }
    btn.disabled = true;
    try {
      if (act === "comprar") {
        await account.buy(selected);
        hooks.sfx("powerup");
        message = "É sua! 🎉";
      } else if (act === "vestir") await account.wear(selected);
      else if (act === "tirar") await account.wear(null);
    } catch (err) {
      message = err.message;
    }
    tryOn();
    render();
  });

  account.addEventListener("change", () => !sheet.hidden && render());
  return {
    show() {
      const e = equipped();
      selected = e.pintura;
      message = "";
      render();
    },
  };
}
