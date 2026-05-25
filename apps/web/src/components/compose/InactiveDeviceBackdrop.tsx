'use client';

import { useId, useState } from 'react';
import { MonitorSmartphone } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';

type Props = {
  activeSince: string;
  onClaim: () => Promise<void>;
};

function formatActiveSince(iso: string): string {
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return 'just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} minute${diffMin === 1 ? '' : 's'} ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hour${diffHr === 1 ? '' : 's'} ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay} day${diffDay === 1 ? '' : 's'} ago`;
}

export function InactiveDeviceBackdrop({ activeSince, onClaim }: Props) {
  const titleId = useId();
  const [isClaiming, setIsClaiming] = useState(false);

  const handleClaim = async (): Promise<void> => {
    setIsClaiming(true);
    try {
      await onClaim();
    } finally {
      setIsClaiming(false);
    }
  };

  return (
    <Modal isOpen role="alertdialog" size="md" ariaLabelledBy={titleId}>
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-brand-100 text-brand-700 dark:bg-brand-900 dark:text-brand-200">
          <MonitorSmartphone className="size-6" aria-hidden />
        </div>
        <div className="flex flex-col gap-1">
          <h2 id={titleId} className="text-lg font-semibold text-surface-900 dark:text-surface-50">
            You&rsquo;re drawing on another device
          </h2>
          <p className="text-sm text-surface-700 dark:text-surface-200">
            Another device claimed this session {formatActiveSince(activeSince)}. Take over here to
            continue drawing.
          </p>
        </div>
        <Button type="button" variant="primary" onClick={handleClaim} isLoading={isClaiming}>
          Take over on this device
        </Button>
      </div>
    </Modal>
  );
}
