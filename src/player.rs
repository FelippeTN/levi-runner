//! Levi: input, física e máquina de animação.

use std::{f32::consts::PI, time::Duration};

use bevy::{light::NotShadowCaster, prelude::*, world_serialization::WorldInstanceReady};

use crate::{art, world, Burst, BurstKind, Game, Phase, Sfx, LANES, START_SPEED};

pub const JUMP_V: f32 = 9.5;
const GRAVITY: f32 = 26.0;
pub const SLIDE_TIME: f32 = 0.7;
const MODEL_SCALE: f32 = 0.6;

/// Mesma ordem das animações no levi.glb (tools/make_anims.py).
#[derive(Clone, Copy, PartialEq)]
pub enum Clip {
    Idle,
    Wave,
    Run,
    Jump,
    Roll,
    Land,
    StumbleL,
    StumbleR,
    Crash,
}
const CLIP_COUNT: usize = 9;

#[derive(Component)]
pub struct Player {
    pub lane: usize,
    pub prev_lane: usize,
    pub y: f32,
    pub vy: f32,
    pub slide: f32,
    land: f32,
    pub stumble: f32,
    pub stumble_clip: Clip,
    yaw: f32,
    /// altura do piso embaixo (0 = chão, CAR_TOP = teto de veículo)
    pub floor: f32,
    /// escala vertical do squash & stretch (1 = normal)
    squash: f32,
}

impl Player {
    pub fn new() -> Self {
        Self { lane: 1, prev_lane: 1, y: 0.0, vy: 0.0, slide: 0.0, land: 0.0, stumble: 0.0, stumble_clip: Clip::StumbleL, yaw: 0.0, floor: 0.0, squash: 1.0 }
    }
    pub fn grounded(&self) -> bool {
        self.y <= self.floor + 0.01
    }
}

#[derive(Resource)]
pub struct Anims {
    graph: Handle<AnimationGraph>,
    nodes: Vec<AnimationNodeIndex>,
}

/// Sombra redonda no chão embaixo do Levi (no lugar da sombra do sol, que esticava e serrilhava).
#[derive(Component)]
pub struct Blob;

/// Fica na entidade do AnimationPlayer: o clipe que está tocando.
#[derive(Component)]
pub struct Rig(Clip);

pub fn setup(
    mut commands: Commands,
    assets: Res<AssetServer>,
    mut graphs: ResMut<Assets<AnimationGraph>>,
    mut meshes: ResMut<Assets<Mesh>>,
    mut mats: ResMut<Assets<StandardMaterial>>,
    mut images: ResMut<Assets<Image>>,
) {
    let blob = StandardMaterial { base_color_texture: Some(images.add(art::blob())), alpha_mode: AlphaMode::Blend, unlit: true, ..default() };
    commands.spawn((Blob, Mesh3d(meshes.add(Plane3d::default().mesh().size(1.0, 1.0))), MeshMaterial3d(mats.add(blob)), NotShadowCaster));
    let (graph, nodes) =
        AnimationGraph::from_clips((0..CLIP_COUNT).map(|i| assets.load(GltfAssetLabel::Animation(i).from_asset("levi.glb"))));
    commands.insert_resource(Anims { graph: graphs.add(graph), nodes });
    commands
        .spawn((
            Player::new(),
            WorldAssetRoot(assets.load(GltfAssetLabel::Scene(0).from_asset("levi.glb"))),
            Transform::from_scale(Vec3::splat(MODEL_SCALE)),
        ))
        .observe(on_levi_ready);
}

fn on_levi_ready(
    ready: On<WorldInstanceReady>,
    mut commands: Commands,
    anims: Res<Anims>,
    children: Query<&Children>,
    mut players: Query<&mut AnimationPlayer>,
    meshes: Query<(), With<Mesh3d>>,
) {
    for e in children.iter_descendants(ready.entity) {
        if meshes.contains(e) {
            commands.entity(e).insert(NotShadowCaster);
        }
        if let Ok(mut player) = players.get_mut(e) {
            let mut transitions = AnimationTransitions::new();
            transitions.play(&mut player, anims.nodes[Clip::Idle as usize], Duration::ZERO).repeat();
            commands.entity(e).insert((AnimationGraphHandle(anims.graph.clone()), transitions, Rig(Clip::Idle)));
        }
    }
}

