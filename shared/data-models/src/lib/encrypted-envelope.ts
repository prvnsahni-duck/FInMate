/**
 * Version-stamped, authenticated ciphertext contract.
 *
 * Per docs/architecture/crypto-reliability-final-spec.md's race-condition
 * closures: every ciphertext must carry the key version it was produced
 * with (so reads resolve by the ciphertext's own stamp, not the group's
 * current key) and that stamp must be cryptographically authenticated —
 * not just structurally present — so a tampered or mismatched groupId/
 * keyVersion is detected as a decrypt failure, not silently accepted.
 *
 * This is a reusable primitive, not yet wired into any entity's storage
 * format; existing title/description fields still use the plain
 * `iv:ciphertext` format from ClientEncryptionService.encrypt/decrypt.
 */

export type EncryptionAlgorithm = 'AES-256-GCM';

/** Schema version of this envelope contract itself (not a record's own domain schema). */
export const ENVELOPE_SCHEMA_VERSION = 1;

export interface EncryptedEnvelopeMetadata {
  /** Group this ciphertext was encrypted for; omitted for personal-scope records. */
  groupId?: string;
  /** Concrete key version the ciphertext was encrypted under. */
  keyVersion?: string;
  /** Identifies which key (e.g. group key vs personal master key) was used. */
  keyId?: string;
  /** Schema version of this envelope contract. */
  schemaVersion: number;
  /** AEAD algorithm used. */
  algorithm: EncryptionAlgorithm;
}

export interface EncryptedEnvelope extends EncryptedEnvelopeMetadata {
  /** base64 IV. */
  iv: string;
  /** base64 ciphertext (includes the GCM authentication tag). */
  ciphertext: string;
}

/** Metadata fields a caller supplies when encrypting; iv/ciphertext are computed. */
export type EncryptedEnvelopeInput = Omit<
  EncryptedEnvelopeMetadata,
  'schemaVersion' | 'algorithm'
>;
