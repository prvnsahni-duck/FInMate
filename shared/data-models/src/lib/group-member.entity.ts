import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, Unique } from 'typeorm';
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

  @Column({ type: 'varchar', length: 20 })
  role!: 'owner' | 'admin' | 'member' | 'viewer';

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
