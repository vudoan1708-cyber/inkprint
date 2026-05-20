import { createClient } from '@supabase/supabase-js';
import { env } from '@/lib/env';

// Service-role client — bypasses RLS. Server-only.
// Used for queue inserts and other privileged writes the user-scoped client cannot perform.
export const supabaseAdmin = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: { persistSession: false, autoRefreshToken: false },
  },
);
