//! Pista, bairros do Rio, fundo, obstáculos, plataformas (tetos e rampas), moedas e colisão.

use std::f32::consts::{FRAC_PI_2, PI};

use bevy::{camera::visibility::VisibilityRange, light::NotShadowCaster, math::Affine2, prelude::*};

use crate::{
    art::{self, Facade},
    player::{Clip, Player},
    Burst, BurstKind, Game, Phase, Sfx, Shake, LANES,
};

/// Fim da neblina: até aqui nada some; o que nasce ou reaparece além disso entra sem ser visto.
pub const FOG_END: f32 = 250.0;
const SPAWN_Z: f32 = -FOG_END;
/// Fileira inicial: com a pista mais longa, as primeiras já começam a meio caminho, como antes (160 m da largada).
pub const FIRST_ROW: f32 = 160.0 + SPAWN_Z;
/// Veículo na contramão só acelera a partir daqui, para a distância de reação não crescer com o alcance.
const MOVER_WAKE_Z: f32 = -130.0;
const TILE_LEN: f32 = 20.0;
const TILES: usize = 14;
const ZONE_LEN: f32 = 700.0;
/// altura do teto dos veículos (dá para correr em cima)
pub const CAR_TOP: f32 = 2.8;
const CAR_LEN: f32 = 9.0;
const CAR_GAP: f32 = 1.2;
const RAMP_LEN: f32 = 7.0;

#[derive(Clone, Copy, PartialEq, Debug)]
pub enum Zone {
    Copacabana,
    Lapa,
    SantaTeresa,
}

impl Zone {
    pub fn name(self) -> &'static str {
        match self {
            Zone::Copacabana => "Copacabana",
            Zone::Lapa => "Lapa",
            Zone::SantaTeresa => "Santa Teresa",
        }
    }
}

pub fn zone_at(distance: f32) -> Zone {
    match (distance.max(0.0) / ZONE_LEN) as usize % 3 {
        0 => Zone::Copacabana,
        1 => Zone::Lapa,
        _ => Zone::SantaTeresa,
    }
}

/// Tudo que anda junto com o mundo (obstáculos, moedas, cenário, partículas).
#[derive(Component)]
pub struct Scroll;

#[derive(Component)]
pub struct Tile {
    serial: u32,
}

/// Tile que precisa (re)montar o cenário do bairro.
#[derive(Component)]
pub struct Dirty;

/// Meia-extensão da caixa de colisão, centrada no Transform.
#[derive(Component)]
pub struct Obstacle(Vec3);

/// Superfície onde dá para pisar: teto de veículo ou rampa (sobe de 0 em +z até `top` em -z).
#[derive(Component)]
pub struct Platform {
    pub half: Vec2,
    pub top: f32,
    pub ramp: bool,
}

impl Platform {
    /// Altura do piso sob o jogador (z = 0), se estiver em cima.
    pub fn height_at(&self, t: &Transform, x: f32) -> Option<f32> {
        if (x - t.translation.x).abs() > self.half.x || t.translation.z.abs() > self.half.y {
            return None;
        }
        Some(if self.ramp { self.top * ((t.translation.z + self.half.y) / (2.0 * self.half.y)).clamp(0.0, 1.0) } else { self.top })
    }
}

/// Veículo vindo na contramão (velocidade extra).
#[derive(Component)]
pub struct Mover(f32);

#[derive(Component)]
pub struct Coin;

type Pbr = Handle<StandardMaterial>;

/// Nível de detalhe atual da peça (0 = malha cheia); ver `lod_meshes`.
#[derive(Component)]
pub struct Lod(u8);

/// Malhas e materiais reaproveitados por todo o cenário.
#[derive(Resource)]
pub struct Art {
    /// mesma peça em 3 resoluções: perto, meio e longe
    tiers: Vec<[Handle<Mesh>; 3]>,
    cube: Handle<Mesh>,
    sphere: Handle<Mesh>,
    cylinder: Handle<Mesh>,
    cone: Handle<Mesh>,
    plane: Handle<Mesh>,
    ramp: Handle<Mesh>,
    arch_big: Handle<Mesh>,
    arch: Handle<Mesh>,
    arch_top: Handle<Mesh>,
    roofs: Vec<(Handle<Mesh>, Vec3)>,
    modern: Vec<(Handle<Mesh>, Vec3)>,
    colonial: Vec<(Handle<Mesh>, Vec3)>,
    towers: Vec<(Handle<Mesh>, Vec3)>,
    m_modern: Vec<Pbr>,
    m_colonial: Vec<Pbr>,
    m_glass: Pbr,
    calcadao: Pbr,
    calcadao_side: Pbr,
    cobble_light: Pbr,
    asphalt: Pbr,
    sand: Pbr,
    pub sea: Pbr,
    foam: Pbr,
    grass: Pbr,
    rock: Pbr,
    white: Pbr,
    metal: Pbr,
    dark: Pbr,
    trunk: Pbr,
    leaf: Pbr,
    canopy: Pbr,
    tile_roof: Pbr,
    lamp_glow: Pbr,
    umbrellas: Vec<Pbr>,
    barrier: Pbr,
    sign: Pbr,
    /// (lataria, teto) do ônibus, VLT e bonde, na ordem dos bairros
    vehicles: [(Pbr, Pbr); 3],
    track: Pbr,
    headlight: Pbr,
    rubber: Pbr,
    ramp_mat: Pbr,
    coin_mesh: Handle<Mesh>,
    coin: Pbr,
    // peças arredondadas (cada proporção tem sua malha para o raio não esticar)
    r_body: Handle<Mesh>,
    r_roof: Handle<Mesh>,
    r_frame: Handle<Mesh>,
    r_windshield: Handle<Mesh>,
    r_led: Handle<Mesh>,
    r_bumper: Handle<Mesh>,
    r_mirror: Handle<Mesh>,
    r_board: Handle<Mesh>,
    r_leg: Handle<Mesh>,
    r_panel: Handle<Mesh>,
    r_kiosk: Handle<Mesh>,
    r_hut: Handle<Mesh>,
    r_tram: Handle<Mesh>,
    glass: Pbr,
    led: Pbr,
    blink: Pbr,
}

fn tex_mat(mats: &mut Assets<StandardMaterial>, img: Handle<Image>, tint: Color, uv: Vec2) -> Pbr {
    mats.add(StandardMaterial {
        base_color: tint,
        base_color_texture: Some(img),
        perceptual_roughness: 0.85,
        uv_transform: Affine2::from_scale(uv),
        ..default()
    })
}

