import { COMPOSITION_RECIPES } from './glyphComposition';

const range = (start: number, end: number): number[] => {
  const out: number[] = [];
  for (let i = start; i <= end; i++) out.push(i);
  return out;
};

const LATIN_BASIC_CODE_POINTS: readonly number[] = [
  ...range(0x41, 0x44), 0x0110, ...range(0x45, 0x5a), // A-D, Đ, E-Z
  ...range(0x61, 0x64), 0x0111, ...range(0x65, 0x7a), // a-d, đ, e-z
  ...range(0x30, 0x39), // 0-9
  0x2e, // .
  0x2c, // ,
  0x21, // !
  0x3f, // ?
  0x3b, // ;
  0x3a, // :
  0x2d, // -
  0x28, // (
  0x29, // )
] as const;

// Accent marks the user draws once. We composite them over base letters to
// derive every Vietnamese + Western European diacritic glyph. The PUA slots
// hold marks that have no spacing form in Unicode (hook above, dot below,
// horn) — the UI labels them by role so the user knows what to draw.
export const ACCENT_PRIMITIVE_CODE_POINTS: readonly number[] = [
  0x00b4, // ´  acute
  0x0060, // `  grave
  0x02c6, // ˆ  circumflex
  0x00a8, // ¨  diaeresis
  0x02dc, // ˜  small tilde
  0x02d8, // ˘  breve
  0xe000, //    hook above (Vietnamese hỏi)
  0xe001, //    dot below  (Vietnamese nặng)
  0xe002, //    horn       (for ơ, ư)
] as const;

// Human-readable labels for primitives without a sensible standalone glyph.
// Falls back to String.fromCodePoint for entries not listed here.
export const PRIMITIVE_LABELS: Readonly<Record<number, string>> = {
  0xe000: 'Hook above',
  0xe001: 'Dot below',
  0xe002: 'Horn',
};

// Dotted-circle + combining mark: gives the canvas a real preview of the mark
// shape since the PUA code points have no system-font renderings.
const DOTTED_CIRCLE = '◌';
export const PRIMITIVE_GHOSTS: Readonly<Record<number, string>> = {
  0xe000: `${DOTTED_CIRCLE}̉`,
  0xe001: `${DOTTED_CIRCLE}̣`,
  0xe002: `${DOTTED_CIRCLE}̛`,
};

export function glyphGhostChar(codePoint: number): string {
  return PRIMITIVE_GHOSTS[codePoint] ?? String.fromCodePoint(codePoint);
}

export function glyphDisplayLabel(codePoint: number): string {
  return PRIMITIVE_LABELS[codePoint] ?? String.fromCodePoint(codePoint);
}

export type GlyphTab = 'lowercase' | 'uppercase' | 'numbers';

export const GLYPH_TABS: readonly GlyphTab[] = ['lowercase', 'uppercase', 'numbers'];

export const GLYPH_TAB_LABELS: Readonly<Record<GlyphTab, string>> = {
  lowercase: 'Lowercase',
  uppercase: 'Uppercase',
  numbers: 'Numbers & Symbols',
};

const PUNCTUATION_CODE_POINTS = new Set<number>([
  0x2e, 0x2c, 0x21, 0x3f, 0x3b, 0x3a, 0x2d, 0x28, 0x29,
]);
const ACCENT_PRIMITIVE_SET = new Set<number>(ACCENT_PRIMITIVE_CODE_POINTS);

// Categorises a code point into the tabs it should appear under. Mark primitives
// belong in both Lowercase and Uppercase because they're a dependency for both
// cases' diacritics — duplicating them removes the cross-tab hunt.
export function tabsForCodePoint(cp: number): GlyphTab[] {
  if (ACCENT_PRIMITIVE_SET.has(cp)) return ['lowercase', 'uppercase'];
  if (cp >= 0x30 && cp <= 0x39) return ['numbers'];
  if (PUNCTUATION_CODE_POINTS.has(cp)) return ['numbers'];
  if (cp >= 0x61 && cp <= 0x7a) return ['lowercase'];
  if (cp >= 0x41 && cp <= 0x5a) return ['uppercase'];
  // Latin-1 Supplement, Vietnamese, Extended-A/B: case-fold tells us which side.
  const ch = String.fromCodePoint(cp);
  if (ch.toUpperCase() !== ch) return ['lowercase'];
  if (ch.toLowerCase() !== ch) return ['uppercase'];
  return ['numbers'];
}

const COMPOSABLE_SET = new Set<number>(Object.keys(COMPOSITION_RECIPES).map(Number));

// Marks + composables are optional: the user doesn't have to draw them.
export function isOptionalCodePoint(cp: number): boolean {
  return ACCENT_PRIMITIVE_SET.has(cp) || COMPOSABLE_SET.has(cp);
}

