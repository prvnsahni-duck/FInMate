import {
  Controller,
  Post,
  UseInterceptors,
  UploadedFile,
  Body,
  Req,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ImportService } from './import.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Request } from 'express';
import { SuccessResponse } from '../common/response.util';
import { Throttle } from '@nestjs/throttler';

interface RequestWithUser extends Request {
  user: {
    id: string;
  };
}

@Controller('import')
@UseGuards(JwtAuthGuard)
export class ImportController {
  constructor(private readonly importService: ImportService) {}

  @Post('expenses')
  @Throttle({ import: {} })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: 5 * 1024 * 1024, // 5MB limit
      },
    }),
  )
  async importExpenses(
    @UploadedFile() file: Express.Multer.File,
    @Body('groupId') groupId: string,
    @Req() req: RequestWithUser,
  ) {
    if (!groupId) {
      throw new BadRequestException({
        errorCode: 'VAL_MISSING_FIELD',
        message: 'groupId is required',
      });
    }

    if (!file) {
      throw new BadRequestException({
        errorCode: 'VAL_MISSING_FIELD',
        message: 'file is required',
      });
    }

    const context = {
      ip:
        req.ip ||
        (req.headers['x-forwarded-for'] as string) ||
        req.socket.remoteAddress,
      userAgent: req.headers['user-agent'] as string,
    };
    const result = await this.importService.importExpenses(
      req.user.id,
      groupId,
      file,
      context,
    );
    return new SuccessResponse('Expenses imported successfully', result);
  }
}