impl Art {
    fn new(meshes: &mut Assets<Mesh>, mats: &mut Assets<StandardMaterial>, images: &mut Assets<Image>) -> Self {
        let mut img = |i: Image| images.add(i);
        let (t_calc, t_cob, t_asph, t_sand, t_sea) = (img(art::calcadao()), img(art::cobble()), img(art::asphalt()), img(art::sand()), img(art::sea()));
        let (t_mod, t_col, t_gla) = (img(art::facade(Facade::Modern)), img(art::facade(Facade::Colonial)), img(art::facade(Facade::Glass)));
        let t_roof = img(art::roof_tiles());
        let t_track = img(art::track());
        let liveries = [
            // laranja com saia vermelha, branco com azul, amarelo com verde
            ([1.0, 0.6, 0.08], [0.88, 0.2, 0.1], [0.98, 0.95, 0.85], Color::srgb(0.97, 0.96, 0.92)),
            ([0.95, 0.97, 1.0], [0.08, 0.42, 0.85], [1.0, 0.75, 0.08], Color::srgb(0.22, 0.28, 0.4)),
            ([1.0, 0.8, 0.08], [0.18, 0.5, 0.25], [0.85, 0.15, 0.1], Color::srgb(0.2, 0.32, 0.48)),
        ]
        .map(|(body, lower, stripe, roof)| (img(art::livery(body, lower, stripe)), roof));
        let t_barrier = img(art::stripes([0.9, 0.1, 0.1], [0.97, 0.97, 0.97]));
        let t_sign = img(art::stripes([0.98, 0.78, 0.05], [0.08, 0.08, 0.08]));

        let solid = |mats: &mut Assets<StandardMaterial>, c: Color, rough: f32| mats.add(StandardMaterial { base_color: c, perceptual_roughness: rough, ..default() });
        let glow = |mats: &mut Assets<StandardMaterial>, c: LinearRgba| mats.add(StandardMaterial { base_color: Color::BLACK, emissive: c, ..default() });

        let sizes = |list: &[(f32, f32, f32)], cell: Vec2, meshes: &mut Assets<Mesh>| -> Vec<(Handle<Mesh>, Vec3)> {
            list.iter().map(|&(w, h, d)| { let s = Vec3::new(w, h, d); (meshes.add(art::tiled_box(s, cell)), s) }).collect()
        };
        let modern = sizes(&[(9.0, 21.0, 9.0), (8.0, 27.0, 9.0), (10.0, 33.0, 9.0), (9.0, 39.0, 9.0), (8.0, 15.0, 9.0)], Vec2::new(3.0, 3.0), meshes);
        let colonial = sizes(&[(6.5, 7.5, 8.0), (6.0, 10.5, 8.0), (7.0, 9.0, 8.0)], Vec2::new(3.0, 3.6), meshes);
        let towers = sizes(&[(14.0, 45.0, 14.0), (12.0, 62.0, 12.0), (16.0, 35.0, 16.0)], Vec2::new(3.0, 3.5), meshes);
        let roofs = [(6.5, 8.0), (8.0, 8.0), (9.0, 9.0)].iter().map(|&(w, d)| (meshes.add(art::gable(w, 2.2, d)), Vec3::new(w, 2.2, d))).collect();

        // tinta de desenho: pouco brilho, nada de verniz
        let paint = |mats: &mut Assets<StandardMaterial>, img: Option<Handle<Image>>, c: Color| mats.add(StandardMaterial {
            base_color: c, base_color_texture: img, perceptual_roughness: 0.6, reflectance: 0.3,
            uv_transform: Affine2::from_scale(1.0 / art::LIVERY_SIZE), ..default()
        });
        let mut rb = |x: f32, y: f32, z: f32, r: f32| meshes.add(art::rounded_box(Vec3::new(x, y, z), r));
        let (r_body, (), r_windshield, r_led) = (rb(2.2, 2.0, CAR_LEN, 0.25), (), rb(1.7, 0.8, 0.14, 0.14), rb(1.3, 0.18, 0.08, 0.04));
        let r_frame = rb(1.95, 1.0, 0.1, 0.2);
        let (r_bumper, r_mirror, r_board, r_leg) = (rb(2.25, 0.32, 0.36, 0.14), rb(0.1, 0.4, 0.2, 0.05), rb(2.0, 0.3, 0.1, 0.05), rb(0.09, 1.0, 0.09, 0.04));
        let (r_panel, r_kiosk, r_hut, r_tram) = (rb(2.2, 1.0, 0.16, 0.12), rb(3.0, 2.6, 3.0, 0.35), rb(2.6, 2.0, 2.6, 0.3), rb(7.0, 2.4, 2.2, 0.45));
        // teto gordo de desenho animado: cápsula deitada, achatada no `put`
        let r_roof = meshes.add(Capsule3d::new(0.5, CAR_LEN - 1.2));
        let pastel = [(0.98, 0.97, 0.94), (0.97, 0.9, 0.78), (0.82, 0.9, 0.96), (0.98, 0.86, 0.84), (0.93, 0.93, 0.86)];
        let vivid = [(0.98, 0.78, 0.25), (0.35, 0.62, 0.85), (0.95, 0.55, 0.6), (0.45, 0.75, 0.5), (0.98, 0.6, 0.3), (0.75, 0.55, 0.85)];

        let tube = |r: u32| Cylinder::new(1.0, 1.0).mesh().resolution(r).build();
        let ball = |w: u32, h: u32| Sphere::new(1.0).mesh().uv(w, h);
        let spike = |r: u32| Cone::new(1.0, 1.0).mesh().resolution(r).build();
        let disc = |r: u32| Cylinder::new(0.42, 0.14).mesh().resolution(r).build();
        let tiers = [
            [tube(32), tube(10), tube(5)],
            [ball(16, 10), ball(10, 7), ball(6, 4)],
            [spike(32), spike(12), spike(6)],
            [art::coin(), disc(12), disc(6)],
        ]
        .map(|t| t.map(|m| meshes.add(m)));

        Self {
            cube: meshes.add(Cuboid::new(1.0, 1.0, 1.0)),
            cylinder: tiers[0][0].clone(),
            sphere: tiers[1][0].clone(),
            cone: tiers[2][0].clone(),
            coin_mesh: tiers[3][0].clone(),
            tiers: tiers.into(),
            plane: meshes.add(Plane3d::default().mesh().size(1.0, 1.0)),
            ramp: meshes.add(art::ramp(2.2, CAR_TOP, RAMP_LEN)),
            arch_big: meshes.add(art::arch(12.0, 10.0, 3.0, 5.0, 4.5)),
            arch: meshes.add(art::arch(6.0, 10.0, 3.0, 2.3, 5.5)),
            arch_top: meshes.add(art::arch(6.0, 5.0, 3.0, 1.9, 1.6)),
            roofs,
            modern,
            colonial,
            towers,
            m_modern: pastel.iter().map(|&(r, g, b)| tex_mat(mats, t_mod.clone(), Color::srgb(r, g, b), Vec2::ONE)).collect(),
            m_colonial: vivid.iter().map(|&(r, g, b)| tex_mat(mats, t_col.clone(), Color::srgb(r, g, b), Vec2::ONE)).collect(),
            m_glass: mats.add(StandardMaterial { base_color_texture: Some(t_gla), metallic: 0.6, perceptual_roughness: 0.2, ..default() }),
            // 2 repetições em y = 6 ondas por tile (3,3 m cada); inteiro para emendar entre tiles
            calcadao: tex_mat(mats, t_calc.clone(), Color::WHITE, Vec2::new(1.0, 2.0)),
            // faixa de 3,5 m com a mesma escala da pista de 9 m, para a onda não espremer
            calcadao_side: tex_mat(mats, t_calc.clone(), Color::WHITE, Vec2::new(3.5 / 9.0, 2.0)),
            cobble_light: tex_mat(mats, t_cob.clone(), Color::srgb(1.5, 1.45, 1.35), Vec2::new(1.0, 6.0)),
            asphalt: tex_mat(mats, t_asph, Color::WHITE, Vec2::new(1.0, 1.0)),
            sand: tex_mat(mats, t_sand.clone(), Color::WHITE, Vec2::new(5.0, 5.0)),
            sea: mats.add(StandardMaterial { base_color_texture: Some(t_sea), perceptual_roughness: 0.15, metallic: 0.1, uv_transform: Affine2::from_scale(Vec2::new(40.0, 2.0)), ..default() }),
            foam: mats.add(StandardMaterial { base_color: Color::srgba(1.0, 1.0, 1.0, 0.7), alpha_mode: AlphaMode::Blend, unlit: true, ..default() }),
            grass: tex_mat(mats, t_sand.clone(), Color::srgb(0.42, 0.78, 0.25), Vec2::new(6.0, 4.0)),
            rock: tex_mat(mats, t_sand, Color::srgb(0.5, 0.5, 0.48), Vec2::new(3.0, 3.0)),
            white: solid(mats, Color::srgb(0.96, 0.95, 0.92), 0.8),
            metal: mats.add(StandardMaterial { base_color: Color::srgb(0.7, 0.72, 0.75), metallic: 0.9, perceptual_roughness: 0.35, ..default() }),
            dark: solid(mats, Color::srgb(0.12, 0.12, 0.13), 0.6),
            trunk: solid(mats, Color::srgb(0.5, 0.37, 0.24), 0.95),
            leaf: solid(mats, Color::srgb(0.38, 0.75, 0.18), 0.85),
            canopy: solid(mats, Color::srgb(0.2, 0.55, 0.16), 0.9),
            tile_roof: tex_mat(mats, t_roof, Color::WHITE, Vec2::ONE),
            lamp_glow: glow(mats, LinearRgba::rgb(6.0, 4.5, 2.0)),
            umbrellas: [(0.95, 0.2, 0.2), (0.1, 0.5, 0.9), (1.0, 0.8, 0.1), (0.1, 0.7, 0.4), (0.98, 0.5, 0.1)]
                .iter().map(|&(r, g, b)| solid(mats, Color::srgb(r, g, b), 0.7)).collect(),
            barrier: tex_mat(mats, t_barrier, Color::WHITE, Vec2::ONE),
            sign: tex_mat(mats, t_sign, Color::WHITE, Vec2::ONE),
            vehicles: liveries.map(|(t, roof)| (paint(mats, Some(t), Color::WHITE), paint(mats, None, roof))),
            // repetição de 2,5 m alinhada às faixas (centro do dormente em x = -2,5; 0; 2,5)
            track: mats.add(StandardMaterial {
                base_color_texture: Some(t_track), perceptual_roughness: 0.95,
                uv_transform: Affine2::from_scale_angle_translation(Vec2::new(3.6, TILE_LEN / 0.8), 0.0, Vec2::new(-0.3, 0.0)), ..default()
            }),
            headlight: glow(mats, LinearRgba::rgb(12.0, 11.0, 8.0)),
            rubber: solid(mats, Color::srgb(0.05, 0.05, 0.05), 0.9),
            ramp_mat: tex_mat(mats, img(art::stripes([0.55, 0.57, 0.6], [0.35, 0.36, 0.4])), Color::WHITE, Vec2::new(1.0, 3.0)),
            // brasão em relevo pintado na textura; o emissivo usa a mesma textura para o brilho não lavar o desenho
            coin: { let t = img(art::coin_face()); mats.add(StandardMaterial { base_color_texture: Some(t.clone()), emissive_texture: Some(t), emissive: LinearRgba::rgb(1.3, 1.3, 1.3), metallic: 0.7, perceptual_roughness: 0.3, ..default() }) },
            r_body, r_roof, r_frame, r_windshield, r_led, r_bumper, r_mirror, r_board, r_leg, r_panel, r_kiosk, r_hut, r_tram,
            glass: mats.add(StandardMaterial { base_color: Color::srgb(0.5, 0.7, 0.86), perceptual_roughness: 0.12, reflectance: 0.6, ..default() }),
            led: glow(mats, LinearRgba::rgb(5.0, 2.2, 0.2)),
            blink: glow(mats, LinearRgba::rgb(8.0, 3.0, 0.3)),
        }
    }
}