// Letters derivable by combining a base letter (covered by LATIN_BASIC) with
// one or more accent primitives. Includes all Vietnamese lowercase tone marks
// plus the Western European Latin-1 Supplement letters.
const LATIN_EXTENDED_TARGET_CODE_POINTS: readonly number[] = [
  // a-family
  0x00e0, 0x00e1, 0x00e2, 0x00e3, 0x00e4, // à á â ã ä
  0x1ea1, 0x1ea3,                         // ạ ả
  0x0103,                                 // ă
  0x1eaf, 0x1eb1, 0x1eb3, 0x1eb5, 0x1eb7, // ắ ằ ẳ ẵ ặ
  0x1ea5, 0x1ea7, 0x1ea9, 0x1eab, 0x1ead, // ấ ầ ẩ ẫ ậ

  // e-family
  0x00e8, 0x00e9, 0x00ea, 0x00eb,         // è é ê ë
  0x1eb9, 0x1ebb, 0x1ebd,                 // ẹ ẻ ẽ
  0x1ebf, 0x1ec1, 0x1ec3, 0x1ec5, 0x1ec7, // ế ề ể ễ ệ

  // i-family
  0x00ec, 0x00ed, 0x00ee, 0x00ef,         // ì í î ï
  0x0129, 0x1ec9, 0x1ecb,                 // ĩ ỉ ị

  // o-family
  0x00f2, 0x00f3, 0x00f4, 0x00f5, 0x00f6, // ò ó ô õ ö
  0x1ecd, 0x1ecf,                         // ọ ỏ
  0x1ed1, 0x1ed3, 0x1ed5, 0x1ed7, 0x1ed9, // ố ồ ổ ỗ ộ
  0x01a1,                                 // ơ
  0x1edb, 0x1edd, 0x1edf, 0x1ee1, 0x1ee3, // ớ ờ ở ỡ ợ

  // u-family
  0x00f9, 0x00fa, 0x00fb, 0x00fc,         // ù ú û ü
  0x0169, 0x1ee5, 0x1ee7,                 // ũ ụ ủ
  0x01b0,                                 // ư
  0x1ee9, 0x1eeb, 0x1eed, 0x1eef, 0x1ef1, // ứ ừ ử ữ ự

  // y-family
  0x00fd, 0x00ff,                         // ý ÿ
  0x1ef3, 0x1ef5, 0x1ef7, 0x1ef9,         // ỳ ỵ ỷ ỹ

  // n-tilde
  0x00f1,                                 // ñ

  // ── uppercase variants ───────────────────────────────────────────────

  // A-family
  0x00c0, 0x00c1, 0x00c2, 0x00c3, 0x00c4, // À Á Â Ã Ä
  0x1ea0, 0x1ea2,                         // Ạ Ả
  0x0102,                                 // Ă
  0x1eae, 0x1eb0, 0x1eb2, 0x1eb4, 0x1eb6, // Ắ Ằ Ẳ Ẵ Ặ
  0x1ea4, 0x1ea6, 0x1ea8, 0x1eaa, 0x1eac, // Ấ Ầ Ẩ Ẫ Ậ

  // E-family
  0x00c8, 0x00c9, 0x00ca, 0x00cb,         // È É Ê Ë
  0x1eb8, 0x1eba, 0x1ebc,                 // Ẹ Ẻ Ẽ
  0x1ebe, 0x1ec0, 0x1ec2, 0x1ec4, 0x1ec6, // Ế Ề Ể Ễ Ệ

  // I-family
  0x00cc, 0x00cd, 0x00ce, 0x00cf,         // Ì Í Î Ï
  0x0128, 0x1ec8, 0x1eca,                 // Ĩ Ỉ Ị

  // O-family
  0x00d2, 0x00d3, 0x00d4, 0x00d5, 0x00d6, // Ò Ó Ô Õ Ö
  0x1ecc, 0x1ece,                         // Ọ Ỏ
  0x1ed0, 0x1ed2, 0x1ed4, 0x1ed6, 0x1ed8, // Ố Ồ Ổ Ỗ Ộ
  0x01a0,                                 // Ơ
  0x1eda, 0x1edc, 0x1ede, 0x1ee0, 0x1ee2, // Ớ Ờ Ở Ỡ Ợ

  // U-family
  0x00d9, 0x00da, 0x00db, 0x00dc,         // Ù Ú Û Ü
  0x0168, 0x1ee4, 0x1ee6,                 // Ũ Ụ Ủ
  0x01af,                                 // Ư
  0x1ee8, 0x1eea, 0x1eec, 0x1eee, 0x1ef0, // Ứ Ừ Ử Ữ Ự

  // Y-family
  0x00dd, 0x0178,                         // Ý Ÿ
  0x1ef2, 0x1ef4, 0x1ef6, 0x1ef8,         // Ỳ Ỵ Ỷ Ỹ

  // N-tilde
  0x00d1,                                 // Ñ
] as const;

// Punctuation derived by transforming a drawn glyph: comma → quotes, period →
// ellipsis, hyphen → dashes. Auto-composed, never drawn.
const PUNCTUATION_TARGET_CODE_POINTS: readonly number[] = [
  0x0027, // '
  0x0022, // "
  0x2026, // …
  0x2013, // –
  0x2014, // —
] as const;

export type CharacterSet = {
  readonly key: string;
  readonly label: string;
  readonly description: string;
  readonly codePoints: readonly number[];
  readonly suggestedColumns: number;
};

export const CHARACTER_SETS = {
  'latin-extended': {
    key: 'latin-extended',
    label: 'Inkprint Standard',
    description:
      'Basic Latin + 9 accent marks + ~77 auto-composed diacritic letters + derived quotes, dashes & ellipsis.',
    codePoints: [
      ...LATIN_BASIC_CODE_POINTS,
      ...ACCENT_PRIMITIVE_CODE_POINTS,
      ...LATIN_EXTENDED_TARGET_CODE_POINTS,
      ...PUNCTUATION_TARGET_CODE_POINTS,
    ],
    suggestedColumns: 8,
  },
} as const satisfies Record<string, CharacterSet>;

export type CharacterSetKey = keyof typeof CHARACTER_SETS;
