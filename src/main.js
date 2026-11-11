// Levi Runner — endless runner de 3 faixas no Rio.

import "./style.css";
import { Group, Mesh, MeshBasicMaterial, PlaneGeometry, Scene } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { Audio } from "./audio.js";
import { MAX_DT } from "./config.js";
import { Fx } from "./fx.js";
import { Events, Game, Phase } from "./game.js";
import { Input } from "./input.js";
import { Player } from "./player.js";
import { initRanking, submitScore } from "./ranking.js";
import { createRenderer } from "./render.js";
import { Hud } from "./ui.js";
import { Art } from "./world/art.js";
import { backdrop } from "./world/backdrop.js";
import { blob } from "./world/textures.js";
import { World } from "./world/world.js";

const canvas = document.getElementById("game");
const scene = new Scene();
const game = new Game(0x12345678);
const events = new Events();
const fx = new Fx(scene);
const { renderer, composer, resize } = createRenderer(canvas, scene, fx.camera);

const art = new Art();
scene.add(backdrop(art));
const scrolling = new Group();
scene.add(scrolling);
const world = new World(scrolling, game, art);

const player = new Player();
scene.add(player.root);
// sombra redonda no chão embaixo do Levi (no lugar da sombra do sol, que esticava e serrilhava)
player.blob = new Mesh(new PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new MeshBasicMaterial({ map: blob(), transparent: true, depthWrite: false }));
scene.add(player.blob);

new GLTFLoader().load(
  "/levi.glb",
  (gltf) => {
    player.attachModel(gltf);
    document.getElementById("loading").remove();
  },
  undefined,
  (err) => {
    console.error(err);
    document.getElementById("loading").textContent = "Não foi possível carregar o Levi.";
  },
);

const audio = new Audio();
audio.load();
const input = new Input(canvas);
let paused = false;
let pauseClicked = false;
const hud = new Hud({ onPause: () => (pauseClicked = true), onSound: () => audio.toggleMute() });
initRanking(() => canvas.focus());

const onResize = () => fx.resize(resize());
addEventListener("resize", onResize);
onResize();
canvas.focus();

let elapsed = 0;
let last = performance.now();

/** Um quadro, na mesma ordem dos sistemas do jogo original. */
function frame(now) {
  const realDt = Math.min((now - last) / 1000, 0.25);
  last = now;
  const keys = input.poll();

  // Esc / P / botão de pausa congelam o tempo do jogo durante a corrida
  const pausePressed = keys.pressed("Escape", "KeyP") || pauseClicked;
  pauseClicked = false;
  if (game.phase !== Phase.Playing) paused = false;
  else if (pausePressed) paused = !paused;
  const dt = paused ? 0 : Math.min(realDt, MAX_DT);
  elapsed += dt;

  if (!paused && player.input(keys, game, events)) {
    world.restart();
    fx.clear();
  }
  const before = game.phase;
  // nessa ordem: o piso do jogador é medido com o mundo já na posição que `collide` vai testar
  world.scroll(dt);
  player.physics(game, world, dt, events);
  if (before !== Phase.Over && game.phase === Phase.Over) submitScore(game.score);
  world.decorate();
  art.animateSea(elapsed);
  world.spawnRows();
  world.collide(player, events);
  player.animate(game, elapsed, dt);
  fx.update(dt, game, player, events, world.dz);
  if (keys.pressed("KeyM")) audio.toggleMute();
  audio.update(dt, game, events);
  hud.update(dt, realDt, game, paused, audio.muted);

  composer.render();
  events.clear();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

if (import.meta.env.DEV) window.levi = { game, world, player, fx, scene, renderer };
