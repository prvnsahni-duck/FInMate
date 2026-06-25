import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  Unique,
} from 'typeorm';
import { Group } from './group.entity';
import { User } from './user.entity';

@Entity('group_members')
@Unique(['group', 'user'])
export class GroupMember {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Group, { nullable: false })
  group!: Group;

  @ManyToOne(() => User, { nullable: false })
  user!: User;

  /**
   * Member role within the group:
   * - `owner` — full control; created the group.
   * - `admin` — can manage members and group settings.
   * - `member` — can create/edit own expenses.
   * - `viewer` — read-only; cannot write any data.
   * - `spectator` — can add/update expenses but is NEVER included in splits
   *   or settlement calculations.
   */
  @Column({ type: 'varchar', length: 20 })
  role!: 'owner' | 'admin' | 'member' | 'viewer' | 'spectator';

  @Column({ type: 'varchar', length: 20 })
  joinStatus!: 'invited' | 'active' | 'left' | 'removed';

  @Column({ type: 'timestamptz', nullable: true })
  joinedAt?: Date;

  @Column({ type: 'timestamptz', nullable: true })
  leftAt?: Date;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
