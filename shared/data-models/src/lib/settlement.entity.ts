import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  VersionColumn,
  Check,
} from 'typeorm';
import { Group } from './group.entity';
import { User } from './user.entity';
import { GroupMember } from './group-member.entity';

/**
 * `fromGroupMember`/`toGroupMember` are the primary reference going forward
 * — every settlement is group-scoped, so GroupMember is always available and
 * correct whether or not the party is registered. `fromUser`/`toUser` are
 * kept as legacy, nullable columns for a future backfill; new code always
 * writes the GroupMember columns. `fromGroupMember` is unused by
 * proposeSettlement today (the caller is always the "from" party, always a
 * User) — the column exists for schema symmetry with a future capability,
 * not a v2 behavior change.
 */
@Entity('settlements')
@Check(
  '(("fromUserId" IS NOT NULL) <> ("fromGroupMemberId" IS NOT NULL)) AND (("toUserId" IS NOT NULL) <> ("toGroupMemberId" IS NOT NULL))',
)
export class Settlement {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Group, { nullable: false })
  group!: Group;

  @ManyToOne(() => User, { nullable: true })
  fromUser?: User;

  @ManyToOne(() => GroupMember, { nullable: true })
  fromGroupMember?: GroupMember;

  @ManyToOne(() => User, { nullable: true })
  toUser?: User;

  @ManyToOne(() => GroupMember, { nullable: true })
  toGroupMember?: GroupMember;

  @Column('decimal', { precision: 12, scale: 2 })
  amount!: number;

  @Column({ type: 'char', length: 3 })
  currency!: string;

  @Column({ type: 'varchar', length: 20, default: 'proposed' })
  status!: 'proposed' | 'confirmed' | 'cancelled';

  @Column({ type: 'date', nullable: true })
  settledOn?: string;

  @Column({ type: 'text', nullable: true })
  note?: string;

  @VersionColumn()
  version!: number;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
