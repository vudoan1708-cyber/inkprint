import 'server-only';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { serverEnv } from '@/lib/env/server';

const r2Client = new S3Client({
  region: 'auto',
  endpoint: `https://${serverEnv.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: serverEnv.CLOUDFLARE_ACCESS_KEY,
    secretAccessKey: serverEnv.CLOUDFLARE_SECRET_KEY,
  },
});

export const R2_BUCKET = serverEnv.CLOUDFLARE_BUCKET_NAME;

export async function putObject(input: {
  key: string;
  body: Uint8Array;
  contentType: string;
  cacheControl?: string;
}): Promise<void> {
  await r2Client.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: input.key,
      Body: input.body,
      ContentType: input.contentType,
      CacheControl: input.cacheControl ?? 'public, max-age=300',
    }),
  );
}

// One stable key per user — re-embeds overwrite in place so the extension
// can always fetch `fonts/{userId}/latest.otf` without tracking versions.
export function userFontKey(userId: string): string {
  return `fonts/${userId}/latest.otf`;
}
