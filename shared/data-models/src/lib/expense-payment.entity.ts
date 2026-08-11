import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  VersionColumn,
  ManyToOne,
  Index,
  Check,
} from 'typeorm';
import { Expense } from './expense.entity';
import { User } from './user.entity';
import { GroupMember } from './group-member.entity';

/**
 * One row per payer of an `Expense`. Multi-payer support: an expense may be
 * paid by several people, so the authoritative record of "who paid how much"
 * lives here, one row per contributing payer.
 *
 * For backward compatibility, `Expense.paidByUser`/`paidByGroupMember` are kept
 * as the *primary* payer (the largest payment, tie-broken deterministically);
 * new balance code reads `ExpensePayment` rows. Every expense — including
 * legacy single-payer ones (backfilled) — has at least one payment row whose
 * amounts sum to `Expense.amountTotal`.
 *
 * Mirrors `ExpenseSplit`'s identity model: exactly one of `paidByUser` /
 * `paidByGroupMember` is set. A pending (Contact-backed) group payer uses
 * `paidByGroupMember`; personal-expense payers use `paidByUser`.
 */
@Entity('expense_payments')
@Index(['expense'])
@Check(
  '("paidByUserId" IS NOT NULL AND "paidByGroupMemberId" IS NULL) OR ("paidByUserId" IS NULL AND "paidByGroupMemberId" IS NOT NULL)',
)
export class ExpensePayment {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Expense, { nullable: false, onDelete: 'CASCADE' })
  expense!: Expense;

  @ManyToOne(() => User, { nullable: true })
  paidByUser?: User;

  @ManyToOne(() => GroupMember, { nullable: true })
  paidByGroupMember?: GroupMember;

  @Column('decimal', { precision: 12, scale: 2 })
  amount!: number;

  @VersionColumn()
  version!: number;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @DeleteDateColumn({ name: 'deleted_at', nullable: true })
  deletedAt?: Date;
}
