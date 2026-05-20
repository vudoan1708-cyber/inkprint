import { randomUUID } from 'node:crypto';
import { supabaseAdmin } from '@/lib/supabase/admin';
import {
  fontGenerateJobPayloadSchema,
  type ClaimedJob,
  type FontGenerateJobPayload,
} from '@/types/job-types';

const WORKER_ID = `worker-${randomUUID().slice(0, 8)}`;

export async function processNextJob(): Promise<boolean> {
  const { data, error } = await supabaseAdmin.rpc('claim_job', { worker_id: WORKER_ID });
  if (error) throw new Error(`claim_job failed: ${error.message}`);

  const jobs = (data ?? []) as ClaimedJob[];
  const job = jobs[0];
  if (!job) return false;

  try {
    switch (job.type) {
      case 'font_generate': {
        const payload = fontGenerateJobPayloadSchema.parse(job.payload);
        await handleFontGenerate(payload);
        break;
      }
      default: {
        throw new Error(`Unknown job type: ${(job as { type: string }).type}`);
      }
    }

    await supabaseAdmin
      .from('jobs')
      .update({ status: 'complete', completed_at: new Date().toISOString() })
      .eq('id', job.id);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    const exhausted = job.attempts >= job.max_attempts;
    await supabaseAdmin
      .from('jobs')
      .update({
        status: exhausted ? 'failed' : 'pending',
        error: message,
        locked_at: null,
        locked_by: null,
      })
      .eq('id', job.id);
  }

  return true;
}

// Stub: real implementation will assemble via opentype.js, compile OTF/TTF/WOFF2,
// upload to R2, and store the resulting object keys. For now we just count the user's
// current glyphs and upsert the fonts row so the queue plumbing is observable end-to-end.
async function handleFontGenerate(payload: FontGenerateJobPayload): Promise<void> {
  const { count, error: countError } = await supabaseAdmin
    .from('glyphs')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', payload.userId);

  if (countError) throw new Error(`Failed to count glyphs: ${countError.message}`);

  const { error: upsertError } = await supabaseAdmin.from('fonts').upsert(
    {
      user_id: payload.userId,
      family_name: payload.familyName,
      glyph_count: count ?? 0,
      last_compiled_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  );

  if (upsertError) throw new Error(`Failed to upsert font row: ${upsertError.message}`);
}
