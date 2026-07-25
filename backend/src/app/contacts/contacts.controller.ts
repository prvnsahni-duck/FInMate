import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  ParseUUIDPipe,
  DefaultValuePipe,
  ParseIntPipe,
} from '@nestjs/common';
import { ContactsService } from './contacts.service';
import { MergeContactsDto } from './dto/contact.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SuccessResponse } from '../common/response.util';

@Controller('contacts')
@UseGuards(JwtAuthGuard)
export class ContactsController {
  constructor(private readonly contactsService: ContactsService) {}

  @Get()
  async listContacts(@Req() req: any) {
    const result = await this.contactsService.listAddressBook(req.user.id);
    return new SuccessResponse('Contacts retrieved successfully', result);
  }

  @Get(':id/timeline')
  async getTimeline(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Req() req: any,
  ) {
    const result = await this.contactsService.getTimeline(
      req.user.id,
      id,
      page,
      limit,
    );
    return new SuccessResponse(
      'Contact timeline retrieved successfully',
      result,
    );
  }

  @Get('merge-candidates')
  async mergeCandidates(@Query('groupId', ParseUUIDPipe) groupId: string) {
    const result = await this.contactsService.findMergeCandidates(groupId);
    return new SuccessResponse(
      'Merge candidates retrieved successfully',
      result.map((c) => ({
        contactAId: c.contactA.id,
        contactBId: c.contactB.id,
        confidence: c.confidence,
        reason: c.reason,
      })),
    );
  }

  @Post(':id/merge')
  async merge(
    @Param('id', ParseUUIDPipe) losingContactId: string,
    @Body() dto: MergeContactsDto,
    @Req() req: any,
  ) {
    const surviving = await this.contactsService.mergeContacts({
      survivingContactId: dto.survivingContactId,
      losingContactId,
      mergedByUser: req.user,
      confirmed: dto.confirmed,
    });
    return new SuccessResponse('Contacts merged successfully', {
      survivingContactId: surviving.id,
    });
  }
}
