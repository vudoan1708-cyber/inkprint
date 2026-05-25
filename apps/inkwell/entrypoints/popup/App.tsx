import { useEffect, useState } from 'react';
import { Button } from '@inkprint/ui';
import type { WxtStorageItem } from 'wxt/utils/storage';
import type { ExtensionMessage, ExtensionResponse } from '@/lib/messages';
import { WEB_APP_URL, sessionItem, type SessionRecord } from '@/lib/storage';

export function App() {
  const session = useStorageItem(sessionItem);

  if (session === undefined) return <LoadingView />;
  if (session === null) return <SignInView />;
  return <SignedInView session={session} />;
}

function LoadingView() {
  return (
    <main className="w-80 p-4">
      <p className="text-xs text-surface-500 dark:text-surface-400">Loading…</p>
    </main>
  );
}

function SignInView() {
  const handleSignIn = (): void => {
    // TODO: replace with a /extension-connect route on the web app that
    // postMessages the Supabase session back to this extension. For now this
    // just sends the user through the existing web sign-in flow.
    void browser.tabs.create({ url: `${WEB_APP_URL}/extension-connect` });
  };

  return (
    <main className="flex w-80 flex-col gap-3 p-4">
      <h1 className="text-lg font-semibold tracking-tight text-surface-900 dark:text-surface-50">
        Inkwell
      </h1>
      <p className="text-sm text-surface-600 dark:text-surface-300">
        Your handwriting, everywhere on the web.
      </p>
      <Button variant="primary" size="md" fullWidth onClick={handleSignIn}>
        Sign in with InkPrint
      </Button>
      <p className="text-center text-xs text-surface-500 dark:text-surface-400">
        Sign in on the InkPrint web app to connect your font.
      </p>
    </main>
  );
}

function SignedInView({ session }: { session: SessionRecord }) {
  const [appliedFamily, setAppliedFamily] = useState<string | null | undefined>(undefined);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void sendMessage({ type: 'GET_FONT_STATE' }).then((res) => {
      if (cancelled) return;
      if (res.ok) setAppliedFamily(res.data.familyName);
      else setError(res.error);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleApply = async (): Promise<void> => {
    setIsBusy(true);
    setError(null);
    const res = await sendMessage({ type: 'APPLY_FONT' });
    setIsBusy(false);
    if (res.ok) setAppliedFamily(res.data.familyName);
    else setError(res.error);
  };

  const handleUnapply = async (): Promise<void> => {
    setIsBusy(true);
    setError(null);
    const res = await sendMessage({ type: 'UNAPPLY_FONT' });
    setIsBusy(false);
    if (res.ok) setAppliedFamily(null);
    else setError(res.error);
  };

  const handleSignOut = async (): Promise<void> => {
    await sessionItem.setValue(null);
    await sendMessage({ type: 'UNAPPLY_FONT' });
  };

  const isApplied = appliedFamily !== null && appliedFamily !== undefined;

  return (
    <main className="flex w-80 flex-col gap-3 p-4">
      <header className="flex items-center justify-between gap-2">
        <h1 className="text-lg font-semibold tracking-tight text-surface-900 dark:text-surface-50">
          Inkwell
        </h1>
        <Button variant="ghost" size="sm" onClick={handleSignOut}>
          Sign out
        </Button>
      </header>

      <section className="flex flex-col gap-1 rounded-2xl border border-surface-200 px-3.5 py-3 dark:border-surface-700">
        <div className="text-sm font-semibold text-surface-900 dark:text-surface-50">
          My Handwriting
        </div>
        <div className="text-xs text-surface-500 dark:text-surface-400">
          {isApplied ? 'Applied to every open tab' : 'Not applied yet'}
        </div>
      </section>

      {isApplied ? (
        <Button variant="secondary" size="md" fullWidth isLoading={isBusy} onClick={handleUnapply}>
          Remove from every page
        </Button>
      ) : (
        <Button variant="primary" size="md" fullWidth isLoading={isBusy} onClick={handleApply}>
          Apply to every page
        </Button>
      )}

      {error ? (
        <p role="alert" className="text-sm text-danger-600 dark:text-danger-400">
          {error}
        </p>
      ) : null}

      <p className="text-center text-xs text-surface-500 dark:text-surface-400">
        Signed in as {session.email}
      </p>
    </main>
  );
}

function useStorageItem<T>(item: WxtStorageItem<T, Record<string, unknown>>): T | undefined {
  const [value, setValue] = useState<T | undefined>(undefined);
  useEffect(() => {
    let cancelled = false;
    void item.getValue().then((v) => {
      if (!cancelled) setValue(v);
    });
    const unwatch = item.watch((newValue) => setValue(newValue));
    return () => {
      cancelled = true;
      unwatch();
    };
  }, [item]);
  return value;
}

async function sendMessage(message: ExtensionMessage): Promise<ExtensionResponse> {
  return (await browser.runtime.sendMessage(message)) as ExtensionResponse;
}
