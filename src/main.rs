//! Levi Runner — endless runner de 3 faixas no Rio.

mod art;
mod audio;
mod fx;
mod player;
mod ui;
mod world;

use bevy::{asset::AssetMetaCheck, light::SimulationLightSystems, prelude::*};

pub const LANES: [f32; 3] = [-2.5, 0.0, 2.5];
pub const START_SPEED: f32 = 14.0;
pub const MAX_SPEED: f32 = 34.0;
/// Frame mais longo que a simulação aceita: abaixo de 25 FPS o jogo fica lento em vez de teleportar o mundo.
pub const MAX_DT: f32 = 0.04;

#[derive(Clone, Copy, PartialEq)]
pub enum Phase {
    Ready,
    Playing,
    /// bateu: animação de queda antes do game over
    Dying,
    Over,
}

#[derive(Resource)]
pub struct Game {
    pub phase: Phase,
    pub speed: f32,
    pub distance: f32,
    pub coins: u32,
    pub next_spawn: f32,
    /// segundos desde o último tropeço (dois em 3 s = fim)
    pub since_stumble: f32,
    pub dying: f32,
    rng: u32,
}

impl Game {
    fn new(rng: u32) -> Self {
        Self { phase: Phase::Ready, speed: START_SPEED, distance: 0.0, coins: 0, next_spawn: world::FIRST_ROW, since_stumble: 99.0, dying: 0.0, rng }
    }
    pub fn reset(&mut self) {
        *self = Self::new(self.rng);
    }
    pub fn score(&self) -> u32 {
        self.distance as u32 + self.coins * 10
    }
    // ponytail: xorshift32, troque por `rand` se precisar de distribuições
    pub fn rand(&mut self) -> u32 {
        self.rng ^= self.rng << 13;
        self.rng ^= self.rng >> 17;
        self.rng ^= self.rng << 5;
        self.rng
    }
    pub fn pick(&mut self, n: u32) -> usize {
        (self.rand() % n) as usize
    }
}

#[cfg(target_arch = "wasm32")]
#[wasm_bindgen::prelude::wasm_bindgen]
extern "C" {
    /// definida no index.html: envia a pontuação para o ranking
    #[wasm_bindgen(js_name = leviGameOver)]
    pub fn game_over(score: u32);
}
#[cfg(not(target_arch = "wasm32"))]
pub fn game_over(_score: u32) {}

#[derive(Message, Clone, Copy, PartialEq)]
pub enum Sfx {
    Jump,
    Land,
    Roll,
    Swipe,
    Coin,
    Stumble,
    Crash,
}

/// Tremida de câmera (0..1).
#[derive(Message)]
pub struct Shake(pub f32);

#[derive(Clone, Copy)]
pub enum BurstKind {
    Dust,
    Sparkle,
    Debris,
}

#[derive(Message)]
pub struct Burst(pub Vec3, pub BurstKind);

fn main() {
    App::new()
        .insert_resource(Game::new(0x1234_5678))
        .insert_resource(Time::<Virtual>::from_max_delta(std::time::Duration::from_secs_f32(MAX_DT)))
        .add_plugins(
            DefaultPlugins
                .set(AssetPlugin { meta_check: AssetMetaCheck::Never, ..default() })
                .set(WindowPlugin {
                    primary_window: Some(Window {
                        title: "Levi Runner".into(),
                        canvas: Some("#bevy".into()),
                        fit_canvas_to_parent: true,
                        prevent_default_event_handling: true,
                        ..default()
                    }),
                    ..default()
                }),
        )
        .add_message::<Sfx>()
        .add_message::<Shake>()
        .add_message::<Burst>()
        .add_systems(Startup, (player::setup, world::setup, fx::setup, ui::setup, audio::setup))
        .add_systems(
            Update,
            (
                ui::pause,
                player::input.run_if(ui::not_paused),
                // nessa ordem: o piso do jogador tem que ser medido com o mundo já na posição que `collide` vai testar
                world::scroll,
                player::physics,
                world::decorate,
                world::lod_meshes,
                world::animate_sea,
                world::spawn_rows,
                world::collide,
                player::animate,
                fx::camera,
                fx::particles,
                audio::play,
                ui::hud,
            )
                .chain(),
        )
        .add_systems(
            PostUpdate,
            fx::stable_shadows.after(SimulationLightSystems::UpdateDirectionalLightCascades).before(SimulationLightSystems::UpdateLightFrusta),
        )
        .run();
}
