//! Efeitos e música (WAVs gerados por tools/make_sfx.py). M liga/desliga o som.

use bevy::{audio::Volume, prelude::*};

use crate::{Game, Phase, Sfx};

#[derive(Resource)]
pub struct Sounds {
    jump: Handle<AudioSource>,
    land: Handle<AudioSource>,
    roll: Handle<AudioSource>,
    swipe: Handle<AudioSource>,
    coin: Handle<AudioSource>,
    stumble: Handle<AudioSource>,
    crash: Handle<AudioSource>,
    music: Handle<AudioSource>,
    pub muted: bool,
    /// sequência de moedas seguidas: o tom sobe
    streak: u32,
    since_coin: f32,
}

#[derive(Component)]
pub struct Music;

pub fn setup(mut commands: Commands, assets: Res<AssetServer>) {
    let load = |n: &str| assets.load(format!("sfx/{n}.wav"));
    commands.insert_resource(Sounds {
        jump: load("jump"),
        land: load("land"),
        roll: load("roll"),
        swipe: load("swipe"),
        coin: load("coin"),
        stumble: load("stumble"),
        crash: load("crash"),
        music: load("music"),
        muted: false,
        streak: 0,
        since_coin: 9.0,
    });
}

pub fn play(
    time: Res<Time>,
    keys: Res<ButtonInput<KeyCode>>,
    game: Res<Game>,
    mut snd: ResMut<Sounds>,
    mut commands: Commands,
    mut events: MessageReader<Sfx>,
    mut music: Query<&mut AudioSink, With<Music>>,
    has_music: Query<(), With<Music>>,
    mut click: ResMut<crate::ui::UiClick>,
) {
    if keys.just_pressed(KeyCode::KeyM) || std::mem::take(&mut click.sound) {
        snd.muted = !snd.muted;
        for mut sink in &mut music {
            if snd.muted { sink.mute() } else { sink.unmute() }
        }
    }
    // a música começa no primeiro "correr" (gesto do usuário libera o áudio no navegador)
    if game.phase == Phase::Playing && has_music.is_empty() {
        commands.spawn((Music, AudioPlayer::new(snd.music.clone()),
            PlaybackSettings { volume: Volume::Linear(0.45), muted: snd.muted, ..PlaybackSettings::LOOP }));
    }

    snd.since_coin += time.delta_secs();
    for &e in events.read() {
        if e == Sfx::Coin {
            snd.streak = if snd.since_coin < 0.5 { snd.streak + 1 } else { 0 };
            snd.since_coin = 0.0;
        }
        let (clip, vol, speed) = match e {
            Sfx::Jump => (&snd.jump, 0.5, 1.0),
            Sfx::Land => (&snd.land, 0.5, 1.0),
            Sfx::Roll => (&snd.roll, 0.6, 1.0),
            Sfx::Swipe => (&snd.swipe, 0.35, 1.0),
            Sfx::Stumble => (&snd.stumble, 0.8, 1.0),
            Sfx::Crash => (&snd.crash, 0.9, 1.0),
            Sfx::Coin => (&snd.coin, 0.45, 1.0 + 0.06 * snd.streak.min(8) as f32),
        };
        let clip = clip.clone();
        if !snd.muted {
            commands.spawn((AudioPlayer::new(clip), PlaybackSettings { volume: Volume::Linear(vol), speed, ..PlaybackSettings::DESPAWN }));
        }
    }
}
