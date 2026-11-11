// Pista: trechos de cenário reciclados, fileiras de obstáculos e moedas, rolagem e colisão.

import { Group, Quaternion, Vector2, Vector3 } from "three";
import {
  CAR_GAP,
  CAR_LEN,
  CAR_TOP,
  FIRST_ROW,
  LANES,
  MOVER_WAKE_Z,
  RAMP_LEN,
  SPAWN_Z,
  TILE_LEN,
  TILES,
  ZONES,
  zoneAt,
} from "../config.js";
import { Phase } from "../game.js";
import { Batch, clearBatched } from "./batch.js";
import { groundAt, hit } from "./collision.js";
import { Props } from "./props.js";
import { buildTile } from "./zones.js";

const UP = new Vector3(0, 1, 0);
const COIN_HALF = new Vector3(0.45, 0.45, 0.45);

/**
 * Algo que anda junto com o mundo.
 * @typedef {object} Item
 * @property {import("three").Object3D} obj
 * @property {Vector3} [obstacle] meia-extensão da caixa de colisão, centrada em `obj.position`
 * @property {{half: Vector2, top: number, ramp: boolean}} [platform] superfície onde dá para pisar
 * @property {number} [mover] veículo na contramão: velocidade extra
 * @property {boolean} [coin]
 */

export class World {
  /**
   * @param {import("three").Object3D} root onde entram os objetos que rolam
   * @param {import("../game.js").Game} game
   * @param {import("./art.js").Art | null} art sem arte (testes) não há cenário, só a simulação
   */
  constructor(root, game, art = null) {
    this.root = root;
    this.game = game;
    this.art = art;
    /** @type {{obj: Group, serial: number, dirty: boolean}[]} */
    this.tiles = [];
    /** @type {Item[]} */
    this.items = [];
    /** distância até a qual cada faixa segue ocupada por um trem comprido */
    this.busy = [0, 0, 0];
    this.lastDistance = 0;
    /** quanto o mundo andou neste quadro (as partículas acompanham) */
    this.dz = 0;
    this._spin = new Quaternion();

    if (!art) return;
    this.props = new Props(art);
    for (let i = 0; i < TILES; i++) {
      const obj = new Group();
      obj.position.z = -i * TILE_LEN;
      root.add(obj);
      this.tiles.push({ obj, serial: i, dirty: true });
    }
    // ônibus estacionado na rua, atrás do Levi na tela inicial (fora das faixas: nunca bate)
    this.vehicle(0, 6.2, -9, 0);
  }

  /** @param {Item} item */
  add(item) {
    this.root.add(item.obj);
    this.items.push(item);
    return item;
  }

  *platforms() {
    for (const it of this.items) if (it.platform) yield it;
  }

  /** Piso sob o jogador em `x` com os pés em `feet`. */
  groundAt(x, feet) {
    return groundAt(x, feet, this.platforms());
  }

  /** Corrida nova: some com tudo que rola (o cenário é remontado por `decorate`). */
  restart() {
    for (const it of this.items) it.obj.removeFromParent();
    this.items = [];
  }

  scroll(dt) {
    const playing = this.game.phase === Phase.Playing;
    const dz = (this.dz = playing ? this.game.speed * dt : 0);
    for (const tile of this.tiles) {
      const p = tile.obj.position;
      p.z += dz;
      if (p.z > TILE_LEN) {
        p.z -= TILE_LEN * TILES;
        tile.serial += TILES;
        tile.dirty = true;
      }
    }
    this._spin.setFromAxisAngle(UP, 4 * dt);
    let gone = false;
    for (const it of this.items) {
      const p = it.obj.position;
      const wake = playing && p.z > MOVER_WAKE_Z;
      p.z += dz + (it.mover && wake ? it.mover * dt : 0);
      if (it.coin) it.obj.quaternion.premultiply(this._spin);
      if (p.z > TILE_LEN + CAR_LEN) {
        it.obj.removeFromParent();
        gone = it.gone = true;
      }
    }
    if (gone) this.items = this.items.filter((it) => !it.gone);
  }

  /** (Re)monta os trechos marcados; após reiniciar a corrida volta tudo para Copacabana. */
  decorate() {
    const g = this.game;
    if (g.distance < this.lastDistance) for (const t of this.tiles) t.dirty = true;
    this.lastDistance = g.distance;
    for (const tile of this.tiles) {
      if (!tile.dirty) continue;
      const d = g.distance - tile.obj.position.z;
      const zone = zoneAt(d);
      const gate = d > TILE_LEN && zone !== zoneAt(d - TILE_LEN);
      clearBatched(tile.obj);
      const b = new Batch();
      buildTile(b, this.art, zone, tile.serial, gate, g);
      b.build(tile.obj);
      tile.dirty = false;
    }
  }

  // ---------- obstáculos ----------

  coin(x, y, z) {
    const obj = this.props.coin();
    obj.position.set(x, y, z);
    this.add({ obj, coin: true });
  }

  coinRow(x, z) {
    for (let i = 0; i < 5; i++) this.coin(x, 1, z + i * 2.2);
  }

  /** Veículo do bairro (ônibus, VLT ou bonde) com teto pisável. */
  vehicle(zoneIndex, x, z, mover) {
    const obj = this.props.vehicle(zoneIndex);
    obj.position.set(x, CAR_TOP / 2, z);
    this.add({
      obj,
      obstacle: new Vector3(1.1, CAR_TOP / 2, CAR_LEN / 2),
      // teto cobre o vão de engate até o próximo carro, senão quem pousa ali cai e bate nele
      platform: { half: new Vector2(1.1, (CAR_LEN + CAR_GAP) / 2), top: CAR_TOP, ramp: false },
      mover,
    });
  }

