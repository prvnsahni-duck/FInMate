import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, Unique, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { GroupMember } from './group-member.entity';

@Entity('group_member_contributions')
@Unique(['groupMember', 'ledgerMonth'])
export class GroupMemberContribution {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => GroupMember, { nullable: false, onDelete: 'CASCADE' })
  groupMember!: GroupMember;

  @Column({ type: 'char', length: 7 })
  ledgerMonth!: string; // Format: YYYY-MM

  @Column('decimal', { precision: 5, scale: 2 })
  percentage!: number; // Percentage value (e.g. 60.00 for 60%)

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
