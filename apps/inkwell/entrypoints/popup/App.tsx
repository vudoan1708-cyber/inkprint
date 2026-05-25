import { useEffect, useState } from 'react';
import { Button, Slider } from '@inkprint/ui';
import type { WxtStorageItem } from 'wxt/utils/storage';
import type { ExtensionMessage, ExtensionResponse } from '@/lib/messages';
import { WEB_APP_URL } from '@/lib/env';
import { appliedFontItem, cachedFontItem, fontSizeItem, sessionItem, signedOutItem, type SessionRecord } from '@/lib/storage';

export function App() {
  const session = useStorageItem(sessionItem);

  // On every popup open, ask the background to re-check /api/me. Handles the
  // "already signed in on web" case and picks up post-OAuth sign-ins.
  useEffect(() => {
    void sendMessage({ type: 'REFRESH_SESSION' });
  }, []);

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
  const handleSignIn = async (): Promise<void> => {
    await signedOutItem.setValue(false);
    await browser.tabs.create({ url: WEB_APP_URL });
  };

  return (
    <main className="flex w-80 flex-col gap-3 p-4">
      <h1 className="text-lg font-semibold tracking-tight text-surface-900 dark:text-surface-50">
        Inkwell
      </h1>
      <p className="text-sm text-surface-600 dark:text-surface-300">
        Sign in with your InkPrint account so Inkwell can find the fonts you&rsquo;ve
        created and apply them everywhere on the web.
      </p>
      <Button
        variant="primary"
        size="md"
        fullWidth
        onClick={() => void handleSignIn()}
      >
        Sign in on InkPrint
      </Button>
      <p className="text-center text-xs text-surface-500 dark:text-surface-400">
        We&rsquo;ll open InkPrint in a new tab. Sign in there, then come back —
        Inkwell picks up your account automatically.
      </p>
    </main>
  );
}

function SignedInView({ session }: { session: SessionRecord }) {
  const fontSize = useStorageItem(fontSizeItem) ?? 100;
  const [appliedFamily, setAppliedFamily] = useState<string | null | undefined>(undefined);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void sendMessage({ type: 'GET_FONT_STATE' }).then((res) => {
      if (cancelled) return;
      if (res.ok) setAppliedFamily(res.data?.familyName);
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
    if (res.ok) setAppliedFamily(res.data?.familyName);
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
    await signedOutItem.setValue(true);
    await sessionItem.setValue(null);
    await cachedFontItem.setValue(null);
    await appliedFontItem.setValue(null);
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
          {isApplied ? 'Applied to every open tab' : 'Your embedded handwriting font, applied across every tab.'}
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

      {isApplied ? (
        <>
          <Slider
            label="Font size"
            min={50}
            max={400}
            step={5}
            value={fontSize}
            valueSuffix="%"
            onChange={(next) => void fontSizeItem.setValue(next)}
          />
          <p className="text-xs text-surface-500 dark:text-surface-400">
            Don&rsquo;t see the font on a page? Refresh that tab.
          </p>
        </>
      ) : null}

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
