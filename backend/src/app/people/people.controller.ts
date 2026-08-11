import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  CreateDirectSettlementDto,
  CreateDirectTransactionDto,
  UpdateDirectTransactionDto,
} from '@finmate/data-models';
import { PersonLedgerService } from './person-ledger.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SuccessResponse } from '../common/response.util';

@Controller('people')
@UseGuards(JwtAuthGuard)
export class PeopleController {
  constructor(private readonly personLedgerService: PersonLedgerService) {}

  @Get()
  async getOverview(
    @Query('limit') limit: string | undefined,
    @Req() req: any,
  ) {
    const parsed = limit ? parseInt(limit, 10) : undefined;
    const result = await this.personLedgerService.getOverview(
      req.user.id,
      Number.isFinite(parsed) && (parsed as number) > 0 ? parsed : undefined,
    );
    return new SuccessResponse(
      'People balances calculated successfully',
      result,
    );
  }

  @Get(':userId')
  async getPersonDetail(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Req() req: any,
  ) {
    const result = await this.personLedgerService.getPersonDetail(
      req.user.id,
      userId,
    );
    return new SuccessResponse(
      'Person relationship retrieved successfully',
      result,
    );
  }

  @Post(':userId/transactions')
  async createTransaction(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: CreateDirectTransactionDto,
    @Req() req: any,
  ) {
    const result = await this.personLedgerService.createDirectTransaction(
      req.user.id,
      userId,
      dto,
    );
    return new SuccessResponse(
      'Direct transaction recorded successfully',
      result,
    );
  }

  @Post(':userId/settlements')
  async createSettlement(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: CreateDirectSettlementDto,
    @Req() req: any,
  ) {
    const result = await this.personLedgerService.createDirectSettlement(
      req.user.id,
      userId,
      dto,
    );
    return new SuccessResponse('Settlement recorded successfully', result);
  }

  @Patch('transactions/:id')
  async updateTransaction(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDirectTransactionDto,
    @Req() req: any,
  ) {
    const result = await this.personLedgerService.updateDirectTransaction(
      req.user.id,
      id,
      dto,
    );
    return new SuccessResponse(
      'Direct transaction updated successfully',
      result,
    );
  }

  @Delete('transactions/:id')
  async deleteTransaction(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: any,
  ) {
    await this.personLedgerService.deleteDirectTransaction(req.user.id, id);
    return new SuccessResponse('Direct transaction deleted successfully', null);
  }
}
