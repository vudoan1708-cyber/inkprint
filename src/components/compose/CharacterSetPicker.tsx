'use client';

import { CHARACTER_SETS, type CharacterSetKey } from '@/lib/characterSets';
import { Button } from '@/components/ui/Button';

type Props = {
  selectedKey: CharacterSetKey;
  onSelect: (key: CharacterSetKey) => void;
};

export function CharacterSetPicker({ selectedKey, onSelect }: Props) {
  const entries = Object.values(CHARACTER_SETS);
  return (
    <div role="tablist" aria-label="Character set" className="flex flex-wrap gap-2">
      {entries.map((entry) => {
        const isActive = entry.key === selectedKey;
        return (
          <Button
            key={entry.key}
            role="tab"
            aria-selected={isActive}
            variant="secondary"
            isActive={isActive}
            onClick={() => onSelect(entry.key as CharacterSetKey)}
            trailingIcon={
              <span className="font-mono text-xs opacity-70">{entry.codePoints.length}</span>
            }
          >
            {entry.label}
          </Button>
        );
      })}
    </div>
  );
}
