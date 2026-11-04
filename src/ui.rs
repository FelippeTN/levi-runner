//! HUD de runner de desenho animado: placas escuras com números grossos no canto, botões azuis
//! gordinhos, selo do título sobre bolhas azuis e "toque para jogar" pulsando. Também a pausa.

use bevy::{
    picking::{
        events::PointerClick,
        Pickable,
    },
    prelude::*,
};

use crate::{audio::Sounds, world, Game, Phase};

#[derive(Component, Clone, Copy, PartialEq)]
pub enum Hud {
    Score,
    Coins,
    Title,
    Banner,
    Cta,
    Hint,
    Sound,
    /// nome do bairro ao entrar nele
    Zone,
}

#[derive(Clone, Copy, PartialEq)]
pub enum Screen {
    Menu,
    Playing,
    Paused,
}

/// Painel visível só nessas telas.
#[derive(Component)]
pub struct Show(&'static [Screen]);

#[derive(Component)]
pub struct Pulse;

/// Cliques nos botões da interface; cada sistema zera o que consome.
#[derive(Resource, Default)]
pub struct UiClick {
    pub pause: bool,
    pub sound: bool,
    /// algum botão foi clicado: o clique não vale como "jogar"
    pub any: bool,
}

const GOLD: Color = Color::srgb(1.0, 0.82, 0.15);
const TITLE: Color = Color::srgb(1.0, 0.86, 0.12);
const NAVY: Color = Color::srgb(0.03, 0.1, 0.25);
const CORAL: Color = Color::srgb(0.95, 0.35, 0.3);

/// Fira Sans Bold só com Latin-1, travessão e setas (a fonte padrão do Bevy é só ASCII).
const FONT: &[u8] = include_bytes!("../assets/fonts/FiraSans-Bold-subset.ttf");

fn vgrad(top: Color, bottom: Color) -> BackgroundGradient {
    BackgroundGradient::from(LinearGradient::to_bottom(vec![top.into(), bottom.into()]))
}

/// Botão azul de borda branca com "degrau" embaixo (sombra dura deslocada).
fn blue_button() -> impl Bundle {
    (        vgrad(Color::srgb(0.3, 0.65, 1.0), Color::srgb(0.06, 0.35, 0.85)),
        BorderColor::all(Color::WHITE),
        BoxShadow::new(Color::srgb(0.02, 0.15, 0.4), px(0), px(5), px(0), px(0)),
    )
}

/// Placa escura translúcida dos números do HUD.
fn plate() -> impl Bundle {
    (
        BackgroundColor(Color::srgba(0.02, 0.06, 0.14, 0.72)),
        BorderColor { top: Color::srgba(1.0, 1.0, 1.0, 0.25), bottom: Color::srgba(0.0, 0.0, 0.0, 0.4), left: Color::NONE, right: Color::NONE },
    )
}

pub fn setup(mut commands: Commands, mut fonts: ResMut<Assets<Font>>) {
    commands.init_resource::<UiClick>();
    let face = fonts.add(Font::from_bytes(FONT.to_vec()));
    let font = |size: f32| TextFont { font: face.clone().into(), font_size: FontSize::Px(size), ..default() };
    let shadow = |y: f32| TextShadow { offset: Vec2::new(0.0, y), color: NAVY };
    let plate_node = Node {
        padding: UiRect::axes(px(14), px(4)),
        border: UiRect::vertical(px(2)),
        border_radius: BorderRadius::all(px(12)),
        align_items: AlignItems::Center,
        column_gap: px(8),
        ..default()
    };
    const ALL: &[Screen] = &[Screen::Menu, Screen::Playing, Screen::Paused];

    // pausa (canto superior esquerdo)
    commands
        .spawn((
            Show(&[Screen::Playing, Screen::Paused]),
            blue_button(),
            Node {
                position_type: PositionType::Absolute,
                top: px(14),
                left: px(14),
                width: px(54),
                height: px(54),
                border: UiRect::all(px(3)),
                border_radius: BorderRadius::all(px(14)),
                justify_content: JustifyContent::Center,
                align_items: AlignItems::Center,
                column_gap: px(7),
                ..default()
            },
        ))
        .with_children(|b| {
            for _ in 0..2 {
                b.spawn((Node { width: px(7), height: px(22), border_radius: BorderRadius::all(px(2)), ..default() }, BackgroundColor(Color::WHITE)));
            }
        })
        .observe(|_: On<PointerClick>, mut c: ResMut<UiClick>| (c.pause, c.any) = (true, true));

    // pontos e moedas empilhados no canto superior direito
    commands
        .spawn((
            Show(ALL),
            Node { position_type: PositionType::Absolute, top: px(14), right: px(14), flex_direction: FlexDirection::Column, align_items: AlignItems::End, row_gap: px(8), ..default() },
        ))
        .with_children(|col| {
            col.spawn((Show(&[Screen::Playing, Screen::Paused]), plate(), plate_node.clone())).with_children(|p| {
                p.spawn((Hud::Score, Text::new(""), font(38.0), shadow(3.0)));
            });
            col.spawn((plate(), plate_node.clone())).with_children(|p| {
                p.spawn((Hud::Coins, Text::new("0"), font(30.0), TextColor(GOLD), shadow(3.0)));
                p.spawn((
                    vgrad(Color::srgb(1.0, 0.93, 0.5), Color::srgb(0.95, 0.6, 0.05)),
                    BorderColor::all(Color::srgb(0.8, 0.48, 0.0)),
                    Node { width: px(26), height: px(26), border: UiRect::all(px(3)), border_radius: BorderRadius::MAX, ..default() },
                ));
            });
        });

    // início / fim de jogo: selo do título no alto, "toque para jogar" embaixo (o Levi fica no meio)
    commands
        .spawn((
            Show(&[Screen::Menu]),
            Pickable::IGNORE,
            Node {
                position_type: PositionType::Absolute,
                width: percent(100),
                height: percent(100),
                flex_direction: FlexDirection::Column,
                align_items: AlignItems::Center,
                justify_content: JustifyContent::SpaceBetween,
                padding: UiRect { top: percent(5), bottom: percent(16), ..default() },
                ..default()
            },
        ))
        .with_children(|menu| {
            menu.spawn((
                UiTransform { rotation: Rot2::degrees(-4.0), ..default() },
                Node { flex_direction: FlexDirection::Column, align_items: AlignItems::Center, width: px(460), max_width: percent(94), ..default() },
            ))
            .with_children(|badge| {
                badge
                    .spawn(Node { width: percent(100), aspect_ratio: Some(2.1), justify_content: JustifyContent::Center, align_items: AlignItems::Center, ..default() })
                    .with_children(|b| {
                        // bolhas azuis atrás do título: (largura, esquerda, topo) em %
                        for (w, x, y) in [(30.0, 6.0, 26.0), (28.0, 64.0, 18.0), (18.0, 0.0, 8.0), (16.0, 82.0, 4.0), (20.0, 20.0, 58.0), (16.0, 66.0, 66.0), (46.0, 27.0, 0.0)] {
                            b.spawn((
                                vgrad(Color::srgb(0.32, 0.68, 1.0), Color::srgb(0.08, 0.3, 0.82)),
                                BorderColor { top: Color::srgb(0.75, 0.92, 1.0), left: Color::srgb(0.5, 0.8, 1.0), right: Color::srgb(0.05, 0.22, 0.6), bottom: Color::srgb(0.03, 0.15, 0.45) },
                                Node {
                                    position_type: PositionType::Absolute,
                                    width: percent(w),
                                    aspect_ratio: Some(1.0),
                                    left: percent(x),
                                    top: percent(y),
                                    border: UiRect::all(px(4)),
                                    border_radius: BorderRadius::MAX,
                                    ..default()
                                },
                            ));
                        }
                        b.spawn((Hud::Title, Text::new(""), font(74.0), TextColor(TITLE), shadow(6.0), TextLayout::justify(Justify::Center)));
                    });
                badge
                    .spawn((
                        BackgroundColor(CORAL),
                        BoxShadow::new(NAVY, px(0), px(4), px(0), px(0)),
                        Node { padding: UiRect::axes(px(18), px(4)), border_radius: BorderRadius::all(px(20)), margin: UiRect::top(px(-6)), ..default() },
                    ))
                    .with_children(|p| {
                        p.spawn((Hud::Banner, Text::new(""), font(20.0), TextLayout::justify(Justify::Center)));
                    });
            });
            menu.spawn((Pulse, Hud::Cta, Text::new(""), font(34.0), shadow(4.0), UiTransform { rotation: Rot2::degrees(-4.0), ..default() }));
        });

    // pausa: tela escurecida
    commands
        .spawn((
            Show(&[Screen::Paused]),
            Pickable::IGNORE,
            BackgroundColor(Color::srgba(0.0, 0.03, 0.1, 0.4)),
            Node { position_type: PositionType::Absolute, width: percent(100), height: percent(100), flex_direction: FlexDirection::Column, justify_content: JustifyContent::Center, align_items: AlignItems::Center, row_gap: px(10), ..default() },
        ))
        .with_children(|p| {
            p.spawn((Text::new("PAUSA"), font(72.0), TextColor(TITLE), shadow(6.0)));
            p.spawn((Text::new("Esc ou toque no botão para continuar"), font(22.0), shadow(3.0)));
        });

    // som (canto inferior direito) e dicas (inferior esquerdo) nos menus
    commands
        .spawn((
            Show(&[Screen::Menu, Screen::Paused]),
            blue_button(),
            Node {
                position_type: PositionType::Absolute,
                bottom: px(18),
                right: px(16),
                padding: UiRect::axes(px(18), px(10)),
                border: UiRect::all(px(3)),
                border_radius: BorderRadius::all(px(16)),
                ..default()
            },
        ))
        .with_children(|b| {
            b.spawn((Hud::Sound, Text::new(""), font(20.0), shadow(2.0)));
        })
        .observe(|_: On<PointerClick>, mut c: ResMut<UiClick>| (c.sound, c.any) = (true, true));
    commands
        .spawn((Show(&[Screen::Menu, Screen::Paused]), plate(), Node { position_type: PositionType::Absolute, bottom: px(18), left: px(16), max_width: percent(55), ..plate_node }))
        .with_children(|p| {
            p.spawn((Hud::Hint, Text::new(""), font(15.0), TextColor(Color::srgba(1.0, 1.0, 1.0, 0.92))));
        });

    commands.spawn((
        Hud::Zone,
        Pickable::IGNORE,
        Text::new(""),
        font(52.0),
        TextColor(Color::NONE),
        TextShadow { offset: Vec2::new(0.0, 4.0), color: Color::srgba(0.0, 0.05, 0.12, 0.5) },
        TextLayout::justify(Justify::Center),
        Node { position_type: PositionType::Absolute, top: percent(22), width: percent(100), ..default() },
    ));
}

/// Esc / P / botão de pausa congelam o tempo do jogo durante a corrida.
pub fn pause(keys: Res<ButtonInput<KeyCode>>, game: Res<Game>, mut time: ResMut<Time<Virtual>>, mut click: ResMut<UiClick>) {
    let pressed = keys.just_pressed(KeyCode::Escape) || keys.just_pressed(KeyCode::KeyP) || std::mem::take(&mut click.pause);
    if game.phase != Phase::Playing {
        time.unpause();
    } else if pressed {
        if time.is_paused() { time.unpause() } else { time.pause() }
    }
}

pub fn not_paused(time: Res<Time<Virtual>>) -> bool {
    !time.is_paused()
}

pub fn hud(
    time: Res<Time>,
    real: Res<Time<Real>>,
    game: Res<Game>,
    sounds: Res<Sounds>,
    mut pop: Local<(u32, f32)>,
    mut zone: Local<(Option<world::Zone>, f32)>,
    mut q: Query<(&Hud, &mut Text, &mut TextFont, &mut Visibility, &mut TextColor)>,
    mut panels: Query<(&Show, &mut Visibility), Without<Hud>>,
    mut pulse: Query<&mut UiTransform, With<Pulse>>,
    paused: Res<Time<Virtual>>,
) {
    if game.coins != pop.0 {
        *pop = (game.coins, if game.coins > pop.0 { 1.0 } else { 0.0 });
    }
    let popping = pop.1 > 0.0;
    pop.1 = (pop.1 - 4.0 * time.delta_secs()).max(0.0);
    let playing = matches!(game.phase, Phase::Playing | Phase::Dying);
    let screen = match () {
        _ if !playing => Screen::Menu,
        _ if paused.is_paused() => Screen::Paused,
        _ => Screen::Playing,
    };
    let here = world::zone_at(game.distance);
    if game.phase == Phase::Playing && zone.0 != Some(here) {
        *zone = (Some(here), 2.5);
    }
    zone.1 = (zone.1 - time.delta_secs()).max(0.0);
    // só escreve o que mudou: escrever marca o componente e o Bevy refaz layout de texto/visibilidade
    for (show, mut vis) in &mut panels {
        vis.set_if_neq(if show.0.contains(&screen) { Visibility::Inherited } else { Visibility::Hidden });
    }
    if screen == Screen::Menu {
        for mut t in &mut pulse {
            t.scale = Vec2::splat(1.0 + 0.06 * (real.elapsed_secs() * 5.0).sin());
        }
    }
    let over = game.phase == Phase::Over;
    for (hud, mut text, mut font, mut vis, mut color) in &mut q {
        let new: String = match hud {
            Hud::Zone => {
                let c = Color::srgba(1.0, 0.95, 0.8, zone.1.min(1.0));
                if color.0 != c {
                    color.0 = c;
                }
                vis.set_if_neq(if screen == Screen::Playing && zone.1 > 0.0 { Visibility::Inherited } else { Visibility::Hidden });
                zone.0.map_or("", |z| z.name()).to_uppercase()
            }
            Hud::Score => format!("{:06}", game.score()),
            Hud::Coins => {
                // `popping` inclui o quadro em que o pulo zera, para voltar ao tamanho normal
                if popping {
                    font.font_size = FontSize::Px(30.0 + 14.0 * pop.1);
                }
                game.coins.to_string()
            }
            Hud::Title => (if over { "FIM DE\nJOGO" } else { "LEVI\nRUNNER" }).into(),
            Hud::Banner if over => format!("{} pontos  •  {} m  •  {} moedas", game.score(), game.distance as u32, game.coins),
            Hud::Banner => "Rio de Janeiro".into(),
            Hud::Cta => (if over { "TOQUE PARA JOGAR DE NOVO" } else { "TOQUE PARA JOGAR" }).into(),
            Hud::Sound => (if sounds.muted { "SOM: DESLIGADO" } else { "SOM: LIGADO" }).into(),
            Hud::Hint => "Espaço ou toque: jogar\n← → trocar de faixa   ↑ pular   ↓ rolar\nEsc pausa   M som".into(),
        };
        if text.0 != new {
            text.0 = new;
        }
    }
}
