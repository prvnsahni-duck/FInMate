import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Settlement } from './settlement.entity';
import { User } from './user.entity';

@Entity('settlement_versions')
@Index(['settlement', 'entityVersion'])
export class SettlementVersion {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Settlement, { nullable: false, onDelete: 'CASCADE' })
  settlement!: Settlement;

  @Column({ type: 'integer' })
  entityVersion!: number;

  @Column({ type: 'varchar', length: 32 })
  action!: 'proposed' | 'confirmed' | 'cancelled';

  @Column({ type: 'jsonb' })
  snapshot!: Record<string, unknown>;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  actorUser?: User;

  @CreateDateColumn()
  createdAt!: Date;
}
