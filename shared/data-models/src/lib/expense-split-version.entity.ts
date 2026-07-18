import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Expense } from './expense.entity';
import { ExpenseSplit } from './expense-split.entity';
import { User } from './user.entity';

@Entity('expense_split_versions')
@Index(['expense', 'createdAt'])
@Index(['expenseSplit', 'entityVersion'])
export class ExpenseSplitVersion {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Expense, { nullable: false, onDelete: 'CASCADE' })
  expense!: Expense;

  @ManyToOne(() => ExpenseSplit, { nullable: true, onDelete: 'SET NULL' })
  expenseSplit?: ExpenseSplit;

  @Column({ type: 'integer', nullable: true })
  entityVersion?: number;

  @Column({ type: 'varchar', length: 32 })
  action!: 'created' | 'replaced' | 'deleted';

  @Column({ type: 'jsonb' })
  snapshot!: Record<string, unknown>;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  actorUser?: User;

  @CreateDateColumn()
  createdAt!: Date;
}
