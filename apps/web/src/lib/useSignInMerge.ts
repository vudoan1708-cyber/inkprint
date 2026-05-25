'use client';

import { useCallback, useEffect, useState } from 'react';
import { postEnvelope } from '@/lib/apiClient';
import { clearAnonUserId } from '@/lib/userId';

export type MergeConflict = {
  codePoint: number;
  local: { svgPath: string; strokes: unknown };
  cloud: { svgPath: string; strokes: unknown };
};

export type SignInMergeState =
  | { status: 'idle'; conflicts: null; mergeVersion: number }
  | { status: 'previewing'; conflicts: null; mergeVersion: number }
  | { status: 'conflicts'; conflicts: MergeConflict[]; mergeVersion: number }
  | { status: 'applying'; conflicts: MergeConflict[] | null; mergeVersion: number }
  | { status: 'done'; conflicts: null; mergeVersion: number }
  | { status: 'error'; conflicts: null; mergeVersion: number; message: string };

type PreviewData = {
  conflicts: MergeConflict[];
  autoMerged: number;
  localOnly: number;
  identical: number;
};
type ApplyData = { applied: number; deleted: number };

type Args = {
  authUserId: string | null;
  anonUserId: string | null;
};

const INITIAL: SignInMergeState = { status: 'idle', conflicts: null, mergeVersion: 0 };

export function useSignInMerge({ authUserId, anonUserId }: Args) {
  const [state, setState] = useState<SignInMergeState>(INITIAL);

  // Microtask defer keeps the kickoff setState out of the effect body (React 19 cascading-render trap).
  useEffect(() => {
    if (!authUserId || !anonUserId || authUserId === anonUserId) return;
    let cancelled = false;

    queueMicrotask(async () => {
      if (cancelled) return;
      setState((prev) => ({ status: 'previewing', conflicts: null, mergeVersion: prev.mergeVersion }));

      try {
        const data = await postEnvelope<PreviewData>('/api/glyphs/merge-preview', {
          fromUserId: anonUserId,
          toUserId: authUserId,
        });
        if (cancelled) return;
        const { conflicts, autoMerged, identical } = data;
        if (conflicts.length > 0) {
          setState((prev) => ({
            status: 'conflicts',
            conflicts,
            mergeVersion: prev.mergeVersion,
          }));
          return;
        }
        if (autoMerged === 0 && identical === 0) {
          clearAnonUserId();
          setState((prev) => ({
            status: 'done',
            conflicts: null,
            mergeVersion: prev.mergeVersion + 1,
          }));
          return;
        }
        await postEnvelope<ApplyData>('/api/glyphs/merge-apply', {
          fromUserId: anonUserId,
          toUserId: authUserId,
        });
        if (cancelled) return;
        clearAnonUserId();
        setState((prev) => ({
          status: 'done',
          conflicts: null,
          mergeVersion: prev.mergeVersion + 1,
        }));
      } catch (error) {
        if (cancelled) return;
        setState((prev) => ({
          status: 'error',
          conflicts: null,
          mergeVersion: prev.mergeVersion,
          message: error instanceof Error ? error.message : 'Merge failed.',
        }));
      }
    });

    return () => {
      cancelled = true;
    };
  }, [authUserId, anonUserId]);

  const resolve = useCallback(
    async (resolutions: Record<number, 'local' | 'cloud'>): Promise<void> => {
      if (!authUserId || !anonUserId) return;
      setState((prev) => ({
        status: 'applying',
        conflicts: prev.status === 'conflicts' ? prev.conflicts : null,
        mergeVersion: prev.mergeVersion,
      }));
      try {
        const stringified: Record<string, 'local' | 'cloud'> = {};
        for (const [cp, choice] of Object.entries(resolutions)) stringified[String(cp)] = choice;
        await postEnvelope<ApplyData>('/api/glyphs/merge-apply', {
          fromUserId: anonUserId,
          toUserId: authUserId,
          resolutions: stringified,
        });
        clearAnonUserId();
        setState((prev) => ({
          status: 'done',
          conflicts: null,
          mergeVersion: prev.mergeVersion + 1,
        }));
      } catch (error) {
        setState((prev) => ({
          status: 'error',
          conflicts: null,
          mergeVersion: prev.mergeVersion,
          message: error instanceof Error ? error.message : 'Apply failed.',
        }));
      }
    },
    [authUserId, anonUserId],
  );

  return { state, resolve };
}
