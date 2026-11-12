// Loja do Levi: escolher uma skin já veste o Levi do menu (provador); comprar só com o saldo da conta (e, se o
// jogador quiser, o que faltar sai do cofrinho). Cada skin mostra o caminho até ela: parada na conta, no cofrinho ou
// investida, e quanto os juros pagam. As do Clube do Investidor pedem um nível, que só os rendimentos dão.

import { cofrinhoRate, exigido, pathTo, RATES, runsText, runsToYield } from "../edu/bank.js";
import { jurosPagam } from "../edu/dicas.js";
import { brl } from "../edu/economy.js";
import { SKINS } from "../skins.js";
import { clubeCard, trilha } from "./clube.js";

const LIST = Object.values(SKINS);
const FILTROS = [
  ["todas", "Todas", () => true],
  ["pintura", "Pinturas", (s) => s.tipo === "pintura" && !s.nivel],
  ["acessorio", "Acessórios", (s) => s.tipo === "acessorio" && !s.nivel],
  ["clube", "💎 Clube", (s) => !!s.nivel],
];
/** Raridade pelo preço; as do clube têm a sua. */
const raridade = (s) =>
  s.nivel ? ["clube", "CLUBE"]
  : s.preco <= 100000 ? ["comum", "COMUM"]
  : s.preco <= 300000 ? ["raro", "RARO"]
  : s.preco <= 800000 ? ["epico", "ÉPICO"]
  : ["lendario", "LENDÁRIO"];

/** amostra da pintura no cartão: cabeça, detalhes e corpo */
const swatch = (s) => {
  const c = s.cores ?? { branco: "#d9dde8", azul: "#1b6fe0", corpo: "#ffffff" };
  return `<i class="swatch" style="--a:${c.branco};--b:${c.azul};--c:${c.corpo}"></i>`;
};
const ICON = { oculos: "😎", panama: "🎩", prancha: "🏄", cofrinho: "🐷", coroa: "👑" };
const bar = (p) => `<i class="bar" style="--p:${Math.min(100, p * 100).toFixed(1)}%"></i>`;

/**
 * @param {HTMLElement} sheet
 * @param {import("../account.js").Account} account
 * @param {{preview: (pintura: string, acessorio: string | null, back: boolean) => void, sfx: (name: string) => void, login: () => void, bank: () => void}} hooks
 */
