import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  email!: string;

  @Column({ type: 'varchar', length: 50, unique: true, nullable: true })
  username?: string;

  @Column({ type: 'varchar', length: 20, unique: true, nullable: true })
  phoneNumber?: string;

  @Column({ type: 'varchar', length: 255 })
  passwordHash!: string;

  @Column({ type: 'varchar', length: 120, nullable: true })
  displayName?: string;

  @Column({ type: 'varchar', length: 20, default: 'active' })
  status!: 'active' | 'disabled' | 'invited';

  @Column({ type: 'timestamptz', nullable: true })
  lastLoginAt?: Date;

  @Column({ type: 'varchar', length: 255, nullable: true })
  twoFactorSecret?: string;

  @Column({ type: 'boolean', default: false })
  isTwoFactorEnabled!: boolean;

  /** Server-enforced consent gate: no user data reaches an AI provider unless true. */
  @Column({ name: 'ai_opt_in', type: 'boolean', default: false })
  aiOptIn!: boolean;

  /** The user's public RSA-OAEP wrapping key. */
  @Column({ name: 'public_wrapping_key', type: 'text', nullable: true })
  publicWrappingKey?: string;

  /** The user's private RSA-OAEP wrapping key, encrypted with their master key. */
  @Column({
    name: 'encrypted_private_wrapping_key',
    type: 'text',
    nullable: true,
  })
  encryptedPrivateWrappingKey?: string;

  /**
   * Master-key material wrapped under a client-derived recovery key (zero-knowledge).
   * The recovery code exists only with the user; the server stores this blob only and
   * never sees plaintext key material. Used for the forgot-password recovery flow.
   */
  @Column({ name: 'recovery_wrapped_key', type: 'text', nullable: true })
  recoveryWrappedKey?: string;

  /** When the recovery key was last set/regenerated. */
  @Column({ name: 'recovery_key_created_at', type: 'timestamptz', nullable: true })
  recoveryKeyCreatedAt?: Date;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
