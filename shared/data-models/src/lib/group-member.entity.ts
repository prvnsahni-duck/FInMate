import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  Unique,
  Check,
} from 'typeorm';
import { Group } from './group.entity';
import { User } from './user.entity';
import { Contact } from './contact.entity';

/**
 * A GroupMember references a User OR a Contact (at least one, not strict
 * XOR). Once a Contact is claimed at registration, `user` is populated
 * alongside the existing `contact` — both are kept, permanently, for audit/
 * identity/search continuity. `contact` is write-once in practice: set at
 * creation or claim, never repointed except via the formal Contact merge
 * operation (see ContactsService.mergeContacts).
 */
@Entity('group_members')
@Unique(['group', 'user'])
@Unique(['group', 'contact'])
@Check('"userId" IS NOT NULL OR "contactId" IS NOT NULL')
export class GroupMember {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Group, { nullable: false })
  group!: Group;

  @ManyToOne(() => User, { nullable: true })
  user?: User;

  @ManyToOne(() => Contact, { nullable: true })
  contact?: Contact;

  /** Purely cosmetic, per-group override of the Contact/User's display name. */
  @Column({ type: 'varchar', length: 120, nullable: true })
  nickname?: string;

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
