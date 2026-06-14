import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn, UpdateDateColumn, VersionColumn, Index } from 'typeorm';
import { User } from './user.entity';
import { Group } from './group.entity';

@Entity('expenses')
@Index(['group', 'status', 'expenseDate'])
@Index(['group', 'category'])
export class Expense {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 160 })
  title!: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column('decimal', { precision: 12, scale: 2 })
  amountTotal!: number;

  @Column({ type: 'char', length: 3 })
  currency!: string;

  @Column({ type: 'varchar', length: 64 })
  category!: string;

  @ManyToOne(() => User, { nullable: false })
  paidByUser!: User;

  @ManyToOne(() => User, { nullable: false })
  ownerUser!: User;

  @ManyToOne(() => Group, { nullable: true })
  group?: Group;

  @Column({ type: 'date' })
  expenseDate!: string;

  @Column({ type: 'varchar', length: 20, default: 'posted' })
  status!: 'draft' | 'posted' | 'void';

  @VersionColumn()
  version!: number;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
