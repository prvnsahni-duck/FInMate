import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
  VersionColumn,
  Index,
  Check,
} from 'typeorm';
import { User } from './user.entity';
import { Group } from './group.entity';
import { GroupKeyVersion } from './group-key-version.entity';
import { GroupMember } from './group-member.entity';

/**
 * Mirrors `Expense`'s payer CHECK: exactly one of `paidByUser`/
 * `paidByGroupMember` is set, and `paidByGroupMember` requires a group.
 */
@Entity('recurring_expenses')
@Index(['nextOccurrenceDate', 'status'])
@Check(
  '(("paidByUserId" IS NOT NULL) <> ("paidByGroupMemberId" IS NOT NULL)) AND ("groupId" IS NOT NULL OR "paidByGroupMemberId" IS NULL)',
)
export class RecurringExpense {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'text' })
  title!: string; // Client-side encrypted

  @Column({ type: 'text', nullable: true })
  description?: string; // Client-side encrypted

  @Column('decimal', { name: 'amount_total', precision: 12, scale: 2 })
  amountTotal!: number; // Plaintext decimal

  @Column({ type: 'char', length: 3 })
  currency!: string;

  @Column({ type: 'varchar', length: 64 })
  category!: string;

  @ManyToOne(() => User, { nullable: true })
  paidByUser?: User;

  /** Group templates only — a pending (Contact-backed) member as payer. */
  @ManyToOne(() => GroupMember, { nullable: true })
  paidByGroupMember?: GroupMember;

  @ManyToOne(() => User, { nullable: false })
  ownerUser!: User;

  @ManyToOne(() => Group, { nullable: true })
  group?: Group;

  /** Key version the template's ciphertext was produced with (group scope). */
  @ManyToOne(() => GroupKeyVersion, { nullable: true, onDelete: 'SET NULL' })
  groupKeyVersion?: GroupKeyVersion;

  @Column({ type: 'varchar', length: 20 })
  frequency!: 'daily' | 'weekly' | 'monthly' | 'yearly';

  @Column({ type: 'date', name: 'start_date' })
  startDate!: string;

  @Column({ type: 'date', name: 'end_date', nullable: true })
  endDate?: string;

  @Column({ type: 'date', name: 'next_occurrence_date' })
  nextOccurrenceDate!: string;

  @Column({ type: 'varchar', length: 20, default: 'active' })
  status!: 'active' | 'paused' | 'completed';

  @VersionColumn()
  version!: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
