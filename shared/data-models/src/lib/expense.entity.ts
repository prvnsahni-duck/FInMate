import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
  VersionColumn,
  Index,
  DeleteDateColumn,
  Check,
} from 'typeorm';
import { User } from './user.entity';
import { Group } from './group.entity';
import { GroupKeyVersion } from './group-key-version.entity';
import { GroupMember } from './group-member.entity';

/**
 * `paidByUser` is required for personal (non-group) expenses — there is no
 * GroupMember without a Group. For group expenses, exactly one of
 * `paidByUser`/`paidByGroupMember` is set; a pending (Contact-backed) payer
 * uses `paidByGroupMember`. Enforced by a single CHECK: exactly one of the
 * two payer columns is always set, and `paidByGroupMember` additionally
 * requires a group.
 */
@Entity('expenses')
@Index(['group', 'status', 'expenseDate'])
@Index(['group', 'category'])
@Index(['group', 'ledgerMonth'])
@Check(
  '(("paidByUserId" IS NOT NULL) <> ("paidByGroupMemberId" IS NOT NULL)) AND ("groupId" IS NOT NULL OR "paidByGroupMemberId" IS NULL)',
)
export class Expense {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'text' })
  title!: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column('decimal', {
    name: 'amount_total',
    precision: 12,
    scale: 2,
  })
  amountTotal!: number;

  @Column({ type: 'char', length: 3 })
  currency!: string;

  @Column({ type: 'varchar', length: 64 })
  category!: string;

  /**
   * Distinguishes money leaving the group (`expense`, the default) from money
   * returning to it (`refund` — e.g. a security-deposit return, cashback, or
   * cancellation refund). A refund behaves as a *negative* expense: the same
   * `paidBy*` (who received the money) and `splits` model applies, but its
   * contribution to balances, settlements and net spending is inverted.
   */
  @Column({ type: 'varchar', length: 20, default: 'expense' })
  transactionType!: 'expense' | 'refund';

  @ManyToOne(() => User, { nullable: true })
  paidByUser?: User;

  /** Group expenses only — a pending (Contact-backed) member as payer. */
  @ManyToOne(() => GroupMember, { nullable: true })
  paidByGroupMember?: GroupMember;

  @ManyToOne(() => User, { nullable: false })
  ownerUser!: User;

  @ManyToOne(() => Group, { nullable: true })
  group?: Group;

  @ManyToOne(() => GroupKeyVersion, { nullable: true, onDelete: 'SET NULL' })
  groupKeyVersion?: GroupKeyVersion;

  @Column({ type: 'date' })
  expenseDate!: string;

  @Column({ type: 'varchar', length: 20, default: 'posted' })
  status!: 'draft' | 'posted' | 'void';

  /**
   * Household-only: the billing month this expense belongs to (format `YYYY-MM`).
   * Null for normal group and personal expenses.
   */
  @Column({ type: 'char', length: 7, nullable: true })
  ledgerMonth?: string;

  /**
   * True if this expense is a system-generated carry-forward record from
   * a previous month's surplus balance (household groups only).
   */
  @Column({ type: 'boolean', default: false })
  isCarryForward!: boolean;

  /**
   * Encryption scope determines which key is used for client-side encryption:
   * - `personal`: encrypted with the owner's PBKDF2-derived master key.
   * - `group`: encrypted with the per-group symmetric data key.
   * - `direct_shared`: encrypted with a per-expense content key shared among participants.
   */
  @Column({ type: 'varchar', length: 20, default: 'personal' })
  encryptionScope!: 'personal' | 'group' | 'direct_shared';

  @VersionColumn()
  version!: number;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @DeleteDateColumn({ name: 'deleted_at', nullable: true })
  deletedAt?: Date;
}