// ---------- montagem dos tiles por bairro ----------

fn put(c: &mut ChildSpawnerCommands, mesh: &Handle<Mesh>, mat: &Pbr, t: Transform) {
    c.spawn((Mesh3d(mesh.clone()), MeshMaterial3d(mat.clone()), t));
}

/// LOD: só o que tem menos de ~2 pixels nessa distância pode sumir (retrovisor, cadeira de praia)…
const SMALL: f32 = 70.0;
/// …o resto vai até o fim da neblina e só perde resolução (poste, árvore, palmeira, rodas, moedas).
const DECOR: f32 = FOG_END;
/// Distâncias em que a malha passa de cheia para média e de média para simples.
const MID_AT: f32 = 40.0;
const LOW_AT: f32 = 110.0;

fn lod_level(distance: f32) -> u8 {
    (distance > MID_AT) as u8 + (distance > LOW_AT) as u8
}

/// A peça ganha detalhe conforme se aproxima. Só escreve ao cruzar um limite, então quase todo quadro não muda nada.
pub fn lod_meshes(art: Res<Art>, cam: Query<&GlobalTransform, With<Camera3d>>, mut q: Query<(&mut Lod, &mut Mesh3d, &GlobalTransform)>) {
    let Ok(cam) = cam.single() else { return };
    for (mut lod, mut mesh, t) in &mut q {
        let want = lod_level(cam.translation().distance(t.translation()));
        if lod.0 != want {
            lod.0 = want;
            if let Some(tier) = art.tiers.iter().find(|tier| tier.contains(&mesh.0)) {
                mesh.0 = tier[want as usize].clone();
            }
        }
    }
}

/// Some a `far` m da câmera; vale também para o mapa de sombras.
// ponytail: corte seco porque o crossfade quebra o pipeline no WebGL (Bevy 0.20.1 declara a binding 14
// com 16 bytes e o shader pede 1024); volte a usar margem quando o Bevy corrigir, se o "pop" incomodar.
fn lod(far: f32) -> VisibilityRange {
    VisibilityRange::abrupt(0.0, far)
}

/// `put` com LOD: troca de resolução pela distância e, se `far` for antes da neblina, some ali.
fn put_lod(c: &mut ChildSpawnerCommands, far: f32, mesh: &Handle<Mesh>, mat: &Pbr, t: Transform) {
    let mut e = c.spawn((Mesh3d(mesh.clone()), MeshMaterial3d(mat.clone()), t, Lod(0)));
    if far < FOG_END {
        e.insert(lod(far));
    }
}

/// Chão plano: recebe sombra, mas não entra no mapa de sombras (não teria o que sombrear).
fn ground(c: &mut ChildSpawnerCommands, art: &Art, mat: &Pbr, x0: f32, x1: f32, y: f32) {
    c.spawn((Mesh3d(art.plane.clone()), MeshMaterial3d(mat.clone()), NotShadowCaster,
        Transform::from_xyz((x0 + x1) / 2.0, y, 0.0).with_scale(Vec3::new(x1 - x0, 1.0, TILE_LEN))));
}

fn rails(c: &mut ChildSpawnerCommands, art: &Art) {
    for lane in LANES {
        for s in [-0.72, 0.72] {
            put_lod(c, DECOR, &art.cube, &art.metal, Transform::from_xyz(lane + s, 0.03, 0.0).with_scale(Vec3::new(0.1, 0.06, TILE_LEN)));
        }
    }
}

fn lamp(c: &mut ChildSpawnerCommands, art: &Art, x: f32, z: f32) {
    let s = -x.signum();
    put_lod(c, DECOR, &art.cylinder, &art.dark, Transform::from_xyz(x, 2.5, z).with_scale(Vec3::new(0.08, 5.0, 0.08)));
    put_lod(c, DECOR, &art.cylinder, &art.dark, Transform::from_xyz(x + s * 0.5, 5.0, z).with_rotation(Quat::from_rotation_z(FRAC_PI_2)).with_scale(Vec3::new(0.06, 1.1, 0.06)));
    put_lod(c, SMALL, &art.sphere, &art.dark, Transform::from_xyz(x + s * 1.0, 4.98, z).with_scale(Vec3::new(0.3, 0.12, 0.22)));
    put_lod(c, DECOR, &art.sphere, &art.lamp_glow, Transform::from_xyz(x + s * 1.0, 4.9, z).with_scale(Vec3::new(0.24, 0.08, 0.17)));
}

fn palm(c: &mut ChildSpawnerCommands, art: &Art, x: f32, z: f32, g: &mut Game) {
    let h = 5.5 + (g.rand() % 20) as f32 * 0.1;
    let lean = ((g.rand() % 100) as f32 / 100.0 - 0.5) * 0.25;
    let rot = Quat::from_rotation_z(lean);
    put_lod(c, DECOR, &art.cylinder, &art.trunk, Transform::from_xyz(x - lean * h / 2.0, h / 2.0, z).with_rotation(rot).with_scale(Vec3::new(0.17, h, 0.17)));
    let top = Vec3::new(x - lean * h, h, z);
    for i in 0..7 {
        let r = Quat::from_rotation_y(i as f32 * PI * 2.0 / 7.0 + lean) * Quat::from_rotation_x(0.45);
        put_lod(c, DECOR, &art.sphere, &art.leaf, Transform::from_translation(top + r * Vec3::new(0.0, 0.0, 1.3)).with_rotation(r).with_scale(Vec3::new(0.35, 0.06, 1.5)));
    }
    put_lod(c, SMALL, &art.sphere, &art.trunk, Transform::from_translation(top).with_scale(Vec3::splat(0.3)));
}

