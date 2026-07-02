import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  Unique,
} from 'typeorm';
import { Expense } from './expense.entity';
import { User } from './user.entity';

/**
 * Stores a per-participant wrapped copy of a direct-shared expense's
 * content key.
 *
 * For `direct_shared` expenses (split with friends, no group), a random
 * AES-256-GCM content key encrypts the expense fields. That content key
 * is wrapped with each participant's personal master key and stored here.
 */
@Entity('encrypted_expense_keys')
@Unique(['expense', 'user'])
export class EncryptedExpenseKey {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Expense, { nullable: false })
  expense!: Expense;

  @ManyToOne(() => User, { nullable: false })
  user!: User;

  /** Base64-encoded wrapped key in `iv_base64:ciphertext_base64` format. */
  @Column({ type: 'text' })
  wrappedKey!: string;

  @CreateDateColumn()
  createdAt!: Date;
}
