import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  Check,
} from 'typeorm';
import { User } from './user.entity';
import { Expense } from './expense.entity';
import { Note } from './note.entity';
import { Goal } from './goal.entity';
import { Group } from './group.entity';
import { GroupKeyVersion } from './group-key-version.entity';

@Entity('attachments')
@Check(
  '"expenseId" IS NOT NULL OR "noteId" IS NOT NULL OR "goalId" IS NOT NULL OR "groupId" IS NOT NULL',
)
export class Attachment {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => User, { nullable: false })
  uploaderUser!: User;

  @ManyToOne(() => Expense, { nullable: true })
  expense?: Expense;

  @ManyToOne(() => Note, { nullable: true })
  note?: Note;

  @ManyToOne(() => Goal, { nullable: true })
  goal?: Goal;

  @ManyToOne(() => Group, { nullable: true })
  group?: Group;

  @ManyToOne(() => GroupKeyVersion, { nullable: true, onDelete: 'SET NULL' })
  groupKeyVersion?: GroupKeyVersion;

  @Column({ type: 'text' })
  storageKey!: string;

  @Column({ type: 'varchar', length: 255 })
  originalName!: string;

  @Column({ type: 'varchar', length: 128 })
  mimeType!: string;

  @Column({ type: 'bigint' })
  sizeBytes!: string;

  @Column({ type: 'char', length: 64, nullable: true })
  checksumSha256?: string;

  /**
   * The per-attachment file key, wrapped (encrypted) with the scope key
   * (personal master key / groupDataKey / expense contentKey).
   * Format: `iv_base64:ciphertext_base64`.
   */
  @Column({ type: 'text', nullable: true })
  encryptedFileKey?: string;

  /**
   * The original filename, encrypted client-side with the file key.
   * Format: `iv_base64:ciphertext_base64`.
   */
  @Column({ type: 'text', nullable: true })
  encryptedOriginalName?: string;

  @CreateDateColumn()
  createdAt!: Date;
}