fn tree(c: &mut ChildSpawnerCommands, art: &Art, x: f32, y: f32, z: f32, s: f32) {
    put_lod(c, DECOR, &art.cylinder, &art.trunk, Transform::from_xyz(x, y + 1.5 * s, z).with_scale(Vec3::new(0.22 * s, 3.0 * s, 0.22 * s)));
    for (dx, dy, r) in [(0.0, 3.8, 1.8), (0.9, 3.2, 1.3), (-0.8, 3.4, 1.4)] {
        put_lod(c, DECOR, &art.sphere, &art.canopy, Transform::from_xyz(x + dx * s, y + dy * s, z).with_scale(Vec3::splat(r * s)));
    }
    // copa de cima mais clara: árvore em dois tons
    put_lod(c, DECOR, &art.sphere, &art.leaf, Transform::from_xyz(x + 0.2 * s, y + 4.9 * s, z).with_scale(Vec3::splat(1.1 * s)));
}

/// Prédio sobre o chão em `base_y`, frente voltada para a pista.
fn building(c: &mut ChildSpawnerCommands, (mesh, size): &(Handle<Mesh>, Vec3), mat: &Pbr, x: f32, base_y: f32, z: f32) {
    let x = x + x.signum() * size.x / 2.0;
    c.spawn((Mesh3d(mesh.clone()), MeshMaterial3d(mat.clone()), Transform::from_xyz(x, base_y + size.y / 2.0, z).with_rotation(Quat::from_rotation_y(FRAC_PI_2))));
}

fn copacabana(c: &mut ChildSpawnerCommands, art: &Art, serial: u32, g: &mut Game) {
    ground(c, art, &art.calcadao, -4.5, 4.5, 0.0);
    ground(c, art, &art.sand, -26.0, -4.5, -0.03);
    ground(c, art, &art.foam, -27.0, -25.5, -0.05);
    ground(c, art, &art.sea, -400.0, -26.0, -0.12);
    ground(c, art, &art.cobble_light, 4.5, 6.5, 0.0);
    ground(c, art, &art.asphalt, 6.5, 16.5, -0.02);
    ground(c, art, &art.calcadao_side, 16.5, 20.0, 0.0);
    palm(c, art, -5.6, -5.0, g);
    if serial % 3 == 0 {
        // quiosque de praia
        put_lod(c, DECOR, &art.r_kiosk, &art.white, Transform::from_xyz(-8.0, 1.3, 5.0));
        put_lod(c, SMALL, &art.r_windshield, &art.glass, Transform::from_xyz(-6.5, 1.7, 5.0).with_rotation(Quat::from_rotation_y(FRAC_PI_2)).with_scale(Vec3::new(1.2, 1.0, 1.0)));
        put_lod(c, DECOR, &art.cone, &art.umbrellas[(serial / 3 % 5) as usize], Transform::from_xyz(-8.0, 3.2, 5.0).with_scale(Vec3::new(2.4, 1.0, 2.4)));
        put_lod(c, SMALL, &art.sphere, &art.white, Transform::from_xyz(-8.0, 3.75, 5.0).with_scale(Vec3::splat(0.18)));
    } else {
        palm(c, art, -5.6, 5.0, g);
    }
    if serial % 7 == 3 {
        // posto de salva-vidas
        for (dx, dz) in [(-0.9, -0.9), (0.9, -0.9), (-0.9, 0.9), (0.9, 0.9)] {
            put_lod(c, DECOR, &art.cylinder, &art.white, Transform::from_xyz(-19.0 + dx, 1.5, dz).with_scale(Vec3::new(0.1, 3.0, 0.1)));
        }
        put_lod(c, DECOR, &art.r_hut, &art.barrier, Transform::from_xyz(-19.0, 4.0, 0.0));
        put_lod(c, SMALL, &art.r_windshield, &art.glass, Transform::from_xyz(-17.7, 4.2, 0.0).with_rotation(Quat::from_rotation_y(FRAC_PI_2)));
    }
    for _ in 0..3 {
        let (x, z) = (-10.0 - (g.rand() % 140) as f32 * 0.1, (g.rand() % 180) as f32 * 0.1 - 9.0);
        let m = &art.umbrellas[g.pick(5)];
        put_lod(c, SMALL, &art.cylinder, &art.white, Transform::from_xyz(x, 1.1, z).with_scale(Vec3::new(0.04, 2.2, 0.04)));
        put_lod(c, DECOR, &art.cone, m, Transform::from_xyz(x, 2.2, z).with_scale(Vec3::new(1.4, 0.45, 1.4)));
        put_lod(c, SMALL, &art.cube, m, Transform::from_xyz(x + 0.8, 0.2, z + 0.4).with_rotation(Quat::from_rotation_x(-0.5)).with_scale(Vec3::new(0.6, 0.06, 1.4)));
    }
    lamp(c, art, 5.4, 0.0);
    lamp(c, art, 16.0, 10.0);
    for b in 0..2 {
        let size = g.pick(art.modern.len() as u32);
        building(c, &art.modern[size], &art.m_modern[g.pick(art.m_modern.len() as u32)], 20.5, 0.0, -5.0 + b as f32 * 10.0);
    }
}

fn lapa(c: &mut ChildSpawnerCommands, art: &Art, serial: u32, gate: bool, g: &mut Game) {
    ground(c, art, &art.track, -4.5, 4.5, 0.0);
    rails(c, art);
    for s in [-1.0, 1.0] {
        ground(c, art, &art.cobble_light, if s < 0.0 { -8.0 } else { 4.5 }, if s < 0.0 { -4.5 } else { 8.0 }, 0.02);
        ground(c, art, &art.asphalt, if s < 0.0 { -60.0 } else { 8.0 }, if s < 0.0 { -8.0 } else { 60.0 }, -0.02);
        lamp(c, art, s * 5.4, 5.0);
        for i in 0..3 {
            let size = &art.colonial[g.pick(art.colonial.len() as u32)];
            let mat = &art.m_colonial[g.pick(art.m_colonial.len() as u32)];
            let z = -6.7 + i as f32 * 6.7;
            building(c, size, mat, s * 8.0, 0.0, z);
            // cornija
            let x = s * (8.0 + size.1.x / 2.0);
            put(c, &art.cube, &art.white, Transform::from_xyz(x - s * 0.15, size.1.y + 0.2, z).with_scale(Vec3::new(size.1.x + 0.4, 0.4, 6.8)));
        }
        if serial % 2 == 0 {
            let t = &art.towers[g.pick(art.towers.len() as u32)];
            building(c, t, &art.m_glass, s * 28.0, 0.0, 0.0);
        }
    }
    if gate || serial % 4 == 0 {
        arcos(c, art);
    }
}

/// Arcos da Lapa atravessando a pista: dois andares de arcos brancos e o bondinho no alto.
fn arcos(c: &mut ChildSpawnerCommands, art: &Art) {
    put(c, &art.arch_big, &art.white, Transform::from_xyz(0.0, 0.0, 0.0));
    for i in 1..=5 {
        for s in [-1.0, 1.0] {
            put(c, &art.arch, &art.white, Transform::from_xyz(s * (6.0 + 6.0 * i as f32 - 3.0), 0.0, 0.0));
        }
    }
    for i in -6..6 {
        put(c, &art.arch_top, &art.white, Transform::from_xyz(3.0 + 6.0 * i as f32, 10.0, 0.0));
    }
    put(c, &art.cube, &art.white, Transform::from_xyz(0.0, 15.2, 0.0).with_scale(Vec3::new(72.0, 0.4, 3.4)));
    put(c, &art.r_tram, &art.vehicles[2].0, Transform::from_xyz(-9.0, 16.6, 0.0));
}