  /** Uma fileira de obstáculos por vez, quando a distância chega em `nextSpawn`. */
  spawnRows() {
    const g = this.game;
    // já no menu, para as primeiras fileiras não surgirem na pista ao tocar em jogar
    if ((g.phase !== Phase.Ready && g.phase !== Phase.Playing) || g.distance < g.nextSpawn) return;
    if (g.nextSpawn <= FIRST_ROW) this.busy = [-Infinity, -Infinity, -Infinity]; // corrida nova
    const d = g.nextSpawn;
    // fileira atrasada (as do começo) entra mais perto, no lugar que seria o dela
    const spawnZ = SPAWN_Z + g.distance - d;
    g.nextSpawn += 16 + g.speed * 0.4;
    const zone = ZONES.indexOf(zoneAt(d - SPAWN_Z));

    // faixas ainda ocupadas por um trem comprido ficam de fora; uma das livres é sempre segura
    const free = [0, 1, 2].filter((l) => this.busy[l] < d);
    if (!free.length) return;
    const safe = free[g.pick(free.length)];
    for (const lane of free) {
      const x = LANES[lane];
      if (lane === safe) {
        this.coinRow(x, spawnZ);
        continue;
      }
      const roll = g.pick(10);
      if (roll <= 2) {
        const obj = this.props.barrier();
        obj.position.set(x, 0.5, spawnZ);
        this.add({ obj, obstacle: new Vector3(1, 0.5, 0.2) });
        // arco de moedas por cima do cavalete
        if (g.pick(2) === 0) {
          for (let i = 0; i < 5; i++) {
            const k = i / 4;
            this.coin(x, 1 + 1.6 * Math.sin(k * Math.PI), spawnZ + 4 - k * 8);
          }
        }
      } else if (roll <= 4) {
        const obj = this.props.sign();
        obj.position.set(x, 1.9, spawnZ);
        this.add({ obj, obstacle: new Vector3(1.1, 0.5, 0.15) });
      } else if (roll <= 7) {
        // trem de 1 a 3 carros, às vezes com rampa para subir no teto
        const cars = 1 + g.pick(3);
        const ramp = g.pick(2) === 0;
        const front = ramp ? spawnZ - RAMP_LEN : spawnZ;
        if (ramp) {
          const obj = this.props.ramp();
          obj.position.set(x, 0, spawnZ - RAMP_LEN / 2);
          this.add({ obj, platform: { half: new Vector2(1.1, RAMP_LEN / 2), top: CAR_TOP, ramp: true } });
          for (let i = 0; i < 3 + cars * 4; i++) {
            const z = spawnZ - 1 - i * 2.2;
            const y = z > front ? (CAR_TOP * (spawnZ - z)) / RAMP_LEN : CAR_TOP;
            this.coin(x, y + 1, z);
          }
        }
        for (let k = 0; k < cars; k++) this.vehicle(zone, x, front - CAR_LEN / 2 - k * (CAR_LEN + CAR_GAP), 0);
        this.busy[lane] = d + (spawnZ - front) + cars * (CAR_LEN + CAR_GAP) + 6;
      } else if (roll === 8 && g.distance > 300) {
        this.vehicle(zone, x, spawnZ - CAR_LEN / 2, 8);
        this.busy[lane] = d + 40;
      } else {
        this.coinRow(x, spawnZ);
      }
    }
  }

  /**
   * Batida lateral (no meio da troca de faixa) = tropeço e volta para a faixa anterior;
   * batida de frente ou segundo tropeço em 3 s = queda.
   * @param {import("../player.js").Player} p
   * @param {import("../game.js").Events} events
   */
  collide(p, events) {
    const g = this.game;
    if (g.phase !== Phase.Playing) return;
    const h = p.slide > 0 ? 0.8 : 1.7;
    const half = new Vector3(0.35, h / 2, 0.3);
    const center = new Vector3(p.x, p.y + h / 2, 0);
    // em cima do teto não é batida
    const blocking = this.items.find(
      (it) => it.obstacle && (!it.platform || p.y < it.platform.top - 0.5) && hit(center, half, it.obj.position, it.obstacle),
    );
    if (blocking) {
      const side = Math.abs(p.x - LANES[p.lane]) > 0.25;
      if (side && g.sinceStumble < 0.4) {
        // ainda saindo do tropeço anterior
      } else if (side && g.sinceStumble > 3) {
        p.stumble = 0.45;
        p.stumbleClip = blocking.obj.position.x > p.x ? "StumbleR" : "StumbleL";
        [p.lane, p.prevLane] = [p.prevLane, p.lane];
        g.sinceStumble = 0;
        g.speed *= 0.85;
        events.sfx.push("stumble");
        events.shake.push(0.5);
        events.burst.push({ pos: center.clone(), kind: "dust" });
      } else {
        g.phase = Phase.Dying;
        g.dying = 0;
        events.sfx.push("crash");
        events.shake.push(1);
        events.burst.push({ pos: center.clone().setZ(-0.4), kind: "debris" });
      }
    }
    let taken = false;
    for (const it of this.items) {
      if (it.coin && hit(center, half, it.obj.position, COIN_HALF)) {
        g.coins++;
        events.sfx.push("coin");
        events.burst.push({ pos: it.obj.position.clone(), kind: "sparkle" });
        it.obj.removeFromParent();
        taken = it.gone = true;
      }
    }
    if (taken) this.items = this.items.filter((it) => !it.gone);
  }
}
