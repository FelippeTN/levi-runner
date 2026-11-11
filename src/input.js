// Teclado e toque/clique viram ações por quadro: teclas apertadas, toque curto (tap) ou arrasto (swipe).

const SWIPE_MIN = 30; // px: abaixo disso é toque
const GAME_KEYS = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Space"]);

/**
 * @typedef {object} Frame
 * @property {boolean} tap
 * @property {(...codes: string[]) => boolean} pressed tecla apertada neste quadro ou arrasto na direção da seta
 */

export class Input {
  #keys = new Set();
  #tap = false;
  /** @type {string | null} seta equivalente ao arrasto */
  #swipe = null;
  #start = null;

  /** @param {HTMLElement} surface só toques na área do jogo contam (botões do HUD ficam por cima) */
  constructor(surface) {
    addEventListener("keydown", (e) => {
      // digitando no login não é jogo
      if (e.repeat || e.target.closest?.("input, form")) return;
      if (GAME_KEYS.has(e.code)) e.preventDefault();
      this.#keys.add(e.code);
    });
    surface.addEventListener("pointerdown", (e) => {
      this.#start = { x: e.clientX, y: e.clientY, id: e.pointerId };
      surface.setPointerCapture(e.pointerId);
    });
    surface.addEventListener("pointerup", (e) => {
      if (this.#start?.id !== e.pointerId) return;
      const dx = e.clientX - this.#start.x, dy = e.clientY - this.#start.y;
      this.#start = null;
      if (Math.hypot(dx, dy) < SWIPE_MIN) this.#tap = true;
      else if (Math.abs(dx) > Math.abs(dy)) this.#swipe = dx > 0 ? "ArrowRight" : "ArrowLeft";
      else this.#swipe = dy < 0 ? "ArrowUp" : "ArrowDown"; // y da tela cresce para baixo
    });
    surface.addEventListener("pointercancel", () => (this.#start = null));
  }

  /** Ações acumuladas desde o último quadro. @returns {Frame} */
  poll() {
    const keys = new Set(this.#keys), swipe = this.#swipe, tap = this.#tap;
    this.#keys.clear();
    this.#swipe = null;
    this.#tap = false;
    return { tap, pressed: (...codes) => codes.some((c) => keys.has(c) || c === swipe) };
  }
}
