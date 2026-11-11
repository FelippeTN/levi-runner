import { FIRST_ROW, START_SPEED } from "./config.js";
import { Wallet } from "./edu/economy.js";

export const Phase = Object.freeze({
  Ready: "ready",
  Playing: "playing",
  /** bateu: animação de queda antes do game over */
  Dying: "dying",
  Over: "over",
});

/** Estado da corrida. */
export class Game {
  constructor(seed = 0x12345678) {
    this.rng = seed >>> 0;
    this.reset();
  }

  /** Corrida nova; o gerador segue de onde parou para o cenário não se repetir. */
  reset() {
    this.phase = Phase.Ready;
    this.speed = START_SPEED;
    this.distance = 0;
    this.coins = 0;
    /** dinheiro da corrida: carteira, reserva e investimento */
    this.wallet = new Wallet();
    this.nextSpawn = FIRST_ROW;
    /** segundos desde o último tropeço (dois em 3 s = fim) */
    this.sinceStumble = 99;
    this.dying = 0;
  }

  /** Distância + patrimônio em reais: o ranking premia quem guarda e investe, não só quem corre. */
  get score() {
    return Math.max(0, Math.floor(this.distance) + Math.floor(this.wallet.total / 100));
  }

  /** xorshift32: determinístico, a mesma semente monta o mesmo Rio. */
  rand() {
    let x = this.rng;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.rng = x >>> 0;
    return this.rng;
  }

  pick(n) {
    return this.rand() % n;
  }
}

/** Mensagens do quadro (som, tremida, partículas); quem consome lê, o laço principal limpa. */
export class Events {
  /** @type {string[]} jump | land | roll | swipe | coin | stumble | crash | powerup */
  sfx = [];
  /** @type {number[]} trauma da câmera (0..1) */
  shake = [];
  /** @type {{pos: import("three").Vector3, kind: "dust" | "sparkle" | "debris"}[]} */
  burst = [];
  /** @type {{text: string, good: boolean, big?: boolean}[]} dinheiro entrando ou saindo, mostrado na tela */
  money = [];

  clear() {
    this.sfx.length = this.shake.length = this.burst.length = this.money.length = 0;
  }
}