fn santa_teresa(c: &mut ChildSpawnerCommands, art: &Art, serial: u32, g: &mut Game) {
    ground(c, art, &art.track, -4.5, 4.5, 0.0);
    rails(c, art);
    let slope: f32 = 0.38;
    for s in [-1.0f32, 1.0] {
        // muro de pedra e encosta subindo
        put(c, &art.cube, &art.cobble_light, Transform::from_xyz(s * 5.0, 0.6, 0.0).with_scale(Vec3::new(0.8, 1.2, TILE_LEN)));
        let w = 40.0;
        put(c, &art.plane, &art.grass, Transform::from_xyz(s * (5.4 + w / 2.0 * slope.cos()), w / 2.0 * slope.sin(), 0.0)
            .with_rotation(Quat::from_rotation_z(s * slope)).with_scale(Vec3::new(w, 1.0, TILE_LEN)));
        lamp(c, art, s * 5.0, if s < 0.0 { -4.0 } else { 6.0 });
        let hy = |x: f32| (x.abs() - 5.4) * slope.tan();
        // casarão com telhado de telha
        let (x, z) = (s * (11.0 + (g.rand() % 30) as f32 * 0.1), -4.0 + (g.rand() % 80) as f32 * 0.1);
        let roof = &art.roofs[g.pick(art.roofs.len() as u32)];
        let body = &art.colonial[(serial as usize + s as usize) % art.colonial.len()];
        let mat = &art.m_colonial[g.pick(art.m_colonial.len() as u32)];
        let base = hy(x) - 0.5;
        building(c, body, mat, x, base, z);
        let cx = x + s * body.1.x / 2.0;
        put(c, &roof.0, &art.tile_roof, Transform::from_xyz(cx, base + body.1.y, z).with_scale(Vec3::new(body.1.x / roof.1.x, 1.0, 1.0)));
        for _ in 0..3 {
            let tx = s * (7.0 + (g.rand() % 220) as f32 * 0.1);
            let tz = (g.rand() % 200) as f32 * 0.1 - 10.0;
            tree(c, art, tx, hy(tx) - 0.3, tz, 0.9 + (g.rand() % 6) as f32 * 0.1);
        }
    }
}

/// Entrada de Copacabana: boca de túnel sob o morro.
fn tunnel(c: &mut ChildSpawnerCommands, art: &Art) {
    put(c, &art.arch_big, &art.rock, Transform::from_xyz(0.0, 0.0, 0.0).with_scale(Vec3::new(1.0, 1.0, 2.0)));
    for s in [-1.0, 1.0] {
        put(c, &art.cube, &art.rock, Transform::from_xyz(s * 12.0, 5.0, 0.0).with_scale(Vec3::new(12.0, 10.0, 6.0)));
    }
    put(c, &art.sphere, &art.grass, Transform::from_xyz(0.0, 12.0, -6.0).with_scale(Vec3::new(40.0, 14.0, 14.0)));
}

fn build_tile(c: &mut ChildSpawnerCommands, art: &Art, zone: Zone, serial: u32, gate: bool, g: &mut Game) {
    match zone {
        Zone::Copacabana => {
            copacabana(c, art, serial, g);
            if gate {
                tunnel(c, art);
            }
        }
        Zone::Lapa => lapa(c, art, serial, gate, g),
        Zone::SantaTeresa => santa_teresa(c, art, serial, g),
    }
}

/// (Re)monta os tiles marcados; após reiniciar a corrida volta tudo para Copacabana.
pub fn decorate(
    mut commands: Commands,
    mut game: ResMut<Game>,
    art: Res<Art>,
    mut last_distance: Local<f32>,
    dirty: Query<(Entity, &Tile, &Transform), With<Dirty>>,
    all: Query<Entity, With<Tile>>,
) {
    if game.distance < *last_distance {
        for e in &all {
            commands.entity(e).insert(Dirty);
        }
    }
    *last_distance = game.distance;
    for (e, tile, t) in &dirty {
        let d = game.distance - t.translation.z;
        let zone = zone_at(d);
        let gate = d > TILE_LEN && zone != zone_at(d - TILE_LEN);
        let g = &mut *game;
        commands.entity(e).remove::<Dirty>().despawn_children().with_children(|c| build_tile(c, &art, zone, tile.serial, gate, g));
    }
}

/// O mar só existe nos tiles de Copacabana. A pista (300 m) é menor que uma zona (700 m), então bastam as duas pontas.
fn sea_in_view(distance: f32) -> bool {
    [distance - TILE_LEN, distance + TILE_LEN * TILES as f32].iter().any(|&d| zone_at(d) == Zone::Copacabana)
}

pub fn animate_sea(time: Res<Time>, game: Res<Game>, art: Res<Art>, mut mats: ResMut<Assets<StandardMaterial>>) {
    // `get_mut` faz o material ser reenviado à GPU, mesmo sem ninguém usando
    if !sea_in_view(game.distance) {
        return;
    }
    if let Some(mut m) = mats.get_mut(&art.sea) {
        let t = time.elapsed_secs();
        m.uv_transform = Affine2::from_scale_angle_translation(Vec2::new(40.0, 2.0), 0.0, Vec2::new(t * 0.02, (t * 0.6).sin() * 0.05));
    }
}

// ---------- fundo fixo: céu, nuvens, montanhas ----------

fn far_mat(mats: &mut Assets<StandardMaterial>, c: Color, unlit: bool) -> Pbr {
    mats.add(StandardMaterial { base_color: c, unlit, fog_enabled: false, perceptual_roughness: 1.0, ..default() })
}

