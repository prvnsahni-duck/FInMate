import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, Check } from 'typeorm';
import { Expense } from './expense.entity';
import { User } from './user.entity';
import { GroupMember } from './group-member.entity';
import { encryptionTransformer } from './encryption.transformer';

@Entity('expense_splits')
@Check('("participantUserId" IS NOT NULL AND "participantGroupMemberId" IS NULL) OR ("participantUserId" IS NULL AND "participantGroupMemberId" IS NOT NULL)')
export class ExpenseSplit {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Expense, { nullable: false })
  expense!: Expense;

  @ManyToOne(() => User, { nullable: true })
  participantUser?: User;

  @ManyToOne(() => GroupMember, { nullable: true })
  participantGroupMember?: GroupMember;

  @Column({ type: 'varchar', length: 16 })
  splitType!: 'equal' | 'fixed' | 'percent' | 'share';

  @Column('decimal', { precision: 12, scale: 4 })
  shareValue!: number;

  @Column({
    type: 'varchar',
    name: 'amount_owed',
    length: 255,
    transformer: encryptionTransformer,
  })
  amountOwed!: number;

  @Column({ type: 'boolean', default: false })
  isSettled!: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  settledAt?: Date;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
