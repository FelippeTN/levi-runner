//! Arte procedural: texturas geradas em código e malhas que as primitivas do Bevy não têm
//! (caixa com UV em metros, arco, rampa, céu em degradê).

use std::f32::consts::{FRAC_PI_2, FRAC_PI_4, PI, TAU};

use bevy::{
    asset::RenderAssetUsages,
    image::{ImageAddressMode, ImageSampler, ImageSamplerDescriptor},
    mesh::{Indices, PrimitiveTopology},
    prelude::*,
    render::render_resource::{Extent3d, TextureDimension, TextureFormat},
};

// ---------- ruído ----------

fn hash(x: i32, y: i32) -> f32 {
    let mut h = (x as u32).wrapping_mul(374_761_393) ^ (y as u32).wrapping_mul(668_265_263);
    h = (h ^ (h >> 13)).wrapping_mul(1_274_126_177);
    (h ^ (h >> 16)) as f32 / u32::MAX as f32
}

/// ruído de valor suave em [0,1], periódico em `p` células
fn noise(x: f32, y: f32, p: i32) -> f32 {
    let (xi, yi) = (x.floor() as i32, y.floor() as i32);
    let (fx, fy) = (x - x.floor(), y - y.floor());
    let s = |t: f32| t * t * (3.0 - 2.0 * t);
    let h = |a: i32, b: i32| hash(a.rem_euclid(p), b.rem_euclid(p));
    let top = h(xi, yi) + (h(xi + 1, yi) - h(xi, yi)) * s(fx);
    let bot = h(xi, yi + 1) + (h(xi + 1, yi + 1) - h(xi, yi + 1)) * s(fx);
    top + (bot - top) * s(fy)
}

fn fbm(u: f32, v: f32, base: i32) -> f32 {
    noise(u * base as f32, v * base as f32, base) * 0.6
        + noise(u * base as f32 * 2.0, v * base as f32 * 2.0, base * 2) * 0.3
        + noise(u * base as f32 * 4.0, v * base as f32 * 4.0, base * 4) * 0.1
}

fn rgb(c: [f32; 3]) -> [u8; 4] {
    [(c[0].clamp(0.0, 1.0) * 255.0) as u8, (c[1].clamp(0.0, 1.0) * 255.0) as u8, (c[2].clamp(0.0, 1.0) * 255.0) as u8, 255]
}

fn mix(a: [f32; 3], b: [f32; 3], k: f32) -> [f32; 3] {
    [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]
}

fn scale(c: [f32; 3], k: f32) -> [f32; 3] {
    [c[0] * k, c[1] * k, c[2] * k]
}

/// Imagem com sampler repetido; `f(u, v)` com u,v em [0,1).
fn image(w: usize, h: usize, f: impl Fn(f32, f32) -> [u8; 4]) -> Image {
    let mut data = Vec::with_capacity(w * h * 4);
    for y in 0..h {
        for x in 0..w {
            data.extend_from_slice(&f(x as f32 / w as f32, y as f32 / h as f32));
        }
    }
    let mut img = Image::new(
        Extent3d { width: w as u32, height: h as u32, depth_or_array_layers: 1 },
        TextureDimension::D2,
        data,
        TextureFormat::Rgba8UnormSrgb,
        RenderAssetUsages::RENDER_WORLD,
    );
    img.sampler = ImageSampler::Descriptor(ImageSamplerDescriptor {
        address_mode_u: ImageAddressMode::Repeat,
        address_mode_v: ImageAddressMode::Repeat,
        ..ImageSamplerDescriptor::linear()
    });
    img
}

// ---------- texturas ----------

/// Sombra de contato: mancha escura redonda que se apaga suave até a borda.
pub fn blob() -> Image {
    image(64, 64, |u, v| {
        let d = (Vec2::new(u, v) * 2.0 - 1.0).length().min(1.0);
        let a = (1.0 - d * d) * (1.0 - d); // miolo cheio, borda bem esfumada
        [10, 14, 35, (a * 150.0) as u8]
    })
}

/// Calçadão de Copacabana: ondas largas e espaçadas, mais branco que preto (pedra portuguesa).
pub fn calcadao() -> Image {
    const BLACK: f32 = 0.38; // fração preta de cada onda
    image(256, 256, |u, v| {
        let wave = (v * 3.0 + (u * TAU * 2.0).sin() * 0.35).rem_euclid(1.0);
        let black = ((BLACK / 2.0 - (wave - 0.5).abs()) / 0.024 + 0.5).clamp(0.0, 1.0); // borda suave
        let grain = fbm(u, v, 32) * 0.12;
        let c = (0.92 - grain) * (1.0 - black) + (0.2 + grain) * black;
        rgb([c, c * 0.98, c * 0.95])
    })
}

