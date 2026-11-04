//! Câmera (seguimento, FOV, tremida), luz e partículas.

use bevy::{camera::Hdr, render::view::{ColorGrading, ColorGradingGlobal}, core_pipeline::tonemapping::Tonemapping, light::{cascade::Cascade, CascadeShadowConfigBuilder, Cascades, DirectionalLightShadowMap, ShadowFilteringMethod}, post_process::bloom::Bloom, prelude::*};

use crate::{player::Player, world::Scroll, Burst, BurstKind, Game, Phase, Shake, MAX_SPEED, START_SPEED};

/// Cor do horizonte: base do céu, neblina e perspectiva aérea do fundo.
pub const HORIZON: Color = Color::srgb(0.78, 0.89, 0.97);

/// Lado da textura de sombras.
const SHADOW_MAP: usize = 2048;
/// Trecho do mundo que recebe sombra (cantos opostos). Cobre o que a câmera vê até o fim das sombras (90 m).
const SHADOW_BOX: [Vec3; 2] = [Vec3::new(-40.0, 0.0, -85.0), Vec3::new(40.0, 30.0, 12.0)];

#[derive(Resource, Default)]
pub struct CamFx {
    trauma: f32,
    x: f32,
    /// 0 = close do menu, 1 = câmera de corrida
    zoom: f32,
    t: f32,
}

#[derive(Component)]
pub struct Particle {
    vel: Vec3,
    life: f32,
    max: f32,
    size: f32,
}

#[derive(Resource)]
pub struct ParticleKit {
    mesh: Handle<Mesh>,
    dust: Handle<StandardMaterial>,
    gold: Handle<StandardMaterial>,
    debris: [Handle<StandardMaterial>; 3],
}

pub fn setup(mut commands: Commands, mut meshes: ResMut<Assets<Mesh>>, mut mats: ResMut<Assets<StandardMaterial>>) {
    commands.init_resource::<CamFx>();
    commands.spawn((
        Camera3d::default(),
        Hdr,
        ShadowFilteringMethod::Hardware2x2,
        Tonemapping::TonyMcMapface,
        // cara de desenho animado: cores bem saturadas
        ColorGrading { global: ColorGradingGlobal { post_saturation: 1.35, exposure: 0.15, ..default() }, ..default() },
        Bloom { intensity: 0.12, ..Bloom::NATURAL },
        DistanceFog {
            color: HORIZON,
            directional_light_color: Color::srgba(1.0, 0.92, 0.75, 0.5),
            directional_light_exponent: 20.0,
            falloff: FogFalloff::Linear { start: 80.0, end: crate::world::FOG_END },
        },
        Transform::from_xyz(0.0, 2.4, 5.5).looking_at(Vec3::new(0.0, 1.1, 0.0), Vec3::Y),
    ));
    commands.insert_resource(ClearColor(HORIZON));
    commands.insert_resource(GlobalAmbientLight { color: Color::srgb(0.75, 0.85, 1.0), brightness: 1300.0, ..default() });
    // sol de fim de tarde, alto e à esquerda, sombras longas e legíveis
    commands.spawn((
        DirectionalLight { illuminance: 11000.0, color: Color::srgb(1.0, 0.9, 0.75), shadow_maps_enabled: true, ..default() },
        Transform::from_xyz(-14.0, 18.0, 6.0).looking_at(Vec3::ZERO, Vec3::Y),
        // WebGL só usa 1 cascata: com 2, valia só a primeira e a sombra parava nela
        CascadeShadowConfigBuilder { num_cascades: 1, maximum_distance: 90.0, ..default() }.build(),
    ));
    commands.insert_resource(DirectionalLightShadowMap { size: SHADOW_MAP });
    let mut unlit = |c: Color| mats.add(StandardMaterial { base_color: c, unlit: true, ..default() });
    commands.insert_resource(ParticleKit {
        mesh: meshes.add(Cuboid::new(1.0, 1.0, 1.0)),
        dust: unlit(Color::srgb(0.85, 0.8, 0.7)),
        gold: unlit(Color::srgb(1.0, 0.9, 0.3)),
        debris: [unlit(Color::srgb(0.98, 0.78, 0.1)), unlit(Color::srgb(0.95, 0.45, 0.1)), unlit(Color::srgb(0.9, 0.9, 0.9))],
    });
}

