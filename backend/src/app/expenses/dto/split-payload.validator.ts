import {
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { EXPENSE_SPLIT_TYPES, ExpenseSplitInputDto } from './expense-split.dto';

const toCents = (value: number): number =>
  Math.round((value + Number.EPSILON) * 100);

@ValidatorConstraint({ name: 'splitPayloadValidator', async: false })
export class SplitPayloadValidator implements ValidatorConstraintInterface {
  validate(value: unknown, args: ValidationArguments): boolean {
    const requireNonEmpty = Boolean(args.constraints?.[0]);

    if (value === undefined || value === null) {
      return !requireNonEmpty;
    }

    if (!Array.isArray(value)) {
      return false;
    }

    const splits = value as ExpenseSplitInputDto[];

    if (requireNonEmpty && splits.length === 0) {
      return false;
    }

    if (splits.length === 0) {
      return true;
    }

    const splitType = splits[0]?.splitType;
    if (!splitType || !EXPENSE_SPLIT_TYPES.includes(splitType)) {
      return false;
    }

    const seenParticipants = new Set<string>();

    for (const split of splits) {
      const hasUser = Boolean(split.participantUserId);
      const hasGroupMember = Boolean(split.participantGroupMemberId);
      if ((hasUser && hasGroupMember) || (!hasUser && !hasGroupMember)) {
        return false;
      }

      if (split.splitType !== splitType) {
        return false;
      }

      if (
        !Number.isFinite(Number(split.shareValue)) ||
        Number(split.shareValue) <= 0
      ) {
        return false;
      }

      const participantKey =
        split.participantUserId || split.participantGroupMemberId;
      if (!participantKey) {
        return false;
      }

      if (seenParticipants.has(participantKey)) {
        return false;
      }
      seenParticipants.add(participantKey);
    }

    const sum = splits.reduce(
      (acc, split) => acc + Number(split.shareValue),
      0,
    );

    if (
      splitType === 'equal' &&
      !splits.every((split) => Number(split.shareValue) === 1)
    ) {
      return false;
    }

    if (splitType === 'percent' && Math.abs(sum - 100) > 0.0001) {
      return false;
    }

    if (splitType === 'fixed') {
      const dto = args.object as { amountTotal?: number };
      if (typeof dto.amountTotal !== 'number') {
        return true;
      }
      return toCents(sum) === toCents(dto.amountTotal);
    }

    return true;
  }

  defaultMessage(args: ValidationArguments): string {
    const requireNonEmpty = Boolean(args.constraints?.[0]);
    if (requireNonEmpty) {
      return 'splits must be a non-empty array with valid participants, uniform splitType, unique participants, and valid totals';
    }
    return 'if provided, splits must contain valid participants, uniform splitType, unique participants, and valid totals';
  }
}
