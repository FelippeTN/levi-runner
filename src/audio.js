// Efeitos e música (WAVs gerados por tools/make_sfx.py). M liga/desliga o som.

import { Phase } from "./game.js";

const CLIPS = { jump: 0.5, land: 0.5, roll: 0.6, swipe: 0.35, coin: 0.45, stumble: 0.8, crash: 0.9, powerup: 0.6, click: 0.5 };
const MUSIC_VOLUME = 0.45;

export class Audio {
  muted = false;
  /** sequência de moedas seguidas: o tom sobe */
  #streak = 0;
  #sinceCoin = 9;
  #buffers = {};
  #musicStarted = false;

  constructor() {
    this.ctx = new AudioContext();
    this.master = this.ctx.createGain();
    this.master.connect(this.ctx.destination);
    // o navegador cria o contexto suspenso; o primeiro gesto do jogador libera o som
    const resume = () => this.ctx.state === "suspended" && this.ctx.resume().catch(() => {});
    for (const e of ["pointerdown", "keydown", "touchend"]) addEventListener(e, resume, { capture: true });
  }

  /** Carrega os sons em segundo plano; um que falhe só fica mudo. */
  load() {
    return Promise.all(
      [...Object.keys(CLIPS), "music"].map(async (name) => {
        try {
          const data = await (await fetch(`/sfx/${name}.wav`)).arrayBuffer();
          this.#buffers[name] = await this.ctx.decodeAudioData(data);
        } catch (err) {
          console.warn(`som ${name} não carregou`, err);
        }
      }),
    );
  }

  toggleMute() {
    this.muted = !this.muted;
    this.master.gain.value = this.muted ? 0 : 1;
  }

  /** Efeito avulso (botões, rendimento no banco). */
  sfx(name, rate = 1) {
    if (!this.muted) this.#play(name, CLIPS[name], rate);
  }

  #play(name, volume, rate = 1, loop = false) {
    const buffer = this.#buffers[name];
    if (!buffer) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = loop;
    src.playbackRate.value = rate;
    const gain = this.ctx.createGain();
    gain.gain.value = volume;
    src.connect(gain).connect(this.master);
    src.start();
  }

  /**
   * @param {import("./game.js").Game} game
   * @param {import("./game.js").Events} events
   */
  update(dt, game, events) {
    // a música começa no primeiro "correr" (gesto do usuário libera o áudio no navegador)
    if (game.phase === Phase.Playing && !this.#musicStarted && this.#buffers.music) {
      this.#musicStarted = true;
      this.#play("music", MUSIC_VOLUME, 1, true);
    }
    this.#sinceCoin += dt;
    for (const name of events.sfx) {
      let rate = 1;
      if (name === "coin") {
        this.#streak = this.#sinceCoin < 0.5 ? this.#streak + 1 : 0;
        this.#sinceCoin = 0;
        rate = 1 + 0.06 * Math.min(this.#streak, 8);
      }
      if (!this.muted) this.#play(name, CLIPS[name], rate);
    }
  }
}
