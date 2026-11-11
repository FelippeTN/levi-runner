// Conta do jogador no Banco do Levi. O servidor é dono do dinheiro; aqui fica a cópia para mostrar.

import { api, loggedIn } from "./api.js";
import { setRates } from "./edu/bank.js";

const GOAL = "levi-meta";
const EARNINGS = "levi-ganhos";
/** palpite de quanto uma corrida rende antes de haver histórico */
const DEFAULT_PER_RUN = 50000;

export const store = {
  get(key, fallback) {
    try {
      return JSON.parse(localStorage.getItem(key)) ?? fallback;
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // sem armazenamento (aba anônima): a meta só não é lembrada
    }
  },
};

export class Account extends EventTarget {
  /** @type {null | {conta: number, cofrinho: number, aplicacoes: {valor: number, libera_em: number}[], mes: number, skins: string[], pintura: string, acessorio: string | null}} */
  data = null;
  /** resumo da última corrida (depósito, rendimento do mês) para o banco comemorar */
  lastRun = null;

  #changed() {
    this.dispatchEvent(new Event("change"));
  }

  async load() {
    try {
      this.data = loggedIn() ? await api("/api/conta") : null;
    } catch {
      this.data = null;
    }
    // sem server.py ficam as taxas de reserva do catálogo
    await api("/api/taxas").then(setRates, () => {});
    this.#changed();
  }

  /** Fim de corrida: recorde, depósito e rendimento do mês. Sem login, nada (a corrida só não é guardada). */
  async finishRun({ pontos, distancia, patrimonio }) {
    if (!this.data) return null;
    const r = await api("/api/corrida", { pontos, distancia: Math.floor(distancia), patrimonio });
    this.lastRun = r.resumo;
    this.data = r;
    setRates(r.taxas);
    store.set(EARNINGS, [r.resumo.deposito, ...store.get(EARNINGS, [])].slice(0, 5));
    this.#changed();
    return r.resumo;
  }

  async #post(path, body) {
    this.data = await api(path, body);
    setRates(this.data.taxas);
    this.#changed();
  }
  bank(acao, valor) {
    return this.#post("/api/banco", { acao, valor });
  }
  buy(skin) {
    return this.#post("/api/loja", { skin });
  }
  wear(skin) {
    return this.#post("/api/vestir", { skin });
  }

  /** Tudo que o jogador tem: conta + cofrinho + investimentos. */
  get total() {
    const d = this.data;
    return d ? d.conta + d.cofrinho + d.aplicacoes.reduce((s, a) => s + a.valor, 0) : 0;
  }

  /** Média do que as últimas corridas depositaram. */
  get perRun() {
    const last = store.get(EARNINGS, []);
    return last.length ? last.reduce((a, b) => a + b, 0) / last.length : DEFAULT_PER_RUN;
  }

  get goal() {
    return store.get(GOAL, null);
  }
  set goal(skinId) {
    store.set(GOAL, skinId);
    this.#changed();
  }
}
