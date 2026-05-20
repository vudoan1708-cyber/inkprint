// Vitest setup file: provide the env vars `src/lib/env.ts` validates at import time,
// so test modules that touch the supabase client don't blow up under Zod validation.

process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??= 'sb_publishable_test';
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'sb_secret_test';
