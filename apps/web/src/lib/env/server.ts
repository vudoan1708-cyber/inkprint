import 'server-only';
import { z } from 'zod';

// Server-only env. Importing this file from a client component will fail the
// Next.js build via the `server-only` guard above.
const schema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  CLOUDFLARE_ACCOUNT_ID: z.string().min(1),
  CLOUDFLARE_ACCESS_KEY: z.string().min(1),
  CLOUDFLARE_SECRET_KEY: z.string().min(1),
  CLOUDFLARE_BUCKET_NAME: z.string().min(1),
});

const parsed = schema.safeParse({
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  CLOUDFLARE_ACCOUNT_ID: process.env.CLOUDFLARE_ACCOUNT_ID,
  CLOUDFLARE_ACCESS_KEY: process.env.CLOUDFLARE_ACCESS_KEY,
  CLOUDFLARE_SECRET_KEY: process.env.CLOUDFLARE_SECRET_KEY,
  CLOUDFLARE_BUCKET_NAME: process.env.CLOUDFLARE_BUCKET_NAME,
});

if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
  throw new Error(`Invalid server environment variables:\n${issues}`);
}

export const serverEnv = parsed.data;
