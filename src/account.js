// Conta do jogador no Banco do Levi. O servidor é dono do dinheiro; aqui fica a cópia para mostrar.

import { api, loggedIn } from "./api.js";
import { clube, setRates } from "./edu/bank.js";

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
  /**
   * Aplicação: `tipo` pos | pre | ipca; `taxa` (fração ao mês) e `taxa_aa` (% ao ano) travadas no pré e no IPCA+ (juro real).
   * @typedef {{id: number, tipo: "pos" | "pre" | "ipca", valor: number, aplicado: number, libera_em: number, taxa?: number, taxa_aa?: number}} Aplicacao
   * @type {null | {conta: number, cofrinho: number, aplicacoes: Aplicacao[], mes: number, skins: string[], pintura: string, acessorio: string | null, rendimentos: number}}
   */
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

  /**
   * Fim de corrida: recorde, depósito e rendimento do mês. Sem login, nada (a corrida só não é guardada).
   * Se os juros fizeram subir de nível no Clube do Investidor, o resumo traz o nível novo em `subiu`.
   */
  async finishRun({ pontos, distancia, patrimonio }) {
    if (!this.data) return null;
    const antes = clube(this.rendimentos).atual;
    const r = await api("/api/corrida", { pontos, distancia: Math.floor(distancia), patrimonio });
    const depois = clube(r.rendimentos ?? 0).atual;
    r.resumo.subiu = depois.id !== antes.id ? depois : null;
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
    return this.data.resumo;
  }
  /** guardar, sacar, investir (`extra.tipo`) ou resgatar (`extra.id`); o resgate devolve {resgate, na_curva}. */
  bank(acao, valor, extra = {}) {
    return this.#post("/api/banco", { acao, valor, ...extra });
  }
  /** Compra com a conta; com `cofrinho`, o que faltar sai do cofrinho. */
  buy(skin, cofrinho = false) {
    return this.#post("/api/loja", { skin, cofrinho });
  }
  wear(skin) {
    return this.#post("/api/vestir", { skin });
  }

  /** Tudo que o jogador tem: conta + cofrinho + investimentos. */
  get total() {
    const d = this.data;
    return d ? d.conta + d.cofrinho + d.aplicacoes.reduce((s, a) => s + a.valor, 0) : 0;
  }

  /** Juros que o banco já pagou (cofrinho + investimentos), o que dá o nível no Clube do Investidor. */
  get rendimentos() {
    return this.data?.rendimentos ?? 0;
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
