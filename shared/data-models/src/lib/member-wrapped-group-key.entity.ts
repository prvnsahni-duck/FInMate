import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  Unique,
} from 'typeorm';
import { GroupKeyVersion } from './group-key-version.entity';
import { Group } from './group.entity';
import { User } from './user.entity';

@Entity('member_wrapped_group_keys')
@Unique(['groupKeyVersion', 'user'])
export class MemberWrappedGroupKey {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => GroupKeyVersion, { nullable: false, onDelete: 'CASCADE' })
  groupKeyVersion!: GroupKeyVersion;

  @ManyToOne(() => Group, { nullable: false, onDelete: 'CASCADE' })
  group!: Group;

  @ManyToOne(() => User, { nullable: false, onDelete: 'CASCADE' })
  user!: User;

  @Column({ name: 'wrapped_group_key', type: 'text' })
  wrappedGroupKey!: string;

  @Column({ name: 'wrapping_algorithm', type: 'varchar', length: 64, nullable: true })
  wrappingAlgorithm?: string;

  @Column({ name: 'public_key_fingerprint', type: 'varchar', length: 255, nullable: true })
  publicKeyFingerprint?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
