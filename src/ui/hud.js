// HUD da corrida em HTML por cima do jogo: pontos, carteira, reserva, investimento, dinheiro voando,
// nome do bairro e pausa. Só escreve no DOM o que mudou.

import { zoneAt } from "../config.js";
import { brl } from "../edu/economy.js";
import { Phase } from "../game.js";

const $ = (id) => document.getElementById(id);

export class Hud {
  #screen = null;
  #text = new Map();
  #cash = 0;
  #pop = 0;
  #zone = null;
  #zoneFade = 0;

  /** @param {{onPause: () => void, onSound: () => void}} actions */
  constructor({ onPause, onSound }) {
    this.panels = [...document.querySelectorAll("#hud [data-show]")];
    this.cashEl = $("cash");
    this.zoneEl = $("zone");
    this.floaters = $("floaters");
    $("pause").addEventListener("click", onPause);
    $("sound").addEventListener("click", onSound);
  }

  /** Texto de um elemento, só quando muda; vazio esconde (para os potes de reserva e investimento). */
  #set(id, value, hideEmpty = false) {
    if (this.#text.get(id) === value) return;
    this.#text.set(id, value);
    const el = $(id);
    el.textContent = value;
    if (hideEmpty) el.hidden = !value;
  }

  /** "+R$ 50 na reserva", "A casa ganhou": sobe, cresce e some. */
  float({ text, good, big }) {
    const el = document.createElement("div");
    el.className = `floater ${good ? "good" : "bad"}${big ? " big" : ""}`;
    el.textContent = text;
    el.addEventListener("animationend", () => el.remove());
    this.floaters.append(el);
  }

  /** @returns {"menu" | "playing" | "paused"} */
  screenOf(game, paused) {
    const playing = game.phase === Phase.Playing || game.phase === Phase.Dying;
    return !playing ? "menu" : paused ? "paused" : "playing";
  }

  /** @param {number} dt tempo de jogo (zero no pause) */
  update(dt, game, paused, muted, events) {
    const screen = this.screenOf(game, paused);
    if (screen !== this.#screen) {
      this.#screen = screen;
      document.body.dataset.screen = screen;
      for (const el of this.panels) el.hidden = !el.dataset.show.split(" ").includes(screen);
    }
    for (const m of events.money) this.float(m);

    // dinheiro novo na carteira: o número dá um pulo
    const w = game.wallet;
    if (w.cash !== this.#cash) {
      this.#pop = w.cash > this.#cash ? 1 : 0;
      this.#cash = w.cash;
    }
    if (this.#pop > 0 || this.cashEl.style.transform) {
      this.#pop = Math.max(this.#pop - 4 * dt, 0);
      this.cashEl.style.transform = this.#pop > 0 ? `scale(${1 + 0.45 * this.#pop})` : "";
    }

    // nome do bairro ao entrar nele
    const here = zoneAt(game.distance);
    if (game.phase === Phase.Playing && this.#zone !== here) {
      this.#zone = here;
      this.#zoneFade = 2.5;
      this.#set("zone", here.toUpperCase());
    }
    if (game.phase === Phase.Ready) this.#zone = null;
    this.#zoneFade = Math.max(this.#zoneFade - dt, 0);
    this.zoneEl.style.opacity = screen === "playing" ? Math.min(this.#zoneFade, 1) : 0;

    this.#set("score", String(game.score).padStart(6, "0"));
    this.#set("cash", brl(w.cash));
    this.#set("reserve", w.reserve > 0 ? `RESERVA ${brl(w.reserve)}` : "", true);
    this.#set("invested", w.invested > 0 ? `INVESTIDO ${brl(w.invested)}` : "", true);
    this.#set("debt", w.debt >= 1 ? `DÍVIDA ${brl(w.debt)}` : "", true);
    this.#set("sound", muted ? "🔇" : "🔊");
    $("sound").ariaLabel = muted ? "Ligar som" : "Desligar som";
  }
}
