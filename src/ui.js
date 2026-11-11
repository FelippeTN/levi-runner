// HUD em HTML por cima do jogo. Só escreve no DOM o que mudou.

import { zoneAt } from "./config.js";
import { Phase } from "./game.js";

const $ = (id) => document.getElementById(id);

export class Hud {
  #screen = null;
  #text = new Map();
  #coins = 0;
  #pop = 0;
  #zone = null;
  #zoneFade = 0;
  #time = 0;

  /** @param {{onPause: () => void, onSound: () => void}} actions */
  constructor({ onPause, onSound }) {
    this.panels = [...document.querySelectorAll("#hud [data-show]")];
    this.coinsEl = $("coins");
    this.zoneEl = $("zone");
    this.ctaEl = $("cta");
    $("pause").addEventListener("click", onPause);
    $("sound").addEventListener("click", onSound);
  }

  #set(id, value) {
    if (this.#text.get(id) === value) return;
    this.#text.set(id, value);
    $(id).textContent = value;
  }

  /**
   * @param {number} dt tempo de jogo (zero no pause)
   * @param {number} realDt tempo real (animações do menu seguem no pause)
   */
  update(dt, realDt, game, paused, muted) {
    const playing = game.phase === Phase.Playing || game.phase === Phase.Dying;
    const screen = !playing ? "menu" : paused ? "paused" : "playing";
    if (screen !== this.#screen) {
      this.#screen = screen;
      for (const el of this.panels) el.hidden = !el.dataset.show.split(" ").includes(screen);
    }

    // moeda nova: o número dá um pulo
    if (game.coins !== this.#coins) {
      this.#pop = game.coins > this.#coins ? 1 : 0;
      this.#coins = game.coins;
    }
    if (this.#pop > 0 || this.coinsEl.style.transform) {
      this.#pop = Math.max(this.#pop - 4 * dt, 0);
      this.coinsEl.style.transform = this.#pop > 0 ? `scale(${1 + (14 / 30) * this.#pop})` : "";
    }

    // nome do bairro ao entrar nele
    const here = zoneAt(game.distance);
    if (game.phase === Phase.Playing && this.#zone !== here) {
      this.#zone = here;
      this.#zoneFade = 2.5;
      this.#set("zone", here.toUpperCase());
    }
    this.#zoneFade = Math.max(this.#zoneFade - dt, 0);
    this.zoneEl.style.opacity = screen === "playing" ? Math.min(this.#zoneFade, 1) : 0;

    this.#time += realDt;
    if (screen === "menu") this.ctaEl.style.transform = `rotate(-4deg) scale(${1 + 0.06 * Math.sin(this.#time * 5)})`;

    const over = game.phase === Phase.Over;
    this.#set("score", String(game.score).padStart(6, "0"));
    this.#set("coins", String(game.coins));
    this.#set("title", over ? "FIM DE\nJOGO" : "LEVI\nRUNNER");
    this.#set("banner", over ? `${game.score} pontos  •  ${Math.floor(game.distance)} m  •  ${game.coins} moedas` : "Rio de Janeiro");
    this.#set("cta", over ? "TOQUE PARA JOGAR DE NOVO" : "TOQUE PARA JOGAR");
    this.#set("sound", muted ? "SOM: DESLIGADO" : "SOM: LIGADO");
  }
}
