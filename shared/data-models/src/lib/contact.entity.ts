import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
} from 'typeorm';
import { User } from './user.entity';

/**
 * Represents a real-world person known to FinMate, with or without an
 * account. Created only as a side effect of being added to a group by
 * someone else — never self-created. May be linked to many `GroupMember`
 * rows across unrelated groups (the same Contact, reused, not duplicated).
 *
 * A Contact that never registers is a permanent, valid end-state, not an
 * anomaly — nothing should treat `status: 'pending'` as something to clean up.
 */
@Entity('contacts')
export class Contact {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  email?: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  phoneNumber?: string;

  @Column({ type: 'varchar', length: 120, nullable: true })
  displayName?: string;

  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status!: 'pending' | 'claimed' | 'archived';

  @ManyToOne(() => User, { nullable: false })
  createdByUser!: User;

  @ManyToOne(() => User, { nullable: true })
  claimedByUser?: User;

  @Column({ type: 'timestamptz', nullable: true })
  claimedAt?: Date;

  /** Set when this Contact was merged (archived) into a surviving Contact. */
  @ManyToOne(() => Contact, { nullable: true })
  mergedIntoContact?: Contact;

  @Column({ type: 'timestamptz', nullable: true })
  mergedAt?: Date;

  @ManyToOne(() => User, { nullable: true })
  mergedByUser?: User;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
