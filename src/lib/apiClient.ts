import type { Stroke } from '@/lib/strokeMath';
import type { GlyphSource } from '@/types/glyphSchemas';

export type GlyphRecord = {
  codePoint: number;
  svgPath: string;
  width: number;
  quality: number | null;
  strokes: Stroke[] | null;
  smoothingApplied: boolean;
  source: GlyphSource;
  updatedAt: string;
};

type Envelope<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string; details?: unknown } };

async function parseEnvelope<T>(res: Response): Promise<T> {
  const body = (await res.json()) as Envelope<T>;
  if (!body.ok) throw new Error(`${body.error.code}: ${body.error.message}`);
  return body.data;
}

export async function listGlyphs(userId: string): Promise<GlyphRecord[]> {
  const res = await fetch(`/api/glyphs?userId=${encodeURIComponent(userId)}`, {
    method: 'GET',
    headers: { accept: 'application/json' },
  });
  const data = await parseEnvelope<{ glyphs: GlyphRecord[] }>(res);
  return data.glyphs;
}

export async function upsertGlyph(input: {
  userId: string;
  codePoint: number;
  svgPath: string;
  width: number;
  quality?: number;
  strokes?: Stroke[];
  smoothingApplied?: boolean;
  source?: GlyphSource;
}): Promise<void> {
  const { codePoint, ...body } = input;
  const res = await fetch(`/api/glyphs/${codePoint}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  await parseEnvelope<{ codePoint: number }>(res);
}

export type GlyphBulkItem = {
  codePoint: number;
  svgPath: string;
  width: number;
  quality?: number;
  strokes?: Stroke[];
  smoothingApplied?: boolean;
  source?: GlyphSource;
};

// Single-request bulk upsert. The server collapses to one Supabase upsert,
// so this scales with payload size rather than connection count.
export async function upsertGlyphsBulk(input: {
  userId: string;
  glyphs: readonly GlyphBulkItem[];
}): Promise<{ count: number }> {
  const res = await fetch('/api/glyphs', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  return parseEnvelope<{ count: number }>(res);
}

export async function requestFontGeneration(input: {
  userId: string;
  familyName: string;
  signal?: AbortSignal;
}): Promise<{ filename: string }> {
  const res = await fetch('/api/fonts/generate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ userId: input.userId, familyName: input.familyName }),
    signal: input.signal,
  });

  const contentType = res.headers.get('content-type') ?? '';
  if (!res.ok || contentType.startsWith('application/json')) {
    const body = (await res.json()) as Envelope<unknown>;
    if (!body.ok) throw new Error(`${body.error.code}: ${body.error.message}`);
    throw new Error('Unexpected JSON response when expecting font bytes');
  }

  const blob = await res.blob();
  const filename = parseAttachmentFilename(res.headers.get('content-disposition')) ?? `${input.familyName}.otf`;
  triggerDownload(blob, filename);
  return { filename };
}

function parseAttachmentFilename(headerValue: string | null): string | null {
  if (!headerValue) return null;
  const match = headerValue.match(/filename="([^"]+)"/);
  return match?.[1] ?? null;
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
