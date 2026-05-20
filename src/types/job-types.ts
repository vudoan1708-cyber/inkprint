import { z } from 'zod';

export const fontGenerateJobPayloadSchema = z.object({
  userId: z.uuid(),
  familyName: z.string().min(1).max(64),
});

export type FontGenerateJobPayload = z.infer<typeof fontGenerateJobPayloadSchema>;

export type ClaimedJob = {
  id: string;
  type: 'font_generate';
  payload: unknown;
  status: 'running';
  attempts: number;
  max_attempts: number;
  locked_at: string | null;
  locked_by: string | null;
  error: string | null;
  created_at: string;
  completed_at: string | null;
};