pub fn camera(
    time: Res<Time>,
    game: Res<Game>,
    mut fx: ResMut<CamFx>,
    mut shakes: MessageReader<Shake>,
    player: Query<&Transform, With<Player>>,
    mut cam: Query<(&mut Transform, &mut Projection), (With<Camera3d>, Without<Player>)>,
) {
    let (Ok(p), Ok((mut t, mut proj))) = (player.single(), cam.single_mut()) else { return };
    let dt = time.delta_secs();
    for s in shakes.read() {
        fx.trauma = (fx.trauma + s.0).min(1.0);
    }
    fx.t += dt;
    fx.trauma = (fx.trauma - 1.4 * dt).max(0.0);
    let dx = p.translation.x * 0.7 - fx.x;
    fx.x += dx * (5.0 * dt).min(1.0);
    let zoom = if game.phase == Phase::Ready { 0.0 } else { 1.0 };
    fx.zoom += (zoom - fx.zoom) * (2.5 * dt).min(1.0);

    let k = fx.trauma * fx.trauma * 0.4;
    let shake = Vec3::new((fx.t * 37.0).sin(), (fx.t * 53.0).sin(), 0.0) * k;
    let lift = p.translation.y;
    // no teto dos veículos a câmera sobe junto
    let eye = Vec3::new(fx.x, 2.4, 5.5).lerp(Vec3::new(fx.x, 5.5 + lift * 0.6, 9.0), fx.zoom) + shake;
    let look = Vec3::new(fx.x, 1.1, 0.0).lerp(Vec3::new(fx.x, 1.5 + lift * 0.5, -6.0), fx.zoom);
    *t = Transform::from_translation(eye).looking_at(look, Vec3::Y);
    t.rotate_local_z(-dx * 0.04);

    if let Projection::Perspective(pp) = &mut *proj {
        let rush = ((game.speed - START_SPEED) / (MAX_SPEED - START_SPEED)).clamp(0.0, 1.0);
        pp.fov = (52.0 + 14.0 * rush * fx.zoom).to_radians();
    }
}

/// O Bevy ajusta a sombra à câmera, e a nossa muda de FOV com a velocidade: a grade de texels muda de tamanho aos saltos.
/// E o mundo rola sobre essa grade parada, então cada borda cai num texel diferente a cada quadro: a sombra treme.
/// Aqui a área é fixa e a grade anda junto com o mundo, então cada objeto cai sempre nos mesmos texels.
pub fn stable_shadows(game: Res<Game>, mut lights: Query<(&GlobalTransform, &mut Cascades)>) {
    for (sun, mut cascades) in &mut lights {
        let cascade = shadow_cascade(sun.rotation(), game.distance);
        for view in cascades.cascades.values_mut() {
            view.fill(cascade.clone());
        }
    }
}

/// Mesma projeção de `calculate_cascade` do Bevy, trocando só o enquadramento.
fn shadow_cascade(sun: Quat, scrolled: f32) -> Cascade {
    let world_from_light = Mat4::from_quat(sun);
    let light_from_world = world_from_light.transpose();
    let [a, b] = SHADOW_BOX;
    let (mut min, mut max) = (Vec3::MAX, Vec3::MIN);
    for i in 0..8 {
        let corner = light_from_world.transform_vector3(Vec3::select(BVec3::new(i & 1 == 0, i & 2 == 0, i & 4 == 0), a, b));
        min = min.min(corner);
        max = max.max(corner);
    }
    // +1 m: o centro abaixo anda até 1 texel para o lado, e a caixa precisa continuar coberta
    let diameter = (max - min).xy().max_element().ceil() + 1.0;
    let texel = diameter / SHADOW_MAP as f32;
    // centro em múltiplos de texel contados a partir de um ponto que rola com o mundo
    let anchor = light_from_world.transform_vector3(Vec3::Z * scrolled).xy();
    let center = (anchor + (((min + max).xy() / 2.0 - anchor) / texel).floor() * texel).extend(max.z);
    let [x, y, z, _] = light_from_world.to_cols_array_2d().map(Vec4::from_array);
    let cascade_from_world = Mat4::from_cols(x, y, z, (-center).extend(1.0));
    let mut world_from_cascade = world_from_light;
    world_from_cascade.w_axis = world_from_light.transform_point3(center).extend(1.0);
    // ortográfica com Z invertido
    let clip_from_cascade = Mat4::from_cols(
        Vec4::new(2.0 / diameter, 0.0, 0.0, 0.0),
        Vec4::new(0.0, 2.0 / diameter, 0.0, 0.0),
        Vec4::new(0.0, 0.0, (max.z - min.z).recip(), 0.0),
        Vec4::new(0.0, 0.0, 1.0, 1.0),
    );
    Cascade { world_from_cascade, clip_from_cascade, clip_from_world: clip_from_cascade * cascade_from_world, texel_size: texel }
}

