import { OperatorFunction } from 'rxjs';
import { mergeMap } from 'rxjs/operators';
import { Store } from '@ngxs/store';
import { AuthState } from '../auth/auth.state';
import { ClientEncryptionService } from '../services/encryption.service';
import { GroupKeyService } from '../services/group-key.service';
import { DECRYPTION_FAILED_PLACEHOLDER } from '../constants/crypto.constants';

/**
 * Resolves the appropriate CryptoKey for an expense based on its encryption scope.
 */
async function resolveExpenseKey(
  item: any,
  user: any,
  email: string,
  encryptionService: ClientEncryptionService,
  groupKeyService: GroupKeyService,
): Promise<CryptoKey | null> {
  try {
    const scope = item.encryptionScope || 'personal';
    const groupId = item.groupId;

    if (scope === 'group' && groupId) {
      return await groupKeyService.getGroupDataKey(groupId);
    }

    if (scope === 'direct_shared') {
      const wrappedContentKeys = item.wrappedContentKeys || [];
      const myWrapped = wrappedContentKeys.find((wk: any) => wk.userId === user?.userId);
      if (myWrapped) {
        const masterKey = await encryptionService.loadKeyFromSession(email);
        if (masterKey) {
          try {
            return await encryptionService.unwrapKey(myWrapped.wrappedKey, masterKey);
          } catch (e) {
            console.error('Failed to unwrap direct_shared content key', item.id, e);
          }
        }
      }
    }

    // Default: personal
    return await encryptionService.loadKeyFromSession(email);
  } catch (e) {
    console.error('Error resolving expense key:', e);
    return null;
  }
}

/**
 * Custom RxJS operator that decrypts a single expense object.
 *
 * On decryption failure, replaces encrypted fields with a user-friendly
 * placeholder instead of leaking ciphertexts to the UI.
 */
export function mapDecryptExpense<T extends { id?: string; title?: string; description?: string }>(
  store: Store,
  encryptionService: ClientEncryptionService,
  groupKeyService: GroupKeyService,
): OperatorFunction<T, T> {
  return (source) =>
    source.pipe(
      mergeMap(async (item) => {
        const user = store.selectSnapshot(AuthState.getUser);
        const email = user?.email;
        if (email) {
          const key = await resolveExpenseKey(item, user, email, encryptionService, groupKeyService);
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
  groupKeyService: GroupKeyService,
): OperatorFunction<T[], T[]> {
  return (source) =>
    source.pipe(
      mergeMap(async (items) => {
        const user = store.selectSnapshot(AuthState.getUser);
        const email = user?.email;
        if (email && items.length > 0) {
          return Promise.all(
            items.map(async (item) => {
              const key = await resolveExpenseKey(item, user, email, encryptionService, groupKeyService);
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
              return item;
            }),
          );
        }
        return items;
      }),
    );
}
