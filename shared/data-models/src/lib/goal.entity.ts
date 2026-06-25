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

@Entity('goals')
export class Goal {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => User, { nullable: false })
  ownerUser!: User;

  @Column({ type: 'varchar', length: 160 })
  title!: string;

  @Column('decimal', { precision: 12, scale: 2 })
  targetAmount!: number;

  @Column('decimal', { precision: 12, scale: 2, default: 0 })
  savedAmount!: number;

  @Column({ type: 'char', length: 3 })
  currency!: string;

  @Column({ type: 'date', nullable: true })
  targetDate?: string;

  @Column({ type: 'varchar', length: 20, default: 'active' })
  status!: 'active' | 'achieved' | 'paused' | 'cancelled';

  @VersionColumn()
  version!: number;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