pub fn setup(
    mut commands: Commands,
    mut meshes: ResMut<Assets<Mesh>>,
    mut mats: ResMut<Assets<StandardMaterial>>,
    mut images: ResMut<Assets<Image>>,
) {
    let art = Art::new(&mut meshes, &mut mats, &mut images);
    for i in 0..TILES {
        commands.spawn((Scroll, Tile { serial: i as u32 }, Dirty, Transform::from_xyz(0.0, 0.0, -(i as f32) * TILE_LEN), Visibility::default()));
    }

    let sky = mats.add(StandardMaterial { base_color: Color::WHITE, unlit: true, fog_enabled: false, cull_mode: None, ..default() });
    commands.spawn((Mesh3d(meshes.add(art::sky_dome(900.0, crate::fx::HORIZON, Color::srgb(0.55, 0.76, 0.96), Color::srgb(0.2, 0.45, 0.88)))), MeshMaterial3d(sky), NotShadowCaster));

    // perspectiva aérea: quanto mais longe, mais perto da cor do horizonte
    let haze = |c: Color, k: f32| Color::from(c.to_linear().mix(&crate::fx::HORIZON.to_linear(), k));
    let sphere = art.sphere.clone();
    let hill = |cmd: &mut Commands, mats: &mut Assets<StandardMaterial>, c: Color, k: f32, pos: Vec3, s: Vec3, tilt: f32| {
        let m = far_mat(mats, haze(c, k), false);
        cmd.spawn((Mesh3d(sphere.clone()), MeshMaterial3d(m), Transform::from_translation(pos).with_rotation(Quat::from_rotation_z(tilt)).with_scale(s)));
    };
    let rock = Color::srgb(0.38, 0.42, 0.36);
    let forest = Color::srgb(0.18, 0.4, 0.2);
    // Pão de Açúcar e Morro da Urca
    hill(&mut commands, &mut mats, rock, 0.35, Vec3::new(-150.0, 0.0, -520.0), Vec3::new(42.0, 120.0, 46.0), -0.12);
    hill(&mut commands, &mut mats, forest, 0.35, Vec3::new(-75.0, -5.0, -470.0), Vec3::new(75.0, 45.0, 50.0), 0.05);
    // Corcovado e serra ao fundo
    hill(&mut commands, &mut mats, forest, 0.45, Vec3::new(210.0, -30.0, -640.0), Vec3::new(110.0, 185.0, 90.0), 0.08);
    for (x, h, w) in [(-420.0, 90.0, 160.0), (-260.0, 70.0, 140.0), (40.0, 80.0, 170.0), (380.0, 110.0, 180.0), (560.0, 70.0, 150.0)] {
        hill(&mut commands, &mut mats, forest, 0.62, Vec3::new(x, -10.0, -780.0), Vec3::new(w, h, 60.0), 0.0);
    }
    // Ilhas no mar
    hill(&mut commands, &mut mats, forest, 0.5, Vec3::new(-420.0, -6.0, -300.0), Vec3::new(60.0, 22.0, 40.0), 0.0);
    hill(&mut commands, &mut mats, forest, 0.55, Vec3::new(-520.0, -6.0, -120.0), Vec3::new(45.0, 18.0, 30.0), 0.0);

    // bondinho do Pão de Açúcar
    let cable = far_mat(&mut mats, Color::srgb(0.2, 0.2, 0.2), true);
    let (a, b) = (Vec3::new(-75.0, 40.0, -470.0), Vec3::new(-150.0, 118.0, -520.0));
    let mid = (a + b) / 2.0;
    commands.spawn((Mesh3d(art.cylinder.clone()), MeshMaterial3d(cable), Transform::from_translation(mid)
        .with_rotation(Quat::from_rotation_arc(Vec3::Y, (b - a).normalize())).with_scale(Vec3::new(0.25, (b - a).length(), 0.25))));
    let car = far_mat(&mut mats, Color::srgb(0.85, 0.2, 0.15), false);
    commands.spawn((Mesh3d(art.cube.clone()), MeshMaterial3d(car), Transform::from_translation(mid - Vec3::Y * 2.5).with_scale(Vec3::new(4.0, 3.0, 3.0))));

    // Cristo Redentor no alto do Corcovado (estilizado, em escala maior para ser legível de longe)
    let statue = far_mat(&mut mats, haze(Color::srgb(0.95, 0.95, 0.92), 0.25), false);
    let top = Vec3::new(222.0, 150.0, -640.0);
    let s = 2.2;
    commands.spawn((Mesh3d(art.cube.clone()), MeshMaterial3d(statue.clone()), Transform::from_translation(top + Vec3::Y * 3.0 * s).with_scale(Vec3::new(5.0, 6.0, 5.0) * s)));
    commands.spawn((Mesh3d(meshes.add(ConicalFrustum { radius_top: 1.6, radius_bottom: 2.6, height: 18.0 })), MeshMaterial3d(statue.clone()),
        Transform::from_translation(top + Vec3::Y * 15.0 * s).with_scale(Vec3::splat(s))));
    commands.spawn((Mesh3d(art.cube.clone()), MeshMaterial3d(statue.clone()), Transform::from_translation(top + Vec3::Y * 21.0 * s).with_scale(Vec3::new(24.0, 2.2, 2.2) * s)));
    commands.spawn((Mesh3d(art.sphere.clone()), MeshMaterial3d(statue), Transform::from_translation(top + Vec3::Y * 24.5 * s).with_scale(Vec3::splat(1.8 * s))));

    // nuvens
    let cloud = far_mat(&mut mats, Color::srgb(1.0, 0.98, 0.96), true);
    for i in 0..9 {
        let base = Vec3::new(-600.0 + i as f32 * 150.0, 170.0 + (i % 3) as f32 * 40.0, -700.0 + (i % 2) as f32 * 120.0);
        for (dx, dy, r) in [(0.0, 0.0, 34.0), (30.0, -6.0, 24.0), (-32.0, -8.0, 26.0), (12.0, 10.0, 22.0)] {
            commands.spawn((Mesh3d(art.sphere.clone()), MeshMaterial3d(cloud.clone()),
                Transform::from_translation(base + Vec3::new(dx, dy, 0.0)).with_scale(Vec3::new(r * 1.6, r * 0.6, r))));
        }
    }
    // ônibus estacionado na rua, atrás do Levi na tela inicial (fora das faixas: nunca bate)
    vehicle(&mut commands, &art, Zone::Copacabana, 6.2, -9.0, None);
    commands.insert_resource(art);
}

// ---------- obstáculos ----------

pub fn scroll(
    time: Res<Time>,
    game: Res<Game>,
    mut commands: Commands,
    mut q: Query<(Entity, &mut Transform, Option<&mut Tile>, Has<Coin>, Option<&Mover>), With<Scroll>>,
) {
    let dt = time.delta_secs();
    let playing = game.phase == Phase::Playing;
    let dz = if playing { game.speed * dt } else { 0.0 };
    for (e, mut t, tile, coin, mover) in &mut q {
        let wake = playing && t.translation.z > MOVER_WAKE_Z;
        t.translation.z += dz + mover.filter(|_| wake).map_or(0.0, |m| m.0 * dt);
        if coin {
            t.rotate_y(4.0 * dt);
        }
        if t.translation.z > TILE_LEN {
            if let Some(mut tile) = tile {
                t.translation.z -= TILE_LEN * TILES as f32;
                tile.serial += TILES as u32;
                commands.entity(e).insert(Dirty);
            } else if t.translation.z > TILE_LEN + CAR_LEN {
                commands.entity(e).despawn();
            }
        }
    }
}

fn coin(commands: &mut Commands, art: &Art, pos: Vec3) {
    commands.spawn((Scroll, Coin, Mesh3d(art.coin_mesh.clone()), MeshMaterial3d(art.coin.clone()), Lod(0),
        Transform::from_translation(pos).with_rotation(Quat::from_rotation_x(FRAC_PI_2))));
}

/// Veículo do bairro (ônibus, VLT ou bonde) com teto pisável.
fn vehicle(commands: &mut Commands, art: &Art, zone: Zone, x: f32, z: f32, speed: Option<f32>) {
    let (body, roof) = &art.vehicles[zone as usize];
    let mut e = commands.spawn((
        Scroll,
        Obstacle(Vec3::new(1.1, CAR_TOP / 2.0, CAR_LEN / 2.0)),
        // teto cobre o vão de engate até o próximo carro, senão quem pousa ali cai e bate nele
        Platform { half: Vec2::new(1.1, (CAR_LEN + CAR_GAP) / 2.0), top: CAR_TOP, ramp: false },
        Transform::from_xyz(x, CAR_TOP / 2.0, z),
        Visibility::default(),
    ));
    if let Some(s) = speed {
        e.insert(Mover(s));
    }
    e.with_children(|c| {
        let front = CAR_LEN / 2.0;
        put(c, &art.r_body, body, Transform::from_xyz(0.0, -0.1, 0.0));
        put(c, &art.r_roof, roof, Transform::from_xyz(0.0, 0.9, 0.0).with_rotation(Quat::from_rotation_x(FRAC_PI_2)).with_scale(Vec3::new(2.26, 1.0, 0.95)));
        put_lod(c, DECOR, &art.r_frame, roof, Transform::from_xyz(0.0, 0.3, front - 0.03));
        put_lod(c, DECOR, &art.r_windshield, &art.glass, Transform::from_xyz(0.0, 0.3, front + 0.01));
        put_lod(c, DECOR, &art.r_led, &art.led, Transform::from_xyz(0.0, 0.8, front - 0.06));
        for s in [-1.0, 1.0] {
            put_lod(c, DECOR, &art.sphere, &art.headlight, Transform::from_xyz(s * 0.7, -0.62, front - 0.02).with_scale(Vec3::new(0.2, 0.15, 0.08)));
            put_lod(c, SMALL, &art.r_mirror, &art.dark, Transform::from_xyz(s * 1.2, 0.4, front - 0.5));
        }
        for z in [-front, front] {
            put_lod(c, DECOR, &art.r_bumper, &art.dark, Transform::from_xyz(0.0, -1.0, z));
        }
        for (wx, wz) in [(-1.0, -3.0), (1.0, -3.0), (-1.0, 3.0), (1.0, 3.0)] {
            let wheel = |s: f32| Transform::from_xyz(wx * s, -1.0, wz).with_rotation(Quat::from_rotation_z(FRAC_PI_2));
            put_lod(c, DECOR, &art.cylinder, &art.rubber, wheel(1.0).with_scale(Vec3::new(0.44, 0.3, 0.44)));
            put_lod(c, SMALL, &art.cylinder, &art.metal, wheel(1.03).with_scale(Vec3::new(0.22, 0.3, 0.22)));
        }
    });
}

