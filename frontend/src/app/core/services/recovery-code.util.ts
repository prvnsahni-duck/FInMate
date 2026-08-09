/**
 * Recovery-code helpers for the zero-knowledge account-recovery flow.
 *
 * A recovery code is high-entropy, human-transcribable material the user stores
 * offline. It is fed through the same PBKDF2 derivation as a password (with the
 * account email as salt) to derive a key that wraps the user's private wrapping
 * key — see ClientEncryptionService.deriveMasterKey. The code itself never
 * leaves the device in plaintext.
 */

// Crockford base32: no I, L, O, U — avoids visual/audio ambiguity when a user
// writes the code down and types it back.
const CROCKFORD_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const GROUPS = 4;
const CHARS_PER_GROUP = 5;
const TOTAL_CHARS = GROUPS * CHARS_PER_GROUP; // 20 chars ≈ 100 bits of entropy

function getCrypto(): Crypto {
  if (typeof window !== 'undefined' && window.crypto) {
    return window.crypto;
  }
  if (typeof globalThis !== 'undefined' && globalThis.crypto) {
    return globalThis.crypto;
  }
  throw new Error('Web Cryptography API is not available');
}

/**
 * Generates a fresh recovery code, formatted as four hyphen-separated groups of
 * five Crockford base32 characters, e.g. `A1B2C-3D4E5-F6G7H-8J9K0`.
 */
export function generateRecoveryCode(): string {
  const alphabetLen = CROCKFORD_ALPHABET.length;
  const max = Math.floor(256 / alphabetLen) * alphabetLen; // rejection sampling: no modulo bias
  const chars: string[] = [];

  while (chars.length < TOTAL_CHARS) {
    const bytes = getCrypto().getRandomValues(new Uint8Array(TOTAL_CHARS));
    for (let i = 0; i < bytes.length && chars.length < TOTAL_CHARS; i++) {
      if (bytes[i] < max) {
        chars.push(CROCKFORD_ALPHABET[bytes[i] % alphabetLen]);
      }
    }
  }

  const groups: string[] = [];
  for (let i = 0; i < GROUPS; i++) {
    groups.push(
      chars.slice(i * CHARS_PER_GROUP, (i + 1) * CHARS_PER_GROUP).join(''),
    );
  }
  return groups.join('-');
}

/**
 * Normalizes user-entered recovery-code input into the canonical form used for
 * key derivation: uppercased, whitespace/hyphens stripped, and Crockford's
 * ambiguous-character aliases folded (I/L→1, O→0). This lets a user paste the
 * code with or without hyphens/spacing and still derive the same key.
 */
export function normalizeRecoveryCode(input: string): string {
  return input
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .replace(/[IL]/g, '1')
    .replace(/O/g, '0');
}
