import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
} from 'typeorm';
import { Group } from './group.entity';
import { User } from './user.entity';
import { GroupKeyVersion } from './group-key-version.entity';

@Entity('group_invites')
export class GroupInvite {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Group, { nullable: false, onDelete: 'CASCADE' })
  group!: Group;

  @Column({ name: 'invite_token', type: 'uuid', unique: true })
  inviteToken!: string;

  @Column({ name: 'invited_email', type: 'varchar', length: 255, nullable: true })
  invitedEmail?: string;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  inviteeUser?: User;

  @Column({ name: 'wrapped_group_key', type: 'text', nullable: true })
  wrappedGroupKey?: string;

  @ManyToOne(() => GroupKeyVersion, { nullable: true, onDelete: 'SET NULL' })
  groupKeyVersion?: GroupKeyVersion;

  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status!: 'pending' | 'accepted' | 'expired';

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @Column({ name: 'expires_at', type: 'timestamptz', nullable: true })
  expiresAt?: Date;
}
