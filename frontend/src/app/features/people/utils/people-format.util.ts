import { PersonHistoryItem } from '@finmate/data-models';

export type Direction = 'owes_you' | 'you_owe' | 'settled';

/** Human sentence for a directional balance, e.g. "Naveen owes you". */
export function directionSentence(
  direction: Direction,
  displayName: string,
): string {
  switch (direction) {
    case 'owes_you':
      return `${displayName} owes you`;
    case 'you_owe':
      return `You owe ${displayName}`;
    default:
      return 'Settled';
  }
}

/** Short chip label for a balance state. */
export function directionChip(direction: Direction): string {
  return direction === 'owes_you'
    ? 'owes you'
    : direction === 'you_owe'
      ? 'you owe'
      : 'settled';
}

/**
 * Human-readable label for a history line — never exposes DB terminology.
 * `Group expense` / `Lent` / `Borrowed` / `Settlement`.
 */
export function historyLabel(item: PersonHistoryItem): string {
  if (item.source === 'group_expense') return 'Group expense';
  if (item.source === 'settlement') return 'Settlement';
  return item.entryType === 'borrow' ? 'Borrowed' : 'Lent';
}
