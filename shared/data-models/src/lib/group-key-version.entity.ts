import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  Unique,
} from 'typeorm';
import { Group } from './group.entity';
import { User } from './user.entity';

@Entity('group_key_versions')
@Unique(['group', 'version'])
export class GroupKeyVersion {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Group, { nullable: false, onDelete: 'CASCADE' })
  group!: Group;

  @Column({ type: 'integer' })
  version!: number;

  @Column({ type: 'varchar', length: 64, default: 'AES-256-GCM' })
  algorithm!: string;

  @Column({ type: 'varchar', length: 20, default: 'ACTIVE' })
  status!: 'ACTIVE' | 'SUPERSEDED' | 'REVOKED';

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @Column({ name: 'rotated_at', type: 'timestamptz', nullable: true })
  rotatedAt?: Date;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  rotatedByUser?: User;

  @Column({ name: 'rotation_reason', type: 'varchar', length: 255, nullable: true })
  rotationReason?: string;
}