pub fn particles(
    time: Res<Time>,
    mut commands: Commands,
    kit: Res<ParticleKit>,
    mut game: ResMut<Game>,
    mut bursts: MessageReader<Burst>,
    mut q: Query<(Entity, &mut Particle, &mut Transform)>,
) {
    for Burst(pos, kind) in bursts.read() {
        let (n, speed, up, size) = match kind {
            BurstKind::Dust => (10, 2.0, 1.5, 0.14),
            BurstKind::Sparkle => (8, 2.5, 2.5, 0.1),
            BurstKind::Debris => (24, 5.0, 5.0, 0.2),
        };
        for i in 0..n {
            let mut r = || (game.rand() % 1000) as f32 / 500.0 - 1.0;
            let vel = Vec3::new(r() * speed, (r().abs() + 0.5) * up, r() * speed);
            let mat = match kind {
                BurstKind::Dust => kit.dust.clone(),
                BurstKind::Sparkle => kit.gold.clone(),
                BurstKind::Debris => kit.debris[i % 3].clone(),
            };
            let life = 0.4 + 0.3 * r().abs();
            commands.spawn((Scroll, Particle { vel, life, max: life, size }, Mesh3d(kit.mesh.clone()), MeshMaterial3d(mat),
                Transform::from_translation(*pos).with_scale(Vec3::splat(size))));
        }
    }
    let dt = time.delta_secs();
    for (e, mut p, mut t) in &mut q {
        p.life -= dt;
        if p.life <= 0.0 {
            commands.entity(e).despawn();
            continue;
        }
        p.vel.y -= 12.0 * dt;
        t.translation += p.vel * dt;
        if t.translation.y < 0.05 {
            t.translation.y = 0.05;
            p.vel *= 0.5;
        }
        t.scale = Vec3::splat(p.size * p.life / p.max);
        t.rotate_x(6.0 * dt);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn shadow_grid_rolls_with_the_world() {
        let sun = Transform::from_xyz(-14.0, 18.0, 6.0).looking_at(Vec3::ZERO, Vec3::Y).rotation;
        // posição em texels da textura
        let texels = |c: &Cascade, p: Vec3| c.clip_from_world.project_point3(p).xy() * SHADOW_MAP as f32 / 2.0;
        let (start, spot) = (1000.0, Vec3::new(3.0, 1.0, -30.0));
        let before = shadow_cascade(sun, start);
        for frame in 1..2000 {
            let d = frame as f32 * 0.37;
            let now = shadow_cascade(sun, start + d);
            // o mesmo ponto do cenário, já rolado: mesma fração de texel (a grade só pula de 1 em 1)
            let shift = texels(&now, spot + Vec3::Z * d) - texels(&before, spot);
            assert!((shift - shift.round()).abs().max_element() < 0.1, "frame {frame}: {shift}");
            // e a caixa inteira segue dentro da textura e da faixa de profundidade
            for x in [SHADOW_BOX[0].x, SHADOW_BOX[1].x] {
                for y in [SHADOW_BOX[0].y, SHADOW_BOX[1].y] {
                    for z in [SHADOW_BOX[0].z, SHADOW_BOX[1].z] {
                        let clip = now.clip_from_world.project_point3(Vec3::new(x, y, z));
                        assert!(clip.xy().abs().max_element() <= 1.0 && (-0.001..=1.001).contains(&clip.z), "{clip}");
                    }
                }
            }
        }
    }
}