/// Asfalto com faixas tracejadas entre as 3 pistas (pensado para UV 0..1 na largura da pista).
pub fn asphalt() -> Image {
    image(256, 256, |u, v| {
        let n = fbm(u, v, 16);
        let mut c = [0.16 + n * 0.08, 0.16 + n * 0.08, 0.17 + n * 0.08];
        let dash = (v * 4.0).fract() < 0.55;
        for lx in [1.0 / 3.0, 2.0 / 3.0] {
            if (u - lx).abs() < 0.008 && dash {
                c = [0.92, 0.92, 0.88];
            }
        }
        if u < 0.012 || u > 0.988 {
            c = [0.95, 0.8, 0.2];
        }
        rgb(c)
    })
}

/// Paralelepípedos em fiadas desencontradas.
pub fn cobble() -> Image {
    image(256, 256, |u, v| {
        let rows = 8.0;
        let row = (v * rows).floor();
        let x = u * rows + if row as i32 % 2 == 0 { 0.0 } else { 0.5 };
        let (cx, cy) = (x.fract() - 0.5, (v * rows).fract() - 0.5);
        let edge = (cx.abs().max(cy.abs()) * 2.0).powf(6.0);
        let tone = hash(x.floor() as i32, row as i32);
        let base = mix([0.45, 0.42, 0.38], [0.6, 0.55, 0.48], tone);
        rgb(mix(scale(base, 0.9 + fbm(u, v, 32) * 0.2), [0.18, 0.17, 0.15], edge.min(1.0)))
    })
}

pub fn sand() -> Image {
    image(128, 128, |u, v| {
        let n = fbm(u, v, 8) * 0.5 + fbm(u, v, 32) * 0.5;
        rgb(mix([0.86, 0.76, 0.55], [0.98, 0.9, 0.7], n))
    })
}

/// Mar: azul com cristas; o material desliza o UV para animar.
pub fn sea() -> Image {
    image(256, 256, |u, v| {
        let n = fbm(u, v, 8);
        let crest = ((v * 12.0 + n * 3.0 + (u * PI * 4.0).sin() * 0.3).fract() - 0.5).abs() < 0.04;
        let c = mix([0.04, 0.32, 0.55], [0.1, 0.55, 0.72], n);
        rgb(if crest { mix(c, [0.9, 0.95, 1.0], 0.55) } else { c })
    })
}

#[derive(Clone, Copy)]
pub enum Facade {
    /// prédio de orla: faixas de janelas e varandas
    Modern,
    /// sobrado colonial: janelas altas com venezianas
    Colonial,
    /// torre de vidro do Centro
    Glass,
}

/// Uma célula de fachada (um andar × um módulo); repete pela caixa via UV em metros.
/// A cor da parede vem do `base_color` do material (textura é clara).
pub fn facade(kind: Facade) -> Image {
    image(128, 128, move |u, v| {
        let wall = [0.95, 0.94, 0.92];
        let n = fbm(u, v, 8) * 0.06;
        let c = match kind {
            Facade::Modern => {
                if v > 0.82 {
                    [0.8, 0.8, 0.82] // laje/varanda
                } else if v > 0.2 && v < 0.75 && u > 0.08 && u < 0.92 {
                    let glass = mix([0.25, 0.4, 0.55], [0.55, 0.7, 0.85], 1.0 - v);
                    if (u - 0.5).abs() < 0.015 { [0.9, 0.9, 0.9] } else { glass }
                } else {
                    wall
                }
            }
            Facade::Colonial => {
                let win = u > 0.3 && u < 0.7 && v > 0.15 && v < 0.85;
                let arch = ((u - 0.5) / 0.2).powi(2) + ((v - 0.25) / 0.1).powi(2) < 1.0 || v > 0.25;
                if win && arch {
                    if (u - 0.5).abs() < 0.012 || ((v * 10.0).fract() < 0.12 && v > 0.3) {
                        [0.12, 0.35, 0.3] // veneziana verde
                    } else {
                        [0.18, 0.45, 0.4]
                    }
                } else if (u > 0.26 && u < 0.74 && v > 0.11 && v < 0.89) || v > 0.93 {
                    [0.98, 0.98, 0.95] // moldura e cornija brancas (não tingem bem, mas quebram a cor)
                } else {
                    wall
                }
            }
            Facade::Glass => {
                let frame = u < 0.04 || v < 0.06;
                if frame { [0.55, 0.58, 0.62] } else { mix([0.3, 0.42, 0.55], [0.65, 0.78, 0.9], (u + (1.0 - v)) * 0.5) }
            }
        };
        rgb([c[0] - n, c[1] - n, c[2] - n])
    })
}

