import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  email!: string;

  @Column({ type: 'varchar', length: 50, unique: true, nullable: true })
  username?: string;

  @Column({ type: 'varchar', length: 20, unique: true, nullable: true })
  phoneNumber?: string;

  @Column({ type: 'varchar', length: 255 })
  passwordHash!: string;

  @Column({ type: 'varchar', length: 120, nullable: true })
  displayName?: string;

  @Column({ type: 'varchar', length: 20, default: 'active' })
  status!: 'active' | 'disabled' | 'invited';

  @Column({ type: 'timestamptz', nullable: true })
  lastLoginAt?: Date;

  @Column({ type: 'varchar', length: 255, nullable: true })
  twoFactorSecret?: string;

  @Column({ type: 'boolean', default: false })
  isTwoFactorEnabled!: boolean;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
