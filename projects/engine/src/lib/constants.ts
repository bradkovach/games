export const CHAINS = [
  'sackson',
  'tower',
  'american',
  'festival',
  'worldwide',
  'continental',
  'imperial',
] as const;

export type ChainId = (typeof CHAINS)[number];

export type Tier = 'cheap' | 'expensive' | 'mid';

export const CHAIN_TIER: Record<ChainId, Tier> = {
  american: 'mid',
  continental: 'expensive',
  festival: 'mid',
  imperial: 'expensive',
  sackson: 'cheap',
  tower: 'cheap',
  worldwide: 'mid',
};

export const CHAIN_NAMES: Record<ChainId, string> = {
  american: 'American',
  continental: 'Continental',
  festival: 'Festival',
  imperial: 'Imperial',
  sackson: 'Sackson',
  tower: 'Tower',
  worldwide: 'Worldwide',
};

export const CHAIN_ABBRS: Record<ChainId, string> = {
  american: 'Am',
  continental: 'Co',
  festival: 'Fe',
  imperial: 'Im',
  sackson: 'Sa',
  tower: 'To',
  worldwide: 'Wo',
};

export const COLUMNS = 12;
export const ROWS = 'ABCDEFGHI';
export const SHARES_PER_CHAIN = 25;
export const STARTING_CASH = 6000;
export const SAFE_SIZE = 11;
export const END_SIZE = 41;
export const HAND_SIZE = 6;
export const MAX_PURCHASE = 3;

export type GameMode = 'classic' | 'tycoon';