/// Telhas cerâmicas (casarões de Santa Teresa).
pub fn roof_tiles() -> Image {
    image(128, 128, |u, v| {
        let ripple = ((u * 12.0).fract() - 0.5).abs() * 2.0;
        let row = ((v * 10.0).fract() < 0.1) as i32 as f32;
        let base = mix([0.72, 0.32, 0.18], [0.85, 0.45, 0.25], hash((u * 12.0) as i32, (v * 10.0) as i32));
        rgb(scale(base, 1.0 - ripple * 0.25 - row * 0.3))
    })
}

/// Listras diagonais (cavaletes e placas de obra).
pub fn stripes(a: [f32; 3], b: [f32; 3]) -> Image {
    image(64, 64, move |u, v| rgb(if ((u + v) * 4.0).fract() < 0.5 { a } else { b }))
}

/// Distância com sinal até um retângulo de cantos redondos (centro `c`, meia-extensão `half`, raio `r`).
fn rrect(p: Vec2, c: Vec2, half: Vec2, r: f32) -> f32 {
    let q = (p - c).abs() - half + r;
    q.max(Vec2::ZERO).length() + q.x.max(q.y).min(0.0) - r
}

pub const LIVERY_SIZE: Vec2 = Vec2::new(4.5, 2.0);

/// Lataria de desenho animado, em metros (`LIVERY_SIZE`, use com `uv_transform` 1/tamanho):
/// dois tons com friso, janela | porta | janela com moldura grossa e vidro claro com reflexo.
pub fn livery(body: [f32; 3], lower: [f32; 3], stripe: [f32; 3]) -> Image {
    image(512, 256, move |u, v| {
        let p = Vec2::new(u * LIVERY_SIZE.x, v * LIVERY_SIZE.y);
        let cx = (p.x / 1.5).floor() * 1.5 + 0.75;
        let door = (p.x / 1.5).floor() == 1.0;
        let (opening, pane) = if door {
            (rrect(p, Vec2::new(cx, 0.98), Vec2::new(0.42, 0.82), 0.16), rrect(p, Vec2::new(cx, 0.55), Vec2::new(0.27, 0.33), 0.12))
        } else {
            let w = rrect(p, Vec2::new(cx, 0.6), Vec2::new(0.55, 0.38), 0.16);
            (w, w)
        };
        let mut c = if p.y < 0.06 {
            scale(body, 0.8)
        } else if p.y > 1.18 && p.y < 1.28 {
            stripe
        } else if p.y > 1.28 {
            if p.y > 1.9 { scale(lower, 0.6) } else { lower }
        } else {
            body
        };
        if pane < 0.0 {
            let shine = (((p.x - cx) * 2.0 - p.y * 1.5).rem_euclid(1.6) < 0.22) as i32 as f32;
            c = mix(mix([0.62, 0.8, 0.92], [0.42, 0.6, 0.78], v * 1.5), [0.95, 0.98, 1.0], shine * 0.6);
        } else if opening < 0.0 {
            c = scale(body, 0.9); // folha da porta
        }
        if pane.abs() < 0.035 || opening.abs() < 0.04 {
            c = scale(if p.y > 1.28 { lower } else { body }, 0.5); // moldura
        }
        rgb(scale(c, 1.0 - fbm(u, v, 16) * 0.05))
    })
}

/// Leito de trilho para uma faixa (2,5 m): cascalho e dormente de madeira atravessado.
pub fn track() -> Image {
    image(128, 64, |u, v| {
        let gravel = mix([0.38, 0.33, 0.29], [0.55, 0.5, 0.44], fbm(u, v, 16));
        let sleeper = u > 0.1 && u < 0.9 && v > 0.25 && v < 0.75;
        let edge = (0.04 - (u - 0.1).abs().min((u - 0.9).abs()).min((v - 0.25).abs()).min((v - 0.75).abs())).max(0.0) * 12.0;
        let c = if sleeper { scale(mix([0.42, 0.27, 0.15], [0.55, 0.37, 0.2], noise(u * 3.0, v * 40.0, 40)), 1.0 - edge) } else { gravel };
        rgb(c)
    })
}

