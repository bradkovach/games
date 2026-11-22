/**
 * Player mascots. All are long-standing (mostly Unicode 1.1–4.0)
 * symbols, so they render in colour where an emoji font exists and
 * fall back to the bundled monochrome Noto Emoji font otherwise.
 * Stored without a variation selector; render with
 * {@link avatarEmoji}.
 */
export const AVATARS = [
  { glyph: '☀', name: 'Sun' },
  { glyph: '☁', name: 'Cloud' },
  { glyph: '☂', name: 'Umbrella' },
  { glyph: '☃', name: 'Snowman' },
  { glyph: '☄', name: 'Comet' },
  { glyph: '❄', name: 'Snowflake' },
  { glyph: '⚡', name: 'Lightning' },
  { glyph: '☘', name: 'Shamrock' },
  { glyph: '☕', name: 'Coffee' },
  { glyph: '☎', name: 'Telephone' },
  { glyph: '⌛', name: 'Hourglass' },
  { glyph: '⏰', name: 'Alarm clock' },
  { glyph: '✈', name: 'Airplane' },
  { glyph: '⛵', name: 'Sailboat' },
  { glyph: '⚓', name: 'Anchor' },
  { glyph: '⛺', name: 'Tent' },
  { glyph: '⛳', name: 'Golf flag' },
  { glyph: '⚽', name: 'Soccer ball' },
  { glyph: '⚾', name: 'Baseball' },
  { glyph: '✉', name: 'Envelope' },
  { glyph: '✂', name: 'Scissors' },
  { glyph: '✏', name: 'Pencil' },
  { glyph: '⚙', name: 'Gear' },
  { glyph: '⚖', name: 'Scales' },
  { glyph: '⚔', name: 'Crossed swords' },
  { glyph: '⚛', name: 'Atom' },
  { glyph: '♻', name: 'Recycling' },
  { glyph: '♨', name: 'Hot springs' },
  { glyph: '☠', name: 'Skull and crossbones' },
  { glyph: '♠', name: 'Spade' },
  { glyph: '♥', name: 'Heart' },
  { glyph: '♦', name: 'Diamond' },
  { glyph: '♣', name: 'Club' },
] as const;

export type Avatar = (typeof AVATARS)[number]['glyph'];

const GLYPHS = new Set<string>(AVATARS.map((a) => a.glyph));

/**
 * Requests the colour emoji presentation (U+FE0F); browsers without
 * a colour emoji font fall back to the bundled Noto Emoji glyphs.
 */
export function avatarEmoji(glyph: string): string {
  return `${glyph}\u{FE0F}`;
}

export function avatarName(glyph: string): string {
  return AVATARS.find((a) => a.glyph === glyph)?.name ?? glyph;
}

/** First avatar nobody has taken yet. */
export function firstFreeAvatar(
  taken: Iterable<null | string>,
): Avatar | undefined {
  const used = new Set(taken);
  return AVATARS.find((a) => !used.has(a.glyph))?.glyph;
}

export function isAvatar(value: unknown): value is Avatar {
  return typeof value === 'string' && GLYPHS.has(value);
}