export function shopPanel(sheet, account, hooks) {
  const body = sheet.querySelector(".sheet-body");
  const balance = sheet.querySelector(".month");
  let selected = "classico";
  let filtro = "todas";
  let message = "";

  const equipped = () => ({ pintura: account.data?.pintura ?? "classico", acessorio: account.data?.acessorio ?? null });

  /** Veste no provador a skin escolhida, mantendo a outra metade do que está equipado. */
  const tryOn = () => {
    const e = equipped(), s = SKINS[selected];
    hooks.preview(s.tipo === "pintura" ? s.id : e.pintura, s.tipo === "acessorio" ? s.id : e.acessorio, !!s.costas);
  };

  /** Parado, no cofrinho ou investindo: quantas corridas cada um leva e quanto os juros pagam. */
  const plano = (s) => {
    const total = account.total, per = account.perRun;
    const caminhos = [
      ["slow", "🐌", "Parado na conta", pathTo(s.preco, total, per, 0)],
      ["", "🐷", "No cofrinho", pathTo(s.preco, total, per, cofrinhoRate(RATES.selic))],
      ["best", "🚀", "Investindo", pathTo(s.preco, total, per, RATES.investimento)],
    ];
    const ganho = caminhos[0][3].runs - caminhos[2][3].runs;
    return `
      <div class="plano">
        <h4>COMO CHEGAR LÁ · faltam ${brl(s.preco - total)}</h4>
        <ol>${caminhos
          .map(([cls, ic, nome, p]) => `<li class="${cls}"><span>${ic} ${nome}</span><b>${runsText(p.runs)}</b>${cls === "slow" ? "<small>o dinheiro não trabalha</small>" : `<small>${jurosPagam(p.juros, s.preco)}</small>`}</li>`)
          .join("")}</ol>
        ${ganho > 0 && Number.isFinite(ganho) ? `<p class="plano-ganho">Investindo, ela chega <b>${ganho} corrida${ganho === 1 ? "" : "s"} antes</b>.</p>` : ""}
        <p class="note">Estimativa com a média do que suas últimas corridas depositaram (${brl(per)}) e as taxas de hoje.</p>
      </div>`;
  };

  const detailFor = (s, d) => {
    const [rar, rarNome] = raridade(s);
    const head = `<div class="detail-head"><h3>${s.nome}</h3><i class="rar-chip rar-${rar}">${rarNome}</i></div>
      ${s.desc ? `<p class="desc">${s.desc}</p>` : ""}`;
    const req = exigido(s, account.rendimentos);
    const lock = req.nivel && !req.liberada
      ? `<div class="lock">
          <p>🔒 Exclusiva do Clube do Investidor: nível <b>${req.nivel.selo} ${req.nivel.nome}</b></p>
          ${d ? `${bar(account.rendimentos / req.nivel.rendimentos)}<p class="small">Seus rendimentos: ${brl(account.rendimentos)} de ${brl(req.nivel.rendimentos)}. Moeda de corrida não conta: só os juros do banco.</p>
            <p class="lock-plano">🚀 Investindo seus ${brl(account.total)} e o que cada corrida trouxer, os juros chegam lá em <b>${runsText(runsToYield(req.nivel.rendimentos - account.rendimentos, account.total, account.perRun, RATES.investimento))}</b>. Parado na conta, nunca.</p>` : ""}
        </div>`
      : "";
    if (!d) return `${head}${lock}<p>Experimente à vontade. Para comprar, entre com seu usuário.</p><button class="play-button wide" data-act="login">ENTRAR</button>`;

    const e = equipped();
    const owned = s.id === "classico" || d.skins.includes(s.id);
    if (owned) {
      const wearing = e.pintura === s.id || e.acessorio === s.id;
      return head + (wearing
        ? s.tipo === "acessorio"
          ? `<button class="act act-out" data-act="tirar">TIRAR ${s.nome.toUpperCase()}</button>`
          : `<p>Você está vestindo esta.</p>`
        : `<button class="play-button wide" data-act="vestir">VESTIR</button>`);
    }

    const doCofrinho = Math.max(0, s.preco - d.conta);
    let comprar;
    if (!req.liberada) comprar = `<button class="play-button wide" disabled>🔒 ${brl(s.preco)}</button>`;
    else if (!doCofrinho) comprar = `<button class="play-button wide" data-act="comprar">COMPRAR · ${brl(s.preco)}</button>`;
    else if (doCofrinho <= d.cofrinho)
      comprar = `<button class="play-button wide" data-act="comprar-cofrinho">COMPRAR · ${brl(s.preco)}</button>
        <p class="hint-line">${d.conta > 0 ? `${brl(d.conta)} da conta + ` : ""}${brl(doCofrinho)} do cofrinho</p>`;
    else comprar = `<button class="play-button wide" disabled>COMPRAR · ${brl(s.preco)}</button>`;

    const semSaldo = doCofrinho > d.cofrinho;
    const preso = semSaldo && account.total >= s.preco
      ? `<p class="hint-line">Você tem ${brl(account.total)} no total, mas parte está em investimentos com prazo: espere vencer ou resgate no banco.</p>`
      : "";
    return `${head}${lock}${comprar}${preso}
      ${semSaldo && account.total < s.preco && req.liberada ? plano(s) : ""}
      ${semSaldo || !req.liberada ? `<button class="act act-invest" data-act="banco">🏦 IR AO BANCO FAZER O DINHEIRO RENDER</button>` : ""}
      <button class="act act-goal" data-act="meta">${account.goal === s.id ? "ESTA É SUA META ✓" : "QUERO ESTA (VIRAR META)"}</button>`;
  };

  const render = () => {
    const d = account.data;
    const owned = (id) => id === "classico" || !!d?.skins.includes(id);
    const e = equipped();
    balance.textContent = d ? `CONTA ${brl(d.conta)}` : "";
    const show = FILTROS.find(([id]) => id === filtro)[2];
    const cards = LIST.filter(show).map((s) => {
      const wearing = e.pintura === s.id || e.acessorio === s.id;
      const locked = !exigido(s, account.rendimentos).liberada;
      const tag = wearing ? "VESTINDO" : owned(s.id) ? "SUA" : locked ? `🔒 ${brl(s.preco)}` : s.preco ? brl(s.preco) : "GRÁTIS";
      const [rar, rarNome] = raridade(s);
      const cls = ["card", `rar-${rar}`, s.id === selected && "on", owned(s.id) && "owned", locked && "locked"].filter(Boolean).join(" ");
      return `<button class="${cls}" data-skin="${s.id}">
        <i class="rar-chip rar-${rar}">${rarNome}</i>
        ${s.tipo === "pintura" ? swatch(s) : `<i class="icon">${ICON[s.modelo] ?? "★"}</i>`}
        <span>${s.nome}</span><em>${tag}</em>
        ${d && !owned(s.id) ? bar(account.total / s.preco) : ""}</button>`;
    }).join("");

    body.innerHTML = `
      ${d ? clubeCard(account.rendimentos, "clube") : `<p class="lead">Toque numa skin para provar no Levi. As do <b>💎 Clube</b> são para quem deixa o dinheiro render no banco.</p>`}
      <div class="chips filtros" role="tablist">${FILTROS.map(([id, nome]) => `<button role="tab" data-filtro="${id}" aria-selected="${id === filtro}">${nome}</button>`).join("")}</div>
      ${filtro === "clube" ? trilha(account.rendimentos) : ""}
      <div class="cards">${cards}</div>
      <div class="detail">${detailFor(SKINS[selected], d)}<p class="msg" role="status">${message}</p></div>`;
  };

  /** No celular a loja é baixa: depois de escolher, rola até o detalhe. */
  const showDetail = () => body.querySelector(".detail")?.scrollIntoView({ block: "nearest", behavior: "smooth" });

  body.addEventListener("click", async (ev) => {
    const btn = ev.target.closest("button");
    if (!btn) return;
    hooks.sfx("click");
    message = "";
    if (btn.dataset.skin) {
      selected = btn.dataset.skin;
      tryOn();
      render();
      return showDetail();
    }
    if (btn.dataset.filtro) {
      filtro = btn.dataset.filtro;
      return render();
    }
    const act = btn.dataset.act;
    if (act === "login") return hooks.login();
    if (act === "banco") return hooks.bank();
    if (act === "clube") {
      filtro = "clube";
      return render();
    }
    if (act === "meta") {
      account.goal = selected;
      message = "Meta marcada! Ela aparece no menu com quanto falta.";
      return render();
    }
    btn.disabled = true;
    try {
      if (act === "comprar" || act === "comprar-cofrinho") {
        await account.buy(selected, act === "comprar-cofrinho");
        hooks.sfx("powerup");
        message = account.rendimentos >= 100 ? `É sua! 🎉 Até hoje seu dinheiro rendeu ${brl(account.rendimentos)} sozinho no banco.` : "É sua! 🎉";
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
