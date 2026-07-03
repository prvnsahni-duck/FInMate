import {
  Controller,
  Get,
  Query,
  Req,
  Res,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { Response, Request } from 'express';
import { ImportService } from './import.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Throttle } from '@nestjs/throttler';

interface RequestWithUser extends Request {
  user: {
    id: string;
  };
}

@Controller('export')
@UseGuards(JwtAuthGuard)
export class ExportController {
  constructor(private readonly importService: ImportService) {}

  @Get('expenses')
  @Throttle({ export: {} })
  async exportExpenses(
    @Query('format') format: 'csv' | 'xlsx' = 'csv',
    @Query('groupId') groupId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Req() req?: RequestWithUser,
    @Res() res?: Response,
  ): Promise<void> {
    if (format !== 'csv' && format !== 'xlsx') {
      throw new BadRequestException('Format must be either csv or xlsx');
    }

    const { buffer, mimeType, filename } =
      await this.importService.exportExpenses(
        req.user.id,
        format,
        groupId,
        startDate,
        endDate,
      );

    res.set({
      'Content-Type': mimeType,
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': buffer.length.toString(),
    });

    res.end(buffer);
  }
}
