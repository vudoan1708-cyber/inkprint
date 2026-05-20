const range = (start: number, end: number): number[] => {
  const out: number[] = [];
  for (let i = start; i <= end; i++) out.push(i);
  return out;
};

const LATIN_BASIC_CODE_POINTS: readonly number[] = [
  ...range(0x41, 0x5a), // A-Z
  ...range(0x61, 0x7a), // a-z
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

export type CharacterSet = {
  readonly key: string;
  readonly label: string;
  readonly description: string;
  readonly codePoints: readonly number[];
  readonly suggestedColumns: number;
};

export const CHARACTER_SETS = {
  'latin-basic': {
    key: 'latin-basic',
    label: 'English & Basic Latin',
    description: 'Uppercase, lowercase, digits, and common punctuation. ~71 characters.',
    codePoints: LATIN_BASIC_CODE_POINTS,
    suggestedColumns: 8,
  },
} as const satisfies Record<string, CharacterSet>;

export type CharacterSetKey = keyof typeof CHARACTER_SETS;