pub fn input(
    keys: Res<ButtonInput<KeyCode>>,
    touches: Res<Touches>,
    mouse: Res<ButtonInput<MouseButton>>,
    mut click: ResMut<crate::ui::UiClick>,
    mut game: ResMut<Game>,
    mut player: Query<&mut Player>,
    mut commands: Commands,
    scrolls: Query<Entity, (With<world::Scroll>, Without<world::Tile>)>,
    mut sfx: MessageWriter<Sfx>,
) {
    let mut swipe = None;
    // toque/clique em botão da interface não conta como "jogar"
    let mut tap = mouse.just_released(MouseButton::Left);
    for t in touches.iter_just_released() {
        let d = t.position() - t.start_position();
        if d.length() < 30.0 {
            tap = true;
        } else if d.x.abs() > d.y.abs() {
            swipe = Some(if d.x > 0.0 { KeyCode::ArrowRight } else { KeyCode::ArrowLeft });
        } else {
            // y da tela cresce para baixo
            swipe = Some(if d.y < 0.0 { KeyCode::ArrowUp } else { KeyCode::ArrowDown });
        }
    }
    tap &= !std::mem::take(&mut click.any);
    let pressed = |a: KeyCode, b: KeyCode| keys.just_pressed(a) || keys.just_pressed(b) || swipe == Some(a);
    let Ok(mut p) = player.single_mut() else { return };

    match game.phase {
        Phase::Dying => return,
        Phase::Ready | Phase::Over => {
            if tap || keys.just_pressed(KeyCode::Space) || keys.just_pressed(KeyCode::Enter) {
                if game.phase == Phase::Over {
                    for e in &scrolls {
                        commands.entity(e).despawn();
                    }
                    game.reset();
                    *p = Player { yaw: p.yaw, ..Player::new() };
                }
                game.phase = Phase::Playing;
            }
            return;
        }
        Phase::Playing => {}
    }

    let lane = p.lane;
    if pressed(KeyCode::ArrowLeft, KeyCode::KeyA) && lane > 0 {
        p.lane -= 1;
    }
    if pressed(KeyCode::ArrowRight, KeyCode::KeyD) && lane < 2 {
        p.lane += 1;
    }
    if p.lane != lane {
        p.prev_lane = lane;
        sfx.write(Sfx::Swipe);
    }
    if (pressed(KeyCode::ArrowUp, KeyCode::KeyW) || keys.just_pressed(KeyCode::Space)) && p.grounded() {
        p.vy = JUMP_V;
        p.slide = 0.0;
        sfx.write(Sfx::Jump);
    }
    if pressed(KeyCode::ArrowDown, KeyCode::KeyS) {
        p.slide = SLIDE_TIME;
        p.vy = p.vy.min(-JUMP_V); // no ar: desce rápido
        sfx.write(Sfx::Roll);
    }
}