// ---------- malhas ----------

/// Caixa com UV em metros (`cell` = tamanho de uma repetição da textura) para fachadas não esticarem.
pub fn tiled_box(size: Vec3, cell: Vec2) -> Mesh {
    let mut mesh = Cuboid::from_size(size).mesh().build();
    let pos: Vec<[f32; 3]> = mesh.attribute(Mesh::ATTRIBUTE_POSITION).unwrap().as_float3().unwrap().to_vec();
    let nor: Vec<[f32; 3]> = mesh.attribute(Mesh::ATTRIBUTE_NORMAL).unwrap().as_float3().unwrap().to_vec();
    let uvs: Vec<[f32; 2]> = pos
        .iter()
        .zip(&nor)
        .map(|(p, n)| {
            let top = size.y / 2.0 - p[1];
            if n[1].abs() > 0.5 {
                [p[0] / cell.x, p[2] / cell.x]
            } else if n[0].abs() > 0.5 {
                [p[2] / cell.x, top / cell.y]
            } else {
                [p[0] / cell.x, top / cell.y]
            }
        })
        .collect();
    mesh.insert_attribute(Mesh::ATTRIBUTE_UV_0, uvs);
    mesh
}

/// Caixa com cantos arredondados de raio `r` e normais suaves (visual de brinquedo, nada de quina viva).
/// UV em metros a partir do canto; nas laterais u corre ao longo da face e v vai de cima para baixo.
pub fn rounded_box(size: Vec3, r: f32) -> Mesh {
    const K: usize = 3; // segmentos por quarto de curva
    let h = size / 2.0;
    let r = r.clamp(1e-3, h.min_element());
    // pontos ao longo de um eixo: curva de K passos em cada borda (ângulos iguais) e miolo plano
    let along = |half: f32| -> Vec<f32> {
        let e = |k: usize| r * (1.0 - (FRAC_PI_4 * (1.0 - k as f32 / K as f32)).tan());
        (0..=K).map(|k| -half + e(k)).chain((0..=K).rev().map(|k| half - e(k))).collect()
    };
    let (mut pos, mut nor, mut uv, mut idx) = (vec![], vec![], vec![], vec![]);
    // (normal, eixo u, eixo v) com u × v = -normal para o triângulo sair anti-horário
    for (n, u, v) in [
        (Vec3::Z, Vec3::X, Vec3::NEG_Y),
        (Vec3::NEG_Z, Vec3::NEG_X, Vec3::NEG_Y),
        (Vec3::X, Vec3::NEG_Z, Vec3::NEG_Y),
        (Vec3::NEG_X, Vec3::Z, Vec3::NEG_Y),
        (Vec3::Y, Vec3::X, Vec3::Z),
        (Vec3::NEG_Y, Vec3::X, Vec3::NEG_Z),
    ] {
        let (hu, hv) = ((u * h).length(), (v * h).length());
        let (au, av) = (along(hu), along(hv));
        let base = pos.len() as u32;
        for &a in &au {
            for &b in &av {
                let p = n * (n * h).length() + u * a + v * b;
                let inner = p.clamp(-(h - r), h - r);
                let normal = (p - inner).normalize_or(n);
                pos.push((inner + normal * r).to_array());
                nor.push(normal.to_array());
                uv.push([a + hu, b + hv]);
            }
        }
        let rows = av.len() as u32;
        for i in 0..au.len() as u32 - 1 {
            for j in 0..rows - 1 {
                let (a, b, c, d) = (base + i * rows + j, base + i * rows + j + 1, base + (i + 1) * rows + j + 1, base + (i + 1) * rows + j);
                idx.extend([a, b, c, a, c, d]);
            }
        }
    }
    Mesh::new(PrimitiveTopology::TriangleList, RenderAssetUsages::RENDER_WORLD)
        .with_inserted_attribute(Mesh::ATTRIBUTE_POSITION, pos)
        .with_inserted_attribute(Mesh::ATTRIBUTE_NORMAL, nor)
        .with_inserted_attribute(Mesh::ATTRIBUTE_UV_0, uv)
        .with_inserted_indices(Indices::U32(idx))
}

