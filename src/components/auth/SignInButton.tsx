'use client';

import Image from 'next/image';
import { LogIn } from 'lucide-react';
import { Button, type ButtonSize, type ButtonVariant } from '@/components/ui/Button';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import { useAuth } from '@/lib/useAuth';

type Props = {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

export function SignInButton({ variant = 'primary', size = 'sm' }: Props) {
  const auth = useAuth();

  const handleSignIn = async (): Promise<void> => {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  };

  const handleSignOut = async (): Promise<void> => {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
  };

  if (auth.status === 'signed-in') {
    const label = auth.user.email ?? 'Account';
    const meta = auth.user.user_metadata ?? {};
    const avatarUrl =
      (typeof meta.avatar_url === 'string' ? meta.avatar_url : undefined) ??
      (typeof meta.picture === 'string' ? meta.picture : undefined);
    return (
      <div className="flex items-center gap-2">
        {avatarUrl ? (
          <Image
            src={avatarUrl}
            alt=""
            width={28}
            height={28}
            referrerPolicy="no-referrer"
            className="size-7 rounded-full border border-surface-200 object-cover dark:border-surface-700"
          />
        ) : null}
        <Button variant="ghost" size={size} onClick={handleSignOut} title={`Signed in as ${label} — click to sign out`}>
          Sign out
        </Button>
      </div>
    );
  }

  return (
    <Button
      variant={variant}
      size={size}
      onClick={handleSignIn}
      leadingIcon={<LogIn className="size-4" aria-hidden />}
      disabled={auth.status === 'loading'}
    >
      Sign in
    </Button>
  );
}
