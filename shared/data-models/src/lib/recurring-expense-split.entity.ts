import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, Check } from 'typeorm';
import { RecurringExpense } from './recurring-expense.entity';
import { User } from './user.entity';
import { GroupMember } from './group-member.entity';

@Entity('recurring_expense_splits')
@Check('("participantUserId" IS NOT NULL AND "participantGroupMemberId" IS NULL) OR ("participantUserId" IS NULL AND "participantGroupMemberId" IS NOT NULL)')
export class RecurringExpenseSplit {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => RecurringExpense, { nullable: false, onDelete: 'CASCADE' })
  recurringExpense!: RecurringExpense;

  @ManyToOne(() => User, { nullable: true })
  participantUser?: User;

  @ManyToOne(() => GroupMember, { nullable: true })
  participantGroupMember?: GroupMember;

  @Column({ type: 'varchar', length: 16 })
  splitType!: 'equal' | 'fixed' | 'percent' | 'share';

  @Column('decimal', { precision: 12, scale: 4 })
  shareValue!: number;

  @Column('decimal', { name: 'amount_owed', precision: 12, scale: 2 })
  amountOwed!: number; // Plaintext decimal

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
