import { OperatorFunction } from 'rxjs';
import { mergeMap } from 'rxjs/operators';
import { Store } from '@ngxs/store';
import { AuthState } from '../auth/auth.state';
import { ClientEncryptionService } from '../services/encryption.service';
import { DECRYPTION_FAILED_PLACEHOLDER } from '../constants/crypto.constants';

/**
 * Custom RxJS operator that decrypts a single expense object.
 *
 * On decryption failure, replaces encrypted fields with a user-friendly
 * placeholder instead of leaking ciphertexts to the UI.
 */
export function mapDecryptExpense<T extends { id?: string; title?: string; description?: string }>(
  store: Store,
  encryptionService: ClientEncryptionService,
): OperatorFunction<T, T> {
  return (source) =>
    source.pipe(
      mergeMap(async (item) => {
        const user = store.selectSnapshot(AuthState.getUser);
        const email = user?.email;
        if (email) {
          const key = await encryptionService.loadKeyFromSession(email);
          if (key) {
            try {
              return (await encryptionService.decryptExpense(
                item as any,
                key,
              )) as any as T;
            } catch (e) {
              console.error('Decryption failed for expense', item.id, e);
              return {
                ...item,
                title: DECRYPTION_FAILED_PLACEHOLDER,
                description: '',
              } as T;
            }
          }
        }
        return item;
      }),
    );
}

/**
 * Custom RxJS operator that decrypts an array of expense objects.
 *
 * Each item that fails decryption gets placeholder text; the rest of the
 * list is unaffected.
 */
export function mapDecryptExpenses<T extends { id?: string; title?: string; description?: string }>(
  store: Store,
  encryptionService: ClientEncryptionService,
): OperatorFunction<T[], T[]> {
  return (source) =>
    source.pipe(
      mergeMap(async (items) => {
        const user = store.selectSnapshot(AuthState.getUser);
        const email = user?.email;
        if (email && items.length > 0) {
          const key = await encryptionService.loadKeyFromSession(email);
          if (key) {
            return Promise.all(
              items.map(async (item) => {
                try {
                  return (await encryptionService.decryptExpense(
                    item as any,
                    key,
                  )) as any as T;
                } catch (e) {
                  console.error('Decryption failed for expense', item.id, e);
                  return {
                    ...item,
                    title: DECRYPTION_FAILED_PLACEHOLDER,
                    description: '',
                  } as T;
                }
              }),
            );
          }
        }
        return items;
      }),
    );
}
