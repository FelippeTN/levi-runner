// Dinheiro dentro da corrida: carteira, reserva (escudo), investimento (juros compostos), portais.
// Tudo em centavos. Sem three nem DOM: roda nos testes.

import catalog from "./catalog.json" with { type: "json" };

const C = catalog.corrida;
export const COIN = catalog.moeda;
export const SHOCK = catalog.imprevisto;
/** preço do ímã de moedas no portal COMPRAR */
export const MAGNET_PRICE = 10000;

export const PORTALS = ["poupar", "investir", "comprar", "apostar"];

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
/** centavos → "R$ 1.234" */
export const brl = (cents) => money.format(Math.round(cents) / 100);

export class Wallet {
  cash = 0;
  reserve = 0;
  /** com fração de centavo: os juros entram aos pouquinhos */
  invested = 0;
  ledger = { moedas: 0, juros: 0, compras: 0, apostas: 0, reservaUsada: 0, batidaSemReserva: false, investiu: false, poupou: false };
  #pendingInterest = 0;

  collect() {
    this.cash += COIN;
    this.ledger.moedas += COIN;
  }

  /**
   * Passou por um portal.
   * @param {"poupar" | "investir" | "comprar" | "apostar"} kind
   * @param {() => number} rand inteiro sem sinal (o gerador do jogo)
   * @returns {{text: string, good: boolean, magnet?: boolean}} o que mostrar na tela
   */
  choose(kind, rand) {
    const part = Math.floor(this.cash * C.parteDoPortal);
    if (kind === "poupar") {
      this.cash -= part;
      this.reserve += part;
      this.ledger.poupou ||= part > 0;
      return { text: part ? `+${brl(part)} na reserva` : "Carteira vazia", good: part > 0 };
    }
    if (kind === "investir") {
      this.cash -= part;
      this.invested += part;
      this.ledger.investiu ||= part > 0;
      return { text: part ? `${brl(part)} investidos` : "Carteira vazia", good: part > 0 };
    }
    if (kind === "comprar") {
      if (this.cash < MAGNET_PRICE) return { text: "Sem dinheiro para comprar", good: false };
      this.cash -= MAGNET_PRICE;
      this.ledger.compras += MAGNET_PRICE;
      return { text: `Ímã de moedas! −${brl(MAGNET_PRICE)}`, good: true, magnet: true };
    }
    const stake = this.cash;
    if (!stake) return { text: "Nada para apostar", good: false };
    // a casa sempre ganha: 1 em `apostaUmEm` dobra, o resto perde tudo
    if (rand() % C.apostaUmEm === 0) {
      this.cash += stake;
      this.ledger.apostas -= stake;
      return { text: `Dobrou… desta vez. +${brl(stake)}`, good: true };
    }
    this.cash = 0;
    this.ledger.apostas += stake;
    return { text: `A casa ganhou. −${brl(stake)}`, good: false };
  }

  /** Juros compostos sobre o investido por `meters` corridos; devolve o ganho. */
  tick(meters) {
    if (this.invested <= 0 || meters <= 0) return 0;
    const gain = this.invested * ((1 + C.jurosPor100m) ** (meters / 100) - 1);
    this.invested += gain;
    this.ledger.juros += gain;
    this.#pendingInterest += gain;
    return gain;
  }

  /** Juros acumulados desde o último aviso, se já passaram de `min` centavos (para o "+R$ X" não piscar a cada quadro). */
  takeInterest(min = 100) {
    if (this.#pendingInterest < min) return 0;
    const v = this.#pendingInterest;
    this.#pendingInterest = 0;
    return v;
  }

  /** Bateu: a reserva paga o imprevisto e o Levi segue. */
  absorbCrash() {
    if (this.reserve >= SHOCK) {
      this.reserve -= SHOCK;
      this.ledger.reservaUsada++;
      return true;
    }
    this.ledger.batidaSemReserva = true;
    return false;
  }

  get total() {
    return Math.round(this.cash + this.reserve + this.invested);
  }
}

const WEIGHTS = {
  // Copacabana: consumo; Lapa (Centro financeiro): investir; Santa Teresa: poupar e longo prazo
  Copacabana: { poupar: 2, investir: 2, comprar: 3, apostar: 3 },
  Lapa: { poupar: 2, investir: 4, comprar: 2, apostar: 2 },
  "Santa Teresa": { poupar: 4, investir: 2, comprar: 2, apostar: 2 },
};

/** Três portais diferentes para as três faixas, sorteados com o peso do bairro. */
export function portalKinds(zone, rand) {
  const pool = { ...WEIGHTS[zone] };
  const out = [];
  while (out.length < 3) {
    const total = Object.values(pool).reduce((a, b) => a + b, 0);
    let r = rand() % total;
    for (const [kind, w] of Object.entries(pool)) {
      if ((r -= w) < 0) {
        out.push(kind);
        delete pool[kind];
        break;
      }
    }
  }
  return out;
}
