import 'server-only';
import { z } from 'zod';

// Server-only env. Importing this file from a client component will fail the
// Next.js build via the `server-only` guard above.
const schema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
});

const parsed = schema.safeParse({
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
});

if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
  throw new Error(`Invalid server environment variables:\n${issues}`);
}

export const serverEnv = parsed.data;
