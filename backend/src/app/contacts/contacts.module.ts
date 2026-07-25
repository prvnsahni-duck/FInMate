import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  AuditLog,
  Contact,
  GroupMember,
  GroupInvite,
  User,
} from '@finmate/data-models';
import { ContactsService } from './contacts.service';
import { ContactsController } from './contacts.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Contact,
      GroupMember,
      GroupInvite,
      User,
      AuditLog,
    ]),
  ],
  controllers: [ContactsController],
  providers: [ContactsService],
  exports: [ContactsService],
})
export class ContactsModule {}