/// Moeda em y: face rebaixada com UV planar (verso espelhado para o brasão ler certo dos dois lados),
/// aro arredondado e borda serrilhada. Aro e borda usam o canto liso dourado de `coin_face`.
pub fn coin() -> Mesh {
    const N: usize = 48;
    let (c, rx_in, rx_out, ry, fy) = (Vec2::new(0.37, 0.02), 0.055, 0.05, 0.05, 0.04);
    let t0 = PI - ((fy - c.y) / ry).asin();
    // perfil do aro (ponto, normal) da face até a borda: meia elipse
    let arc: Vec<(Vec2, Vec2)> = (0..=8)
        .map(|i| {
            let t = t0 * (1.0 - i as f32 / 8.0);
            let rx = if t > FRAC_PI_2 { rx_in } else { rx_out };
            (c + Vec2::new(rx * t.cos(), ry * t.sin()), Vec2::new(t.cos() / rx, t.sin() / ry).normalize())
        })
        .collect();
    let fr = arc[0].0.x;
    let m = |v: Vec2| Vec2::new(v.x, -v.y);
    let edge = c.x + rx_out;
    let strips = [arc.clone(), vec![(Vec2::new(edge, c.y), Vec2::X), (Vec2::new(edge, -c.y), Vec2::X)], arc.iter().rev().map(|&(p, n)| (m(p), m(n))).collect()];

    let (mut pos, mut nor, mut uv, mut idx) = (vec![], vec![], vec![], vec![]);
    for (s, strip) in strips.iter().enumerate() {
        let base = pos.len() as u32;
        for i in 0..=N {
            let a = TAU * i as f32 / N as f32;
            let (radial, around) = (Vec3::new(a.cos(), 0.0, a.sin()), Vec3::new(-a.sin(), 0.0, a.cos()));
            for &(p, n) in strip {
                let mut n = radial * n.x + Vec3::Y * n.y;
                if s == 1 {
                    n = (n + around * if i % 2 == 0 { 0.45 } else { -0.45 }).normalize(); // serrilha
                }
                pos.push((radial * p.x + Vec3::Y * p.y).to_array());
                nor.push(n.to_array());
                uv.push([0.01, 0.01]);
            }
        }
        let k = strip.len() as u32;
        for i in 0..N as u32 {
            for j in 0..k - 1 {
                let (a, b) = (base + i * k + j, base + (i + 1) * k + j);
                idx.extend([a, b, b + 1, a, b + 1, a + 1]);
            }
        }
    }
    for (y, sy) in [(fy, 1.0), (-fy, -1.0)] {
        let center = pos.len() as u32;
        pos.push([0.0, y, 0.0]);
        nor.push([0.0, sy, 0.0]);
        uv.push([0.5, 0.5]);
        for i in 0..=N {
            let a = TAU * i as f32 / N as f32;
            let (x, z) = (fr * a.cos(), fr * a.sin());
            pos.push([x, y, z]);
            nor.push([0.0, sy, 0.0]);
            uv.push([0.5 + sy * x / (2.0 * fr), 0.5 + z / (2.0 * fr)]);
        }
        for i in 0..N as u32 {
            let (p, q) = (center + 1 + i, center + 2 + i);
            idx.extend(if sy > 0.0 { [center, q, p] } else { [center, p, q] });
        }
    }
    Mesh::new(PrimitiveTopology::TriangleList, RenderAssetUsages::RENDER_WORLD)
        .with_inserted_attribute(Mesh::ATTRIBUTE_POSITION, pos)
        .with_inserted_attribute(Mesh::ATTRIBUTE_NORMAL, nor)
        .with_inserted_attribute(Mesh::ATTRIBUTE_UV_0, uv)
        .with_inserted_indices(Indices::U32(idx))
}

