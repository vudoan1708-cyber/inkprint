export type ExtensionMessage =
  | { type: 'GET_FONT_STATE' }
  | { type: 'APPLY_FONT' }
  | { type: 'UNAPPLY_FONT' };

export type ExtensionResponse =
  | { ok: true; data: { applied: boolean; familyName: string | null } }
  | { ok: false; error: string };
