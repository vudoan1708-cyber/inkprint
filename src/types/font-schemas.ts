import { z } from 'zod';

// Sanitised familyName: alphanumeric + space + hyphen only — embedded into CSS at render time,
// so we strip anything that could break out of a string literal or @font-face declaration.
const familyNameRegex = /^[A-Za-z0-9 -]+$/;

export const fontGenerateSchema = z.object({
  userId: z.uuid(),
  familyName: z
    .string()
    .min(1)
    .max(64)
    .regex(familyNameRegex, 'familyName must be alphanumeric, spaces, or hyphens'),
});

export type FontGenerateInput = z.infer<typeof fontGenerateSchema>;
