import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  VersionColumn,
} from 'typeorm';
import { User } from './user.entity';
import { Group } from './group.entity';
import { GroupKeyVersion } from './group-key-version.entity';

@Entity('notes')
export class Note {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => User, { nullable: false })
  authorUser!: User;

  @ManyToOne(() => Group, { nullable: true })
  group?: Group;

  @ManyToOne(() => GroupKeyVersion, { nullable: true, onDelete: 'SET NULL' })
  groupKeyVersion?: GroupKeyVersion;

  @Column({ type: 'text' })
  title!: string;

  @Column({ type: 'text' })
  body!: string;

  @Column({ type: 'varchar', length: 20 })
  visibility!: 'private' | 'group';

  @VersionColumn()
  version!: number;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