/// Face da moeda: balança da justiça em relevo sobre ouro fosco, com contas em volta. O relevo é
/// pintado: sombra tirada do gradiente da altura, luz do alto à esquerda. Fora do disco fica dourado liso (aro).
pub fn coin_face() -> Image {
    const N: usize = 128;
    const FIELD: [f32; 3] = [0.82, 0.58, 0.12];
    const GOLD: [f32; 3] = [1.0, 0.82, 0.32];
    // (altura, cor) com q ∈ [-1,1]², y para cima
    let layer = |q: Vec2| -> (f32, [f32; 3]) {
        if q.length() > 1.0 {
            return (0.0, GOLD);
        }
        // distância ao segmento a-b
        let seg = |a: Vec2, b: Vec2| {
            let ab = b - a;
            (q - a - ab * ((q - a).dot(ab) / ab.dot(ab)).clamp(0.0, 1.0)).length()
        };
        let top = Vec2::new(0.0, 0.36);
        let relief = seg(Vec2::new(0.0, -0.55), Vec2::new(0.0, 0.42)) < 0.035 // coluna
            || (q - Vec2::new(0.0, 0.5)).length() < 0.065 // remate
            || seg(Vec2::new(-0.55, 0.32), top) < 0.028 || seg(Vec2::new(0.55, 0.32), top) < 0.028 // travessão
            || (q.y < -0.53 && q.y > -0.66 && q.x.abs() < 0.3 - (q.y + 0.53).abs() * 0.8) // pedestal
            || [-1.0f32, 1.0].iter().any(|&s| {
                let (hook, pan) = (Vec2::new(0.55 * s, 0.32), Vec2::new(0.55 * s, -0.12));
                let bowl = q - pan;
                (hook - q).length() < 0.04 // argola
                    || (bowl.y < 0.0 && (bowl.x / 0.21).powi(2) + (bowl.y / 0.1).powi(2) < 1.0) // prato
            });
        if relief {
            return (1.0, GOLD);
        }
        // correntes, mais baixas que o resto
        if [-1.0f32, 1.0].iter().any(|&s| [-0.19, 0.19].iter().any(|&o| seg(Vec2::new(0.55 * s, 0.32), Vec2::new(0.55 * s + o, -0.12)) < 0.012)) {
            return (0.6, GOLD);
        }
        // contas em volta
        let step = TAU / 28.0;
        let a = (q.y.atan2(q.x) / step).round() * step;
        if (q - Vec2::from_angle(a) * 0.87).length() < 0.035 {
            return (0.8, GOLD);
        }
        (0.0, FIELD)
    };
    let h = |q: Vec2| layer(q).0;
    let light = Vec2::new(-0.6, 0.8);
    image(N, N, |u, v| {
        let mut acc = [0.0; 3];
        for (dx, dy) in [(0.25, 0.25), (0.75, 0.25), (0.25, 0.75), (0.75, 0.75)] {
            let q = Vec2::new((u + dx / N as f32) * 2.0 - 1.0, 1.0 - (v + dy / N as f32) * 2.0);
            let e = 0.015;
            let g = Vec2::new(h(q + Vec2::X * e) - h(q - Vec2::X * e), h(q + Vec2::Y * e) - h(q - Vec2::Y * e));
            let shade = (1.0 + 0.8 * g.dot(light)).clamp(0.35, 1.7) * (1.12 - 0.25 * q.length_squared().min(1.0));
            let c = scale(layer(q).1, shade);
            acc = [acc[0] + c[0] / 4.0, acc[1] + c[1] / 4.0, acc[2] + c[2] / 4.0];
        }
        rgb(acc)
    })
}

struct Builder {
    pos: Vec<[f32; 3]>,
    uv: Vec<[f32; 2]>,
    idx: Vec<u32>,
}

impl Builder {
    fn new() -> Self {
        Self { pos: vec![], uv: vec![], idx: vec![] }
    }
    fn vert(&mut self, p: Vec3, uv: Vec2) -> u32 {
        self.pos.push(p.into());
        self.uv.push(uv.into());
        self.pos.len() as u32 - 1
    }
    fn quad(&mut self, a: u32, b: u32, c: u32, d: u32) {
        self.idx.extend([a, b, c, a, c, d]);
    }
    fn build(self) -> Mesh {
        let mut m = Mesh::new(PrimitiveTopology::TriangleList, RenderAssetUsages::RENDER_WORLD)
            .with_inserted_attribute(Mesh::ATTRIBUTE_POSITION, self.pos)
            .with_inserted_attribute(Mesh::ATTRIBUTE_UV_0, self.uv)
            .with_inserted_indices(Indices::U32(self.idx));
        m.compute_normals();
        m
    }
}

