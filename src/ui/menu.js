// Menu de início e fim de jogo: título, extrato da corrida, meta, barra JOGAR | BANCO | LOJA e painéis.

import { RATES, runsText, runsUntil } from "../edu/bank.js";
import { pickTip } from "../edu/dicas.js";
import { brl } from "../edu/economy.js";
import catalog from "../edu/catalog.json" with { type: "json" };
import { Phase } from "../game.js";

const $ = (id) => document.getElementById(id);
const SKINS = Object.fromEntries(catalog.skins.map((s) => [s.id, s]));

export class Menu {
  /** @type {null | "bank" | "shop"} */
  panel = null;
  #phase = null;

  /**
   * @param {import("../account.js").Account} account
   * @param {{onPlay: () => void, onOpen: (name: string) => void, onClose: () => void, sfx: (name: string) => void, panels: {bank: {show(): void}, shop: {show(): void}}}} hooks
   */
  constructor(account, hooks) {
    this.account = account;
    this.hooks = hooks;
    const click = (id, fn) =>
      $(id).addEventListener("click", () => {
        hooks.sfx("click");
        fn();
      });
    click("play", hooks.onPlay);
    click("open-bank", () => this.open("bank"));
    click("open-shop", () => this.open("shop"));
    click("goal", () => this.open("shop"));
    $("backdrop").addEventListener("click", () => this.close());
    for (const b of document.querySelectorAll(".sheet [data-close]")) b.addEventListener("click", () => this.close());
    addEventListener("keydown", (e) => e.code === "Escape" && this.panel && this.close());
    account.addEventListener("change", () => this.#renderGoal());
  }

  open(name) {
    if (this.panel) this.close();
    this.panel = name;
    document.body.classList.add("panel-open");
    this.hooks.onOpen(name);
    $("backdrop").hidden = false;
    $(name).hidden = false;
    this.hooks.panels[name].show();
  }

  close() {
    if (!this.panel) return;
    $(this.panel).hidden = true;
    $("backdrop").hidden = true;
    document.body.classList.remove("panel-open");
    this.panel = null;
    this.hooks.onClose();
  }

  /** Troca título e extrato quando a fase muda. */
  update(game) {
    if (game.phase === this.#phase) return;
    this.#phase = game.phase;
    const over = game.phase === Phase.Over;
    $("title").textContent = over ? "FIM DE JOGO" : "LEVI RUNNER";
    $("banner").hidden = over;
    $("statement").hidden = !over;
    if (game.phase === Phase.Ready) this.#renderGoal();
  }

  /**
   * Extrato da corrida que acabou; o depósito no banco chega depois (promessa do servidor).
   * @param {import("../game.js").Game} game
   * @param {Promise<null | {deposito: number, mes: boolean, cofrinho: number, investimento: number, liberado: number}>} deposit
   */
  statement(game, deposit) {
    const l = game.wallet.ledger;
    const rows = [
      ["Moedas", `+${brl(l.moedas)}`, "good"],
      l.juros >= 1 && ["Juros recebidos", `+${brl(l.juros)}`, "good"],
      l.compras && ["Compras", `−${brl(l.compras)}`, "bad"],
      l.apostas > 0 && ["Apostas", `−${brl(l.apostas)}`, "bad"],
      l.apostas < 0 && ["Apostas (sorte, desta vez)", `+${brl(-l.apostas)}`, ""],
      l.reservaUsada && ["Reserva te salvou", `${l.reservaUsada}×`, "good"],
      ["Patrimônio", brl(game.wallet.total), "total"],
    ].filter(Boolean);
    $("statement-rows").innerHTML = rows.map(([k, v, c]) => `<div class="${c}"><dt>${k}</dt><dd>${v}</dd></div>`).join("");
    $("tip").textContent = pickTip(l);
    const dep = $("statement-deposit");
    dep.textContent = this.account.data ? "Guardando na sua conta…" : "Entre com seu usuário para guardar esse dinheiro no Banco do Levi.";
    deposit
      .then((r) => {
        if (!r) return;
        const yieldText = r.cofrinho + r.investimento ? ` · seu dinheiro guardado rendeu +${brl(r.cofrinho + r.investimento)}` : "";
        dep.textContent = r.mes
          ? `+${brl(r.deposito)} na sua conta${yieldText}`
          : `+${brl(r.deposito)} na sua conta · corrida curta: o mês só conta a partir de ${catalog.banco.metrosParaMes} m`;
      })
      .catch((err) => (dep.textContent = `Não deu para guardar: ${err.message}`));
  }

  /** Chip da meta: quanto falta para a skin escolhida e quantas corridas, guardando ou investindo. */
  #renderGoal() {
    const el = $("goal");
    const skin = SKINS[this.account.goal];
    const d = this.account.data;
    if (!skin || !d) {
      el.hidden = true;
      return;
    }
    el.hidden = false;
    if (d.skins.includes(skin.id)) {
      el.innerHTML = `<b>META CUMPRIDA!</b> ${skin.nome} é sua · escolha outra na loja`;
      el.style.setProperty("--p", "100%");
      return;
    }
    const total = this.account.total, per = this.account.perRun;
    const saving = runsUntil(skin.preco, total, per, 0), investing = runsUntil(skin.preco, total, per, RATES.investimento);
    el.style.setProperty("--p", `${Math.min(100, (100 * total) / skin.preco).toFixed(1)}%`);
    el.innerHTML =
      `<b>META: ${skin.nome}</b> ${brl(total)} de ${brl(skin.preco)}` +
      `<small>faltam ${runsText(saving)} · investindo, ${runsText(investing)}</small>`;
  }
}
