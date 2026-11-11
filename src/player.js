// Levi: entrada, física e máquina de animação.

import { AnimationMixer, Group, LoopOnce, LoopRepeat, Vector3 } from "three";
import { LANES, MAX_SPEED, START_SPEED } from "./config.js";
import { Phase } from "./game.js";
import { skinner } from "./skins.js";
import { clamp, qy, qz } from "./util.js";

export const JUMP_V = 9.5;
const GRAVITY = 26;
export const SLIDE_TIME = 0.7;
const MODEL_SCALE = 0.6;

/** Duração do pulo e do rolamento no glb: o jogo escolhe o quadro pela física. */
const SCRUB_LEN = 0.7;

export class Player {
  /** Transform do Levi (posição, giro, squash & stretch); o modelo entra como filho ao carregar. */
  root = new Group();
  /** sombra redonda no chão (definida pelo main) */
  blob = null;
  yaw = 0;
  /** provador da loja: balança devagar de um lado para o outro mostrando a skin */
  showcase = false;
  #showcaseT = 0;
  /** giro em torno do qual o provador balança (de costas para mostrar o que vai nas costas) */
  #showcaseYaw = 0;
  /** veste pintura e acessório (existe depois que o modelo carrega) */
  wear = null;

  constructor() {
    this.root.scale.setScalar(MODEL_SCALE);
    this.reset();
  }

  /** Estado de corrida nova (o giro continua de onde estava, para a volta ao menu ser suave). */
  reset() {
    this.lane = 1;
    this.prevLane = 1;
    this.y = 0;
    this.vy = 0;
    this.slide = 0;
    this.land = 0;
    this.stumble = 0;
    this.stumbleClip = "StumbleL";
    /** altura do piso embaixo (0 = chão, CAR_TOP = teto de veículo) */
    this.floor = 0;
    /** escala vertical do squash & stretch (1 = normal) */
    this.squash = 1;
    /** segundos atravessando obstáculos depois que a reserva pagou a batida */
    this.invuln = 0;
    /** segundos de ímã de moedas */
    this.magnet = 0;
  }

  setShowcase(on, back = false) {
    this.showcase = on;
    this.#showcaseT = 0;
    this.#showcaseYaw = back ? Math.PI * 0.8 : 0;
  }

  get x() {
    return this.root.position.x;
  }

  get grounded() {
    return this.y <= this.floor + 0.01;
  }

  /**
   * Coloca o modelo animado (glTF com os clipes Idle, Wave, Run, Jump, Roll, Land, StumbleL/R, Crash).
   * @param {{scene: import("three").Object3D, animations: import("three").AnimationClip[]}} gltf
   */
  attachModel(gltf) {
    gltf.scene.traverse((o) => {
      if (o.isMesh) {
        o.receiveShadow = true;
        // a caixa de recorte vem da pose de repouso; animado ele sai dela
        o.frustumCulled = false;
      }
    });
    this.root.add(gltf.scene);
    this.wear = skinner(gltf.scene);
    this.mixer = new AnimationMixer(gltf.scene);
    this.actions = Object.fromEntries(gltf.animations.map((clip) => [clip.name, this.mixer.clipAction(clip)]));
    this.clip = null;
    this.#play("Idle");
  }

  /**
   * Lê as ações do quadro.
   * @param {import("./input.js").Frame} input
   * @returns {boolean} true se começou uma corrida nova (o mundo precisa ser limpo)
   */
  input(input, game, events) {
    if (game.phase === Phase.Dying) return false;
    if (game.phase === Phase.Ready || game.phase === Phase.Over) {
      if (!(input.tap || input.pressed("Space") || input.pressed("Enter"))) return false;
      const restart = game.phase === Phase.Over;
      if (restart) {
        game.reset();
        this.reset();
      }
      game.phase = Phase.Playing;
      return restart;
    }

    const lane = this.lane;
    if (input.pressed("ArrowLeft", "KeyA") && lane > 0) this.lane--;
    if (input.pressed("ArrowRight", "KeyD") && lane < 2) this.lane++;
    if (this.lane !== lane) {
      this.prevLane = lane;
      events.sfx.push("swipe");
    }
    if ((input.pressed("ArrowUp", "KeyW") || input.pressed("Space")) && this.grounded) {
      this.vy = JUMP_V;
      this.slide = 0;
      events.sfx.push("jump");
    }
    if (input.pressed("ArrowDown", "KeyS")) {
      this.slide = SLIDE_TIME;
      this.vy = Math.min(this.vy, -JUMP_V); // no ar: desce rápido
      events.sfx.push("roll");
    }
    return false;
  }