pub fn physics(
    time: Res<Time>,
    mut game: ResMut<Game>,
    mut q: Query<(&mut Player, &mut Transform)>,
    platforms: Query<(&Transform, &world::Platform), Without<Player>>,
    mut blob: Query<&mut Transform, (With<Blob>, Without<Player>, Without<world::Platform>)>,
    mut sfx: MessageWriter<Sfx>,
    mut burst: MessageWriter<Burst>,
) {
    let Ok((mut p, mut t)) = q.single_mut() else { return };
    let dt = time.delta_secs();
    match game.phase {
        Phase::Playing => {
            game.speed = (game.speed + 0.3 * dt).min(crate::MAX_SPEED);
            game.distance += game.speed * dt;
            game.since_stumble += dt;
            // piso: chão, rampa ou teto de veículo (subir rampa = piso subindo embaixo do pé)
            p.floor = world::ground_at(t.translation.x, p.y, platforms.iter());
            let falling = p.vy < -2.0;
            p.vy -= GRAVITY * dt;
            p.y = (p.y + p.vy * dt).max(p.floor);
            if p.y <= p.floor {
                if falling {
                    p.land = 0.2;
                    p.squash = 0.82;
                    sfx.write(Sfx::Land);
                    burst.write(Burst(Vec3::new(t.translation.x, p.floor + 0.1, 0.0), BurstKind::Dust));
                }
                p.vy = 0.0;
            }
            p.slide = (p.slide - dt).max(0.0);
            p.land = (p.land - dt).max(0.0);
            p.stumble = (p.stumble - dt).max(0.0);
        }
        Phase::Dying => {
            game.dying += dt;
            if game.dying > 1.3 {
                game.phase = Phase::Over;
                crate::game_over(game.score());
            }
            p.y = (p.y - 6.0 * dt).max(p.floor);
        }
        _ => {}
    }
    let dx = LANES[p.lane] - t.translation.x;
    t.translation.x += dx * (12.0 * dt).min(1.0);
    t.translation.y = p.y;
    // de frente para a câmera no menu, de costas correndo
    let yaw = if game.phase == Phase::Ready { 0.0 } else { PI };
    p.yaw += (yaw - p.yaw) * (8.0 * dt).min(1.0);
    // inclina e olha para o lado da troca de faixa
    t.rotation = Quat::from_rotation_y(p.yaw - (dx * 0.12).clamp(-0.35, 0.35)) * Quat::from_rotation_z((dx * 0.15).clamp(-0.3, 0.3));
    // squash & stretch: estica subindo/caindo rápido, achata ao tocar o chão e volta com mola
    let target = if game.phase == Phase::Playing && !p.grounded() { 1.0 + 0.12 * (p.vy / JUMP_V).abs().min(1.0) } else { 1.0 };
    p.squash += (target - p.squash) * (14.0 * dt).min(1.0);
    let w = p.squash.recip().sqrt(); // volume constante
    t.scale = MODEL_SCALE * Vec3::new(w, p.squash, w);
    // sombra colada no piso; quanto mais alto o pulo, menor
    if let Ok(mut b) = blob.single_mut() {
        let k = (1.0 - (p.y - p.floor) * 0.18).clamp(0.45, 1.0);
        b.translation = Vec3::new(t.translation.x, p.floor + 0.03, 0.0);
        b.scale = Vec3::new(1.0, 1.0, 1.25) * k;
    }
}

pub fn animate(
    time: Res<Time>,
    game: Res<Game>,
    anims: Res<Anims>,
    player: Query<&Player>,
    mut rigs: Query<(&mut AnimationPlayer, &mut AnimationTransitions, &mut Rig)>,
) {
    let (Ok(p), Ok((mut ap, mut tr, mut rig))) = (player.single(), rigs.single_mut()) else { return };
    let want = match game.phase {
        // acena de vez em quando no menu (Wave dura 2.4 s)
        Phase::Ready if time.elapsed_secs() % 6.0 > 3.6 => Clip::Wave,
        Phase::Ready => Clip::Idle,
        Phase::Dying | Phase::Over => Clip::Crash,
        Phase::Playing if p.stumble > 0.0 => p.stumble_clip,
        Phase::Playing if p.slide > 0.0 => Clip::Roll,
        Phase::Playing if !p.grounded() && p.y > p.floor + 0.3 => Clip::Jump,
        Phase::Playing if p.land > 0.0 => Clip::Land,
        Phase::Playing => Clip::Run,
    };
    if want != rig.0 {
        let (fade_ms, looped) = match want {
            Clip::Idle | Clip::Run => (200, true),
            Clip::Land | Clip::StumbleL | Clip::StumbleR => (80, false),
            _ => (110, false),
        };
        let a = tr.play(&mut ap, anims.nodes[want as usize], Duration::from_millis(fade_ms));
        if looped {
            a.repeat();
        }
        rig.0 = want;
    }
    // pulo e rolamento seguem a física, não o relógio: ápice do clipe = ápice do pulo,
    // e o Levi só levanta do rolamento quando a hitbox volta ao normal
    let scrub = match want {
        Clip::Jump => Some(0.35 * (1.0 - p.vy / JUMP_V)),
        Clip::Roll => Some(SLIDE_TIME - p.slide),
        _ => None,
    };
    if let Some(at) = scrub
        && let Some(a) = ap.animation_mut(anims.nodes[want as usize])
    {
        a.set_speed(0.0).seek_to(at.clamp(0.0, 0.7)); // 0.7 s: duração dos dois clipes
    }
    if let Some(run) = ap.animation_mut(anims.nodes[Clip::Run as usize]) {
        run.set_speed(0.8 + 0.4 * game.speed / START_SPEED);
    }
}
