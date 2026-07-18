import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Expense } from './expense.entity';
import { User } from './user.entity';

@Entity('expense_versions')
@Index(['expense', 'entityVersion'])
export class ExpenseVersion {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Expense, { nullable: false, onDelete: 'CASCADE' })
  expense!: Expense;

  @Column({ type: 'integer' })
  entityVersion!: number;

  @Column({ type: 'varchar', length: 32 })
  action!: 'created' | 'updated' | 'deleted' | 'restored';

  @Column({ type: 'jsonb' })
  snapshot!: Record<string, unknown>;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  actorUser?: User;

  @CreateDateColumn()
  createdAt!: Date;
}
