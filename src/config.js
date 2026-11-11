// Constantes de jogo compartilhadas entre os módulos.

export const LANES = [-2.5, 0, 2.5];
export const START_SPEED = 14;
export const MAX_SPEED = 34;
/** Frame mais longo que a simulação aceita: abaixo de 25 FPS o jogo fica lento em vez de teleportar o mundo. */
export const MAX_DT = 0.04;

/** Fim da neblina: até aqui nada some; o que nasce ou reaparece além disso entra sem ser visto. */
export const FOG_END = 250;
export const SPAWN_Z = -FOG_END;
/** Fileira inicial: as primeiras já começam a meio caminho (160 m da largada). */
export const FIRST_ROW = 160 + SPAWN_Z;
/** Veículo na contramão só acelera a partir daqui, para a distância de reação não crescer com o alcance. */
export const MOVER_WAKE_Z = -130;
export const TILE_LEN = 20;
export const TILES = 14;
export const ZONE_LEN = 700;
/** Altura do teto dos veículos (dá para correr em cima). */
export const CAR_TOP = 2.8;
export const CAR_LEN = 9;
export const CAR_GAP = 1.2;
export const RAMP_LEN = 7;

export const ZONES = ["Copacabana", "Lapa", "Santa Teresa"];

/** Bairro na distância percorrida: Copacabana → Lapa → Santa Teresa, em ciclo. */
export function zoneAt(distance) {
  return ZONES[Math.floor(Math.max(distance, 0) / ZONE_LEN) % 3];
}