pub fn spawn_rows(mut commands: Commands, mut game: ResMut<Game>, art: Res<Art>, mut busy: Local<[f32; 3]>) {
    // já no menu, para as primeiras fileiras não surgirem na pista ao tocar em jogar
    if !matches!(game.phase, Phase::Ready | Phase::Playing) || game.distance < game.next_spawn {
        return;
    }
    if game.next_spawn <= FIRST_ROW {
        *busy = [f32::NEG_INFINITY; 3]; // corrida nova
    }
    let d = game.next_spawn;
    // fileira atrasada (as do começo) entra mais perto, no lugar que seria o dela
    let spawn_z = SPAWN_Z + game.distance - d;
    game.next_spawn += 16.0 + game.speed * 0.4;
    let zone = zone_at(d - SPAWN_Z);

    // faixas ainda ocupadas por um trem comprido ficam de fora; uma das livres é sempre segura
    let free: Vec<usize> = (0..3).filter(|&l| busy[l] < d).collect();
    if free.is_empty() {
        return;
    }
    let safe = free[game.pick(free.len() as u32)];
    for lane in free {
        let x = LANES[lane];
        if lane == safe {
            for i in 0..5 {
                coin(&mut commands, &art, Vec3::new(x, 1.0, spawn_z + i as f32 * 2.2));
            }
            continue;
        }
        match game.pick(10) {
            0..=2 => {
                commands.spawn((Scroll, Obstacle(Vec3::new(1.0, 0.5, 0.2)), Transform::from_xyz(x, 0.5, spawn_z), Visibility::default()))
                    .with_children(|c| {
                        for y in [0.28, -0.12] {
                            put(c, &art.r_board, &art.barrier, Transform::from_xyz(0.0, y, 0.0));
                        }
                        for s in [-0.8, 0.8] {
                            for tilt in [-0.28, 0.28] {
                                put_lod(c, DECOR, &art.r_leg, &art.white, Transform::from_xyz(s, -0.03, 0.0).with_rotation(Quat::from_rotation_x(tilt)));
                            }
                            put_lod(c, DECOR, &art.sphere, &art.blink, Transform::from_xyz(s, 0.52, 0.0).with_scale(Vec3::splat(0.1)));
                        }
                    });
                // arco de moedas por cima da barreira
                if game.pick(2) == 0 {
                    for i in 0..5 {
                        let k = i as f32 / 4.0;
                        coin(&mut commands, &art, Vec3::new(x, 1.0 + 1.6 * (k * PI).sin(), spawn_z + 4.0 - k * 8.0));
                    }
                }
            }
            3..=4 => {
                commands.spawn((Scroll, Obstacle(Vec3::new(1.1, 0.5, 0.15)), Transform::from_xyz(x, 1.9, spawn_z), Visibility::default()))
                    .with_children(|c| {
                        put(c, &art.r_panel, &art.sign, Transform::IDENTITY);
                        for s in [-1.15, 1.15] {
                            put_lod(c, DECOR, &art.cylinder, &art.metal, Transform::from_xyz(s, -0.7, 0.0).with_scale(Vec3::new(0.07, 2.4, 0.07)));
                            put_lod(c, SMALL, &art.sphere, &art.metal, Transform::from_xyz(s, 0.52, 0.0).with_scale(Vec3::splat(0.1)));
                            put_lod(c, SMALL, &art.sphere, &art.dark, Transform::from_xyz(s, -1.9, 0.0).with_scale(Vec3::new(0.25, 0.08, 0.25)));
                        }
                    });
            }
            5..=7 => {
                // trem de 1 a 3 carros, às vezes com rampa para subir no teto
                let cars = 1 + game.pick(3);
                let ramp = game.pick(2) == 0;
                let front = if ramp { spawn_z - RAMP_LEN } else { spawn_z };
                if ramp {
                    commands.spawn((Scroll, Platform { half: Vec2::new(1.1, RAMP_LEN / 2.0), top: CAR_TOP, ramp: true },
                        Mesh3d(art.ramp.clone()), MeshMaterial3d(art.ramp_mat.clone()), Transform::from_xyz(x, 0.0, spawn_z - RAMP_LEN / 2.0)));
                    for i in 0..(3 + cars * 4) {
                        let z = spawn_z - 1.0 - i as f32 * 2.2;
                        let y = if z > front { CAR_TOP * (spawn_z - z) / RAMP_LEN } else { CAR_TOP };
                        coin(&mut commands, &art, Vec3::new(x, y + 1.0, z));
                    }
                }
                for k in 0..cars {
                    vehicle(&mut commands, &art, zone, x, front - CAR_LEN / 2.0 - k as f32 * (CAR_LEN + CAR_GAP), None);
                }
                busy[lane] = d + (spawn_z - front) + cars as f32 * (CAR_LEN + CAR_GAP) + 6.0;
            }
            8 if game.distance > 300.0 => {
                vehicle(&mut commands, &art, zone, x, spawn_z - CAR_LEN / 2.0, Some(8.0));
                busy[lane] = d + 40.0;
            }
            _ => {
                for i in 0..5 {
                    coin(&mut commands, &art, Vec3::new(x, 1.0, spawn_z + i as f32 * 2.2));
                }
            }
        }
    }
}

/// AABB por centro/meia-extensão.
fn hit(a: Vec3, ha: Vec3, b: Vec3, hb: Vec3) -> bool {
    ((a - b).abs() - (ha + hb)).max_element() < 0.0
}

/// Altura do piso sob o jogador; teto acima de `feet + passo` é parede, não piso. Rampa não tem parede:
/// é sempre piso, mesmo entrando pelo lado no meio dela.
pub fn ground_at<'a>(x: f32, feet: f32, platforms: impl Iterator<Item = (&'a Transform, &'a Platform)>) -> f32 {
    platforms.filter_map(|(t, p)| p.height_at(t, x).filter(|&h| p.ramp || feet >= h - 0.6)).fold(0.0, f32::max)
}

