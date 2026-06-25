import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  VersionColumn,
} from 'typeorm';
import { User } from './user.entity';

@Entity('groups')
export class Group {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 120 })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'varchar', length: 24, default: 'private' })
  visibility!: 'private' | 'invite_only' | 'public_readonly';

  /** Base currency for all expenses in this group (ISO 4217). */
  @Column({ type: 'char', length: 3, default: 'USD' })
  currency!: string;

  /**
   * Group type:
   * - `normal` — standard expense-sharing group.
   * - `household` — month-based ledger; previous months are immutable;
   *   optional carry-forward of extra-paid balances.
   */
  @Column({ type: 'varchar', length: 20, default: 'normal' })
  groupType!: 'normal' | 'household';

  /**
   * Household-only: when true, at month close the system carries forward
   * any extra-paid balance per member into the next month.
   */
  @Column({ type: 'boolean', default: false })
  carryForwardEnabled!: boolean;

  @ManyToOne(() => User, { nullable: false })
  ownerUser!: User;

  @Column({ type: 'uuid', unique: true, nullable: true })
  inviteToken?: string;

  @Column({ type: 'boolean', default: false })
  isArchived!: boolean;

  @VersionColumn()
  version!: number;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
