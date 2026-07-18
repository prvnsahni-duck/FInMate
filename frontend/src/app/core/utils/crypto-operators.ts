import { OperatorFunction } from 'rxjs';
import { mergeMap } from 'rxjs/operators';
import { ExpenseDecryptionService, DecryptableExpense } from '../services/expense-decryption.service';

/**
 * RxJS operator that decrypts a single expense through the one central
 * pipeline (`ExpenseDecryptionService`). Key resolution, error classification
 * and ciphertext preservation all live in that service — this is a thin adapter.
 */
export function mapDecryptExpense<T extends DecryptableExpense>(
  decryptor: ExpenseDecryptionService,
): OperatorFunction<T, T> {
  return (source) =>
    source.pipe(mergeMap((item) => decryptor.decryptExpense(item)));
}

/**
 * RxJS operator that decrypts an array of expenses through the central pipeline.
 * Each item is annotated with its own decryption state; the rest of the list is
 * unaffected by any single failure.
 */
export function mapDecryptExpenses<T extends DecryptableExpense>(
  decryptor: ExpenseDecryptionService,
): OperatorFunction<T[], T[]> {
  return (source) =>
    source.pipe(mergeMap((items) => decryptor.decryptExpenses(items)));
}