/// Batida lateral (no meio da troca de faixa) = tropeço e volta para a faixa anterior;
/// batida de frente ou segundo tropeço em 3 s = queda.
pub fn collide(
    mut commands: Commands,
    mut game: ResMut<Game>,
    mut player: Query<(&mut Player, &Transform)>,
    obstacles: Query<(&Transform, &Obstacle, Option<&Platform>)>,
    coins: Query<(Entity, &Transform), With<Coin>>,
    mut sfx: MessageWriter<Sfx>,
    mut shake: MessageWriter<Shake>,
    mut burst: MessageWriter<Burst>,
) {
    if game.phase != Phase::Playing {
        return;
    }
    let Ok((mut p, t)) = player.single_mut() else { return };
    let h = if p.slide > 0.0 { 0.8 } else { 1.7 };
    let half = Vec3::new(0.35, h / 2.0, 0.3);
    let center = Vec3::new(t.translation.x, p.y + h / 2.0, 0.0);
    let blocking = obstacles.iter().find(|(ot, o, plat)| {
        // em cima do teto não é batida
        plat.is_none_or(|pl| p.y < pl.top - 0.5) && hit(center, half, ot.translation, o.0)
    });
    if let Some((ot, _, _)) = blocking {
        let side = (t.translation.x - LANES[p.lane]).abs() > 0.25;
        if side && game.since_stumble < 0.4 {
            // ainda saindo do tropeço anterior
        } else if side && game.since_stumble > 3.0 {
            p.stumble = 0.45;
            p.stumble_clip = if ot.translation.x > t.translation.x { Clip::StumbleR } else { Clip::StumbleL };
            (p.lane, p.prev_lane) = (p.prev_lane, p.lane);
            game.since_stumble = 0.0;
            game.speed *= 0.85;
            sfx.write(Sfx::Stumble);
            shake.write(Shake(0.5));
            burst.write(Burst(center, BurstKind::Dust));
        } else {
            game.phase = Phase::Dying;
            game.dying = 0.0;
            sfx.write(Sfx::Crash);
            shake.write(Shake(1.0));
            burst.write(Burst(center + Vec3::Z * -0.4, BurstKind::Debris));
        }
    }
    for (e, ct) in &coins {
        if hit(center, half, ct.translation, Vec3::splat(0.45)) {
            game.coins += 1;
            sfx.write(Sfx::Coin);
            burst.write(Burst(ct.translation, BurstKind::Sparkle));
            commands.entity(e).despawn();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mar_anima_so_com_copacabana_na_pista() {
        assert!(sea_in_view(0.0));
        // Copacabana já aparece no fim da pista, antes de o jogador chegar nela
        assert!(sea_in_view(ZONE_LEN * 3.0 - 100.0));
        // o último tile de Copacabana ainda está passando pela câmera
        assert!(sea_in_view(ZONE_LEN + 10.0));
        assert!(!sea_in_view(ZONE_LEN + TILE_LEN + 1.0));
        assert!(!sea_in_view(ZONE_LEN * 2.0));
    }

    #[test]
    fn aabb() {
        let h = Vec3::splat(0.5);
        assert!(hit(Vec3::ZERO, h, Vec3::new(0.9, 0.0, 0.0), h));
        assert!(!hit(Vec3::ZERO, h, Vec3::new(1.1, 0.0, 0.0), h));
        // pulando por cima da barreira (topo em y=1.0)
        assert!(!hit(Vec3::new(0.0, 1.9, 0.0), Vec3::new(0.35, 0.85, 0.3), Vec3::new(0.0, 0.5, 0.0), Vec3::new(1.0, 0.5, 0.2)));
        // rolando embaixo da placa (base em y=1.4)
        assert!(!hit(Vec3::new(0.0, 0.4, 0.0), Vec3::new(0.35, 0.4, 0.3), Vec3::new(0.0, 1.9, 0.0), Vec3::new(1.1, 0.5, 0.15)));
    }

    #[test]
    fn lod_nada_surge_do_nada() {
        // só some o que é miúdo, e sempre antes do fim da neblina
        assert!(!lod(SMALL).is_culled(10.0) && lod(SMALL).is_culled(SMALL + 1.0));
        assert!(SMALL < FOG_END && DECOR == FOG_END);
        // com crossfade o jogo fecha no WebGL: "Validation RenderError" em pbr_opaque_mesh_pipeline
        assert!(lod(SMALL).is_abrupt());
        // detalhe só aumenta ao se aproximar
        assert_eq!([10.0, 60.0, 200.0].map(lod_level), [0, 1, 2]);
        // tile reciclado e fileira nova aparecem além da neblina (câmera em z = 5,5)
        assert!(TILE_LEN * (TILES as f32 - 1.5) + 5.5 >= FOG_END);
        assert!(5.5 - SPAWN_Z >= FOG_END);
    }

    /// Rampa + 2 carros na faixa do meio, com os sistemas reais do jogo, na mesma ordem do `main`.
    fn train_app(speed: f32, low_end: f32) -> (App, Entity) {
        let mut app = App::new();
        app.add_message::<Sfx>().add_message::<Shake>().add_message::<Burst>().init_resource::<Time>();
        app.insert_resource(Game { phase: Phase::Playing, speed, ..Game::new(1) });
        app.add_systems(Update, (scroll, crate::player::physics, collide).chain());
        let ramp = app.world_mut().spawn((Scroll, Platform { half: Vec2::new(1.1, RAMP_LEN / 2.0), top: CAR_TOP, ramp: true }, Transform::from_xyz(0.0, 0.0, low_end - RAMP_LEN / 2.0))).id();
        for k in 0..2 {
            let z = low_end - RAMP_LEN - CAR_LEN / 2.0 - k as f32 * (CAR_LEN + CAR_GAP);
            app.world_mut().spawn((Scroll, Obstacle(Vec3::new(1.1, CAR_TOP / 2.0, CAR_LEN / 2.0)), Platform { half: Vec2::new(1.1, (CAR_LEN + CAR_GAP) / 2.0), top: CAR_TOP, ramp: false }, Transform::from_xyz(0.0, CAR_TOP / 2.0, z)));
        }
        (app, ramp)
    }

    /// Corre até passar o 1º carro. `enter`: vem da faixa ao lado e entra na rampa com a ponta baixa `enter` metros atrás do jogador.
    fn survives(speed: f32, dt: f32, low_end: f32, mut enter: Option<f32>) -> bool {
        let (mut app, ramp) = train_app(speed, low_end);
        let lane = if enter.is_some() { 0 } else { 1 };
        let mut p = Player::new();
        (p.lane, p.prev_lane) = (lane, lane);
        let pl = app.world_mut().spawn((p, Transform::from_xyz(LANES[lane], 0.0, 0.0))).id();
        loop {
            app.world_mut().resource_mut::<Time>().advance_by(std::time::Duration::from_secs_f32(dt));
            let low_end = app.world().get::<Transform>(ramp).unwrap().translation.z + RAMP_LEN / 2.0;
            if enter.is_some_and(|e| low_end >= e) {
                enter = None;
                let mut p = app.world_mut().get_mut::<Player>(pl).unwrap();
                (p.lane, p.prev_lane) = (1, 0);
            }
            app.update();
            if app.world().resource::<Game>().phase != Phase::Playing {
                return false;
            }
            if low_end > RAMP_LEN + CAR_LEN {
                return true;
            }
        }
    }

    #[test]
    fn rampa_nao_mata_em_nenhum_fps() {
        let dts = [1.0 / 120.0, 1.0 / 60.0, 1.0 / 30.0, crate::MAX_DT];
        let mut bad = vec![];
        for s in [14.0, 20.0, 27.0, 34.0] {
            for d in dts {
                // a posição da rampa em relação ao frame muda o resultado: varre as fases
                if !(0..40).all(|i| survives(s, d, -2.0 - i as f32 * 0.05, None)) {
                    bad.push((s, (1.0 / d).round() as u32));
                }
            }
        }
        assert!(bad.is_empty(), "morreu subindo reto (vel, fps): {bad:?}");
    }

    #[test]
    fn entrar_na_rampa_pelo_lado_nao_mata() {
        let bad: Vec<_> = (0..14).map(|i| i as f32 * 0.5).flat_map(|e| [14.0, 34.0].map(|s| (s, e, survives(s, 1.0 / 60.0, -2.0, Some(e))))).filter(|r| !r.2).collect();
        assert!(bad.is_empty(), "morreu entrando de lado (vel, metros de rampa): {bad:?}");
    }

    #[test]
    fn cair_no_vao_entre_carros_nao_mata() {
        // já dentro do vão (1º carro passou, 2º a 1,1 m), descendo de um pulo na altura do teto; rampa longe
        let (mut app, ramp) = train_app(14.0, -2.0);
        app.world_mut().get_mut::<Transform>(ramp).unwrap().translation.z = 100.0;
        let mut cars = app.world_mut().query_filtered::<&mut Transform, With<Obstacle>>();
        for mut t in cars.iter_mut(app.world_mut()) {
            t.translation.z += 2.0 + RAMP_LEN + CAR_LEN + 0.1;
        }
        let mut p = Player::new();
        (p.y, p.vy, p.floor) = (CAR_TOP + 0.01, -crate::player::JUMP_V, CAR_TOP);
        app.world_mut().spawn((p, Transform::default()));
        for _ in 0..30 {
            app.world_mut().resource_mut::<Time>().advance_by(std::time::Duration::from_secs_f32(1.0 / 60.0));
            app.update();
        }
        assert!(app.world().resource::<Game>().phase == Phase::Playing, "morreu no vão entre os carros");
    }

    #[test]
    fn ramp_and_roof() {
        let ramp = Platform { half: Vec2::new(1.1, 3.5), top: CAR_TOP, ramp: true };
        // ponta baixa no jogador (centro em -3.5) → altura 0; ponta alta no jogador → teto
        assert_eq!(ramp.height_at(&Transform::from_xyz(0.0, 0.0, -3.5), 0.0), Some(0.0));
        assert_eq!(ramp.height_at(&Transform::from_xyz(0.0, 0.0, 3.5), 0.0), Some(CAR_TOP));
        assert_eq!(ramp.height_at(&Transform::from_xyz(2.5, 0.0, 0.0), 0.0), None);
        let roof = Platform { half: Vec2::new(1.1, 4.5), top: CAR_TOP, ramp: false };
        let t = Transform::from_xyz(0.0, 0.0, 0.0);
        // no chão, o teto é parede; já em cima, é piso
        assert_eq!(ground_at(0.0, 0.0, [(&t, &roof)].into_iter()), 0.0);
        assert_eq!(ground_at(0.0, CAR_TOP, [(&t, &roof)].into_iter()), CAR_TOP);
    }
}
