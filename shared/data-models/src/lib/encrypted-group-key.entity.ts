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

/**
 * Stores a per-member wrapped copy of the group's symmetric data key.
 *
 * The `wrappedKey` is the AES-256-GCM `groupDataKey` encrypted (wrapped)
 * with the member's personal PBKDF2-derived master key. Only the member
 * can unwrap it client-side; the server never sees the plaintext key.
 */
@Entity('encrypted_group_keys')
@Unique(['group', 'user'])
export class EncryptedGroupKey {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Group, { nullable: false })
  group!: Group;

  @ManyToOne(() => User, { nullable: false })
  user!: User;

  /** Base64-encoded wrapped key in `iv_base64:ciphertext_base64` format. */
  @Column({ type: 'text' })
  wrappedKey!: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
