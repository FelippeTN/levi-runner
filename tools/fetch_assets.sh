#!/bin/sh
# Baixa os assets CC0 de origem para .cache/assets/ (fora do git). Depois: node tools/build_scenery.mjs
# Todos os links são de repositórios públicos no GitHub ou da API da Poly Haven; licenças em assets/CREDITS.md.
set -e
cd "$(dirname "$0")/.."
OUT=.cache/assets
mkdir -p "$OUT"

get() { # url destino
  [ -s "$2" ] && return
  mkdir -p "$(dirname "$2")"
  curl -fsSL --retry 2 -o "$2" "$1"
}

# KayKit City Builder Bits 1.0 (Kay Lousberg, CC0): prédios, carros, postes, mobiliário urbano
KAY=https://raw.githubusercontent.com/KayKit-Game-Assets/KayKit-City-Builder-Bits-1.0/main/addons/kaykit_city_builder_bits/Assets/gltf
get "$KAY/../LICENSE.txt" "$OUT/kaykit/LICENSE.txt"
get "$KAY/citybits_texture.png" "$OUT/kaykit/citybits_texture.png"
for m in building_A building_B building_C building_D building_E building_F building_G building_H \
  car_hatchback car_police car_sedan car_stationwagon car_taxi \
  streetlight trafficlight_A bench bush firehydrant trash_A dumpster box_A; do
  get "$KAY/$m.gltf" "$OUT/kaykit/$m.gltf"
  get "$KAY/$m.bin" "$OUT/kaykit/$m.bin"
done

# Quaternius (CC0), em .glb no espelho quaternius-showcase (fonte de cada pacote em LICENSES.md de lá)
Q=https://raw.githubusercontent.com/trebeljahr/quaternius-showcase/main/public/glb
get "https://raw.githubusercontent.com/trebeljahr/quaternius-showcase/main/LICENSES.md" "$OUT/quaternius/LICENSES.md"
for m in PalmTree_1 PalmTree_2 PalmTree_3 PalmTree_4 CommonTree_1 CommonTree_2 CommonTree_3 Bush_1 Bush_2 Rock_1 Rock_2 Plant_1; do
  get "$Q/nature_pack/$m.glb" "$OUT/quaternius/nature/$m.glb"
done
for m in 2Story_Balcony_Mat 2Story_Columns_Mat 2Story_Mat 2Story_Slim_Mat 2Story_Wide_Mat 2Story_GableRoof_Mat 3Story_Balcony_Mat 3Story_Slim_Mat 1Story_GableRoof_Mat; do
  get "$Q/buildings_pack_3/$m.glb" "$OUT/quaternius/buildings/$m.glb"
done
for m in Cloud1 Cloud2 Cloud3 Cloud4 Cloud5; do
  get "$Q/platformer_pack/$m.glb" "$OUT/quaternius/clouds/$m.glb"
done

# Kenney (CC0): sons dos starter kits oficiais e Interface Sounds (espelho de Calinou)
K=https://raw.githubusercontent.com/KenneyNL
for s in jump land coin fall break; do get "$K/Starter-Kit-3D-Platformer/main/sounds/$s.ogg" "$OUT/kenney/platformer/$s.ogg"; done
for s in impact skid; do get "$K/Starter-Kit-Racing/main/audio/$s.ogg" "$OUT/kenney/racing/$s.ogg"; done
I=https://raw.githubusercontent.com/Calinou/kenney-interface-sounds/master/addons/kenney_interface_sounds
get "$I/LICENSE.txt" "$OUT/kenney/interface/LICENSE.txt"
for s in click_002 confirmation_001 confirmation_002 maximize_006 drop_002 scratch_001 switch_002 error_004; do
  get "$I/$s.wav" "$OUT/kenney/interface/$s.wav"
done

# Poly Haven (Greg Zaal, CC0): céu para a luz ambiente
get https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/kloofendal_48d_partly_cloudy_puresky_1k.hdr "$OUT/polyhaven/sky_1k.hdr"

echo "assets em $OUT"
