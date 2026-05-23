type Envelope<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string; details?: unknown } };

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
