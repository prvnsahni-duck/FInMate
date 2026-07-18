import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Attachment } from './attachment.entity';
import { Expense } from './expense.entity';
import { User } from './user.entity';

@Entity('attachment_versions')
@Index(['attachment', 'createdAt'])
@Index(['expense', 'createdAt'])
export class AttachmentVersion {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Attachment, { nullable: true, onDelete: 'SET NULL' })
  attachment?: Attachment;

  @ManyToOne(() => Expense, { nullable: true, onDelete: 'CASCADE' })
  expense?: Expense;

  @Column({ type: 'varchar', length: 32 })
  action!: 'created' | 'replaced' | 'deleted';

  @Column({ type: 'jsonb' })
  snapshot!: Record<string, unknown>;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  actorUser?: User;

  @CreateDateColumn()
  createdAt!: Date;
}
