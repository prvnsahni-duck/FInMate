import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
} from 'typeorm';
import { User } from './user.entity';
import { Group } from './group.entity';

@Entity('audit_logs')
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => User, { nullable: true })
  actorUser?: User;

  @Column({ type: 'varchar', length: 80 })
  action!: string;

  @Column({ type: 'varchar', length: 80 })
  entityType!: string;

  @Column({ type: 'uuid' })
  entityId!: string;

  @Column({ type: 'varchar', length: 20 })
  scope!: 'personal' | 'group' | 'system';

  @ManyToOne(() => Group, { nullable: true })
  group?: Group;

  @Column({ type: 'varchar', length: 64, nullable: true })
  requestId?: string;

  @Column({ type: 'varchar', length: 128, nullable: true })
  ipHash?: string;

  @Column({ type: 'jsonb', nullable: true })
  metadataJson?: Record<string, unknown>;

  @CreateDateColumn()
  createdAt!: Date;
}