  /**
   * @param {import("./game.js").Game} game
   * @param {import("./world/world.js").World} world
   * @param {import("./game.js").Events} events
   */
  physics(game, world, dt, events) {
    if (game.phase === Phase.Playing) {
      game.speed = Math.min(game.speed + 0.3 * dt, MAX_SPEED);
      game.distance += game.speed * dt;
      game.sinceStumble += dt;
      // piso: chão, rampa ou teto de veículo (subir rampa = piso subindo embaixo do pé)
      this.floor = world.groundAt(this.x, this.y);
      const falling = this.vy < -2;
      this.vy -= GRAVITY * dt;
      this.y = Math.max(this.y + this.vy * dt, this.floor);
      if (this.y <= this.floor) {
        if (falling) {
          this.land = 0.2;
          this.squash = 0.82;
          events.sfx.push("land");
          events.burst.push({ pos: new Vector3(this.x, this.floor + 0.1, 0), kind: "dust" });
        }
        this.vy = 0;
      }
      this.slide = Math.max(this.slide - dt, 0);
      this.land = Math.max(this.land - dt, 0);
      this.stumble = Math.max(this.stumble - dt, 0);
      this.invuln = Math.max(this.invuln - dt, 0);
      this.magnet = Math.max(this.magnet - dt, 0);
      game.wallet.tick(game.speed * dt);
    } else if (game.phase === Phase.Dying) {
      game.dying += dt;
      if (game.dying > 1.3) game.phase = Phase.Over;
      this.y = Math.max(this.y - 6 * dt, this.floor);
    }

    const t = this.root;
    const dx = LANES[this.lane] - t.position.x;
    t.position.x += dx * Math.min(12 * dt, 1);
    t.position.y = this.y;
    // de frente para a câmera no menu, de costas correndo
    const yaw = game.phase === Phase.Ready ? 0 : Math.PI;
    if (this.showcase && game.phase === Phase.Ready) {
      this.#showcaseT += dt;
      this.yaw += (this.#showcaseYaw + 0.7 * Math.sin(this.#showcaseT * 0.9) - this.yaw) * Math.min(4 * dt, 1);
    } else this.yaw += (yaw - this.yaw) * Math.min(8 * dt, 1);
    // pisca enquanto atravessa o obstáculo que a reserva pagou
    this.root.visible = !(this.invuln > 0 && Math.floor(this.invuln * 12) % 2);
    // inclina e olha para o lado da troca de faixa
    t.quaternion.copy(qy(this.yaw - clamp(dx * 0.12, -0.35, 0.35)).multiply(qz(clamp(dx * 0.15, -0.3, 0.3))));
    // squash & stretch: estica subindo/caindo rápido, achata ao tocar o chão e volta com mola
    const target = game.phase === Phase.Playing && !this.grounded ? 1 + 0.12 * Math.min(Math.abs(this.vy / JUMP_V), 1) : 1;
    this.squash += (target - this.squash) * Math.min(14 * dt, 1);
    const w = Math.sqrt(1 / this.squash); // volume constante
    t.scale.set(w, this.squash, w).multiplyScalar(MODEL_SCALE);
    // sombra colada no piso; quanto mais alto o pulo, menor
    if (this.blob) {
      const k = clamp(1 - (this.y - this.floor) * 0.18, 0.45, 1);
      this.blob.position.set(t.position.x, this.floor + 0.03, 0);
      this.blob.scale.set(k, k, 1.25 * k);
    }
  }

  /** Escolhe o clipe pelo estado e avança o mixer; `elapsed` é o tempo de jogo (para no pause). */
  animate(game, elapsed, dt) {
    if (!this.mixer) return;
    let want;
    if (game.phase === Phase.Ready) want = elapsed % 6 > 3.6 ? "Wave" : "Idle"; // acena de vez em quando (Wave dura 2,4 s)
    else if (game.phase !== Phase.Playing) want = "Crash";
    else if (this.stumble > 0) want = this.stumbleClip;
    else if (this.slide > 0) want = "Roll";
    else if (!this.grounded && this.y > this.floor + 0.3) want = "Jump";
    else if (this.land > 0) want = "Land";
    else want = "Run";
    if (want !== this.clip) this.#play(want);

    // pulo e rolamento seguem a física, não o relógio: ápice do clipe = ápice do pulo,
    // e o Levi só levanta do rolamento quando a hitbox volta ao normal
    const scrub = want === "Jump" ? 0.35 * (1 - this.vy / JUMP_V) : want === "Roll" ? SLIDE_TIME - this.slide : null;
    if (scrub !== null) {
      const a = this.actions[want];
      a.timeScale = 0;
      a.time = clamp(scrub, 0, SCRUB_LEN);
    }
    this.actions.Run.timeScale = 0.8 + (0.4 * game.speed) / START_SPEED;
    this.mixer.update(dt);
  }

  #play(name) {
    const looped = name === "Idle" || name === "Run";
    const fade = looped ? 0.2 : name === "Land" || name.startsWith("Stumble") ? 0.08 : 0.11;
    const next = this.actions[name];
    next.reset();
    next.setLoop(looped ? LoopRepeat : LoopOnce, Infinity);
    next.clampWhenFinished = true;
    next.play();
    const prev = this.clip && this.actions[this.clip];
    if (prev && prev !== next) next.crossFadeFrom(prev, fade, false);
    this.clip = name;
  }
}