/// Painel de arco: parede `w`×`h`×`depth` com vão de raio `r` (pés retos até `spring`, meia-lua acima).
/// Encadeados lado a lado formam os Arcos da Lapa.
pub fn arch(w: f32, h: f32, depth: f32, r: f32, spring: f32) -> Mesh {
    const N: usize = 16;
    // contorno do vão (P) e ponto correspondente na borda externa (Q)
    let mut ring: Vec<(Vec2, Vec2)> = vec![(Vec2::new(-r, 0.0), Vec2::new(-w / 2.0, 0.0))];
    for i in 0..=N {
        let a = PI - PI * i as f32 / N as f32;
        let d = Vec2::new(a.cos(), a.sin());
        let p = Vec2::new(0.0, spring) + d * r;
        let tx = if d.x.abs() > 1e-4 { (w / 2.0) / d.x.abs() } else { f32::MAX };
        let ty = if d.y > 1e-4 { (h - spring) / d.y } else { f32::MAX };
        ring.push((p, Vec2::new(0.0, spring) + d * tx.min(ty)));
    }
    ring.push((Vec2::new(r, 0.0), Vec2::new(w / 2.0, 0.0)));

    let mut b = Builder::new();
    for (z, flip) in [(depth / 2.0, false), (-depth / 2.0, true)] {
        let ids: Vec<(u32, u32)> = ring
            .iter()
            .map(|(p, q)| (b.vert(p.extend(z), *p / 2.0), b.vert(q.extend(z), *q / 2.0)))
            .collect();
        for w2 in ids.windows(2) {
            let ((p0, q0), (p1, q1)) = (w2[0], w2[1]);
            if flip { b.quad(p0, p1, q1, q0) } else { b.quad(p0, q0, q1, p1) }
        }
    }
    // intradorso (superfície de dentro do vão)
    let mut prev: Option<(u32, u32)> = None;
    let mut len = 0.0;
    for (i, (p, _)) in ring.iter().enumerate() {
        if i > 0 {
            len += (ring[i].0 - ring[i - 1].0).length();
        }
        let f = b.vert(p.extend(depth / 2.0), Vec2::new(len / 2.0, 0.0));
        let k = b.vert(p.extend(-depth / 2.0), Vec2::new(len / 2.0, depth / 2.0));
        if let Some((pf, pk)) = prev {
            b.quad(pf, f, k, pk);
        }
        prev = Some((f, k));
    }
    // topo
    let (hw, hd) = (w / 2.0, depth / 2.0);
    let t = [b.vert(Vec3::new(-hw, h, hd), Vec2::ZERO), b.vert(Vec3::new(hw, h, hd), Vec2::X), b.vert(Vec3::new(hw, h, -hd), Vec2::ONE), b.vert(Vec3::new(-hw, h, -hd), Vec2::Y)];
    b.quad(t[0], t[1], t[2], t[3]);
    b.build()
}

/// Rampa (cunha): base `w`×`len`, sobe de 0 em +z até `h` em -z.
pub fn ramp(w: f32, h: f32, len: f32) -> Mesh {
    let (hw, hl) = (w / 2.0, len / 2.0);
    let mut b = Builder::new();
    let v = |b: &mut Builder, x: f32, y: f32, z: f32, uv: (f32, f32)| b.vert(Vec3::new(x, y, z), Vec2::new(uv.0, uv.1));
    // face inclinada
    let a = [v(&mut b, -hw, 0.0, hl, (0.0, len)), v(&mut b, hw, 0.0, hl, (w, len)), v(&mut b, hw, h, -hl, (w, 0.0)), v(&mut b, -hw, h, -hl, (0.0, 0.0))];
    b.quad(a[0], a[1], a[2], a[3]);
    // traseira
    let c = [v(&mut b, -hw, 0.0, -hl, (0.0, 0.0)), v(&mut b, -hw, h, -hl, (0.0, h)), v(&mut b, hw, h, -hl, (w, h)), v(&mut b, hw, 0.0, -hl, (w, 0.0))];
    b.quad(c[0], c[1], c[2], c[3]);
    // laterais
    for (x, flip) in [(-hw, true), (hw, false)] {
        let p = [v(&mut b, x, 0.0, hl, (0.0, 0.0)), v(&mut b, x, 0.0, -hl, (len, 0.0)), v(&mut b, x, h, -hl, (len, h))];
        if flip { b.idx.extend([p[0], p[2], p[1]]) } else { b.idx.extend([p[0], p[1], p[2]]) }
    }
    b.build()
}

