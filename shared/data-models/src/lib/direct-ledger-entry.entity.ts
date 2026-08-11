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
import { User } from './user.entity';

/**
 * A direct, group-less person-to-person obligation or settlement between two
 * registered users — the "Splitwise direct lending" primitive.
 *
 * Direction convention (mirrors the group balance engine): the entry always
 * records a movement from `fromUser` (debtor side) to `toUser` (creditor side).
 *  - `lend`/`borrow`  — the same underlying obligation captured from opposite
 *                       viewpoints; both normalise so that `toUser` is owed
 *                       `amount` by `fromUser`.
 *  - `settlement`     — a repayment ("Return") that *reduces* an outstanding
 *                       obligation; `fromUser` pays `toUser` back.
 *
 * Balances are derived by netting these entries per counterparty per currency
 * alongside group-derived obligations — never stored as an aggregate. Entries
 * are immutable history: edits/voids soft-delete (they are never mutated into a
 * smaller amount), preserving the full audit trail.
 */
@Entity('direct_ledger_entries')
@Index(['fromUser'])
@Index(['toUser'])
@Index(['occurredOn'])
@Check('"fromUserId" <> "toUserId"')
@Check('amount > 0')
export class DirectLedgerEntry {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Debtor side of the movement (the payer for a `settlement`). */
  @ManyToOne(() => User, { nullable: false })
  fromUser!: User;

  /** Creditor side of the movement (the recipient for a `settlement`). */
  @ManyToOne(() => User, { nullable: false })
  toUser!: User;

  /**
   * The user who recorded the entry — used for audit and to scope which side's
   * viewpoint created it. Always one of `fromUser`/`toUser`.
   */
  @ManyToOne(() => User, { nullable: false })
  createdByUser!: User;

  @Column({ type: 'varchar', length: 16 })
  entryType!: 'lend' | 'borrow' | 'settlement';

  @Column('decimal', { precision: 12, scale: 2 })
  amount!: number;

  @Column({ type: 'char', length: 3 })
  currency!: string;

  @Column({ type: 'text', nullable: true })
  note?: string;

  /** User-facing date the lend/borrow/return happened (YYYY-MM-DD). */
  @Column({ type: 'date' })
  occurredOn!: string;

  @VersionColumn()
  version!: number;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @DeleteDateColumn({ name: 'deleted_at', nullable: true })
  deletedAt?: Date;
}
