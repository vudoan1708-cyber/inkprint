import { vi } from 'vitest';

export type SupabaseMockResult = {
  data?: unknown;
  error?: unknown;
  count?: number | null;
};

// Chainable mock: every method returns the same proxy, and awaiting it resolves
// to `result`. Use this to stub Supabase JS client query chains like
// `.from('t').insert(...).select(...).single()` without modelling each step.
export function chainMock(result: SupabaseMockResult): unknown {
  const proxy: unknown = new Proxy(
    {} as Record<string, unknown>,
    {
      get(_target, prop) {
        if (prop === 'then') {
          return (
            onFulfilled: (v: SupabaseMockResult) => unknown,
            onRejected?: (e: unknown) => unknown,
          ) => Promise.resolve(result).then(onFulfilled, onRejected);
        }
        return vi.fn(() => proxy);
      },
    },
  );
  return proxy;
}