/// Telhado de duas águas (prisma) sobre uma caixa `w`×`d`, cumeeira ao longo de z.
pub fn gable(w: f32, h: f32, d: f32) -> Mesh {
    let (hw, hd) = (w / 2.0 + 0.3, d / 2.0 + 0.3);
    let mut b = Builder::new();
    for s in [-1.0f32, 1.0] {
        let q = [
            b.vert(Vec3::new(s * hw, 0.0, hd), Vec2::new(0.0, 0.0)),
            b.vert(Vec3::new(s * hw, 0.0, -hd), Vec2::new(d / 2.0, 0.0)),
            b.vert(Vec3::new(0.0, h, -hd), Vec2::new(d / 2.0, hw / 2.0)),
            b.vert(Vec3::new(0.0, h, hd), Vec2::new(0.0, hw / 2.0)),
        ];
        if s > 0.0 { b.quad(q[0], q[1], q[2], q[3]) } else { b.quad(q[0], q[3], q[2], q[1]) }
    }
    for z in [-hd, hd] {
        let t = [b.vert(Vec3::new(-hw, 0.0, z), Vec2::ZERO), b.vert(Vec3::new(hw, 0.0, z), Vec2::X), b.vert(Vec3::new(0.0, h, z), Vec2::Y)];
        if z > 0.0 { b.idx.extend([t[0], t[1], t[2]]) } else { b.idx.extend([t[0], t[2], t[1]]) }
    }
    b.build()
}

/// Cúpula do céu com degradê por vértice (horizonte quente → zênite azul).
pub fn sky_dome(radius: f32, horizon: Color, mid: Color, zenith: Color) -> Mesh {
    let mut m = Sphere::new(radius).mesh().uv(48, 24);
    let pos: Vec<[f32; 3]> = m.attribute(Mesh::ATTRIBUTE_POSITION).unwrap().as_float3().unwrap().to_vec();
    let (h, md, z) = (horizon.to_linear(), mid.to_linear(), zenith.to_linear());
    let colors: Vec<[f32; 4]> = pos
        .iter()
        .map(|p| {
            let t = (p[1] / radius).max(0.0);
            let c = if t < 0.25 { h.mix(&md, t / 0.25) } else { md.mix(&z, ((t - 0.25) / 0.75).powf(0.7)) };
            c.to_f32_array()
        })
        .collect();
    m.insert_attribute(Mesh::ATTRIBUTE_COLOR, colors);
    m
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn calcadao_emenda_sem_degrau() {
        // a textura repete no chão: a última linha tem de continuar a primeira
        let img = calcadao();
        let d = img.data.as_ref().unwrap();
        let px = |x: usize, y: usize| d[(y * 256 + x) * 4] as i32;
        assert!((0..256).all(|x| (px(x, 0) - px(x, 255)).abs() < 130));
    }

    #[test]
    fn moeda_triangulos_concordam_com_normais() {
        let m = coin();
        let pos = m.attribute(Mesh::ATTRIBUTE_POSITION).unwrap().as_float3().unwrap();
        let Some(bevy::mesh::VertexAttributeValues::Float32x3(nor)) = m.attribute(Mesh::ATTRIBUTE_NORMAL) else { panic!() };
        let Some(Indices::U32(idx)) = m.indices() else { panic!() };
        for t in idx.chunks(3) {
            let [a, b, c] = [t[0], t[1], t[2]].map(|i| Vec3::from(pos[i as usize]));
            let n: Vec3 = t.iter().map(|&i| Vec3::from(nor[i as usize])).sum();
            assert!((b - a).cross(c - a).dot(n) > 0.0);
        }
    }

    #[test]
    fn rounded_box_fecha_e_aponta_para_fora() {
        let size = Vec3::new(2.2, 2.5, 9.0);
        let m = rounded_box(size, 0.45);
        let pos = m.attribute(Mesh::ATTRIBUTE_POSITION).unwrap().as_float3().unwrap();
        let Some(Indices::U32(idx)) = m.indices() else { panic!() };
        assert!(pos.iter().all(|p| Vec3::from(*p).abs().cmple(size / 2.0 + 1e-4).all()));
        for t in idx.chunks(3) {
            let [a, b, c] = [t[0], t[1], t[2]].map(|i| Vec3::from(pos[i as usize]));
            let n = (b - a).cross(c - a);
            // triângulo degenerado (miolo de eixo todo arredondado) não conta
            assert!(n.length() < 1e-6 || n.dot(a + b + c) > 0.0);
        }
    }
}
