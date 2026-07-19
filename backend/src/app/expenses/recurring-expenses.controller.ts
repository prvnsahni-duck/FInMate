import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
  Headers,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  CreateRecurringExpenseDto,
  UpdateRecurringExpenseDto,
} from '@finmate/data-models';
import { RecurringExpensesService } from './services/recurring-expenses.service';
import { RecurringExpensesScheduler } from './services/recurring-expenses.scheduler';
import { SuccessResponse } from '../common/response.util';

@Controller('recurring-expenses')
@UseGuards(JwtAuthGuard)
export class RecurringExpensesController {
  constructor(
    private readonly recurringExpensesService: RecurringExpensesService,
    private readonly recurringExpensesScheduler: RecurringExpensesScheduler,
  ) {}

  @Post()
  async create(
    @Body() dto: CreateRecurringExpenseDto,
    @Req() req: Request & { user: { id: string } },
  ) {
    const result = await this.recurringExpensesService.createRecurringExpense(
      req.user.id,
      dto,
    );
    return new SuccessResponse(
      'Recurring expense created successfully',
      result,
    );
  }

  @Get()
  async findAll(
    @Query('groupId') groupId: string | undefined,
    @Req() req: Request & { user: { id: string } },
  ) {
    const result = await this.recurringExpensesService.listRecurringExpenses(
      req.user.id,
      groupId,
    );
    return new SuccessResponse(
      'Recurring expenses retrieved successfully',
      result,
    );
  }

  @Get(':id')
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request & { user: { id: string } },
  ) {
    const result = await this.recurringExpensesService.getRecurringExpenseById(
      req.user.id,
      id,
    );
    return new SuccessResponse(
      'Recurring expense retrieved successfully',
      result,
    );
  }

  @Patch(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRecurringExpenseDto,
    @Req() req: Request & { user: { id: string } },
  ) {
    const result = await this.recurringExpensesService.updateRecurringExpense(
      req.user.id,
      id,
      dto,
    );
    return new SuccessResponse(
      'Recurring expense updated successfully',
      result,
    );
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request & { user: { id: string } },
  ) {
    await this.recurringExpensesService.deleteRecurringExpense(req.user.id, id);
    return new SuccessResponse('Recurring expense deleted successfully', {});
  }

  @Post('trigger')
  @HttpCode(HttpStatus.OK)
  async triggerScheduler(@Headers('x-cron-secret') cronSecret?: string) {
    const expectedSecret = process.env.CRON_SECRET;
    if (expectedSecret && cronSecret !== expectedSecret) {
      throw new UnauthorizedException('Invalid cron secret');
    }
    if (
      !expectedSecret &&
      (process.env.NODE_ENV === 'production' ||
        process.env.APP_ENV === 'production')
    ) {
      throw new UnauthorizedException(
        'Manual triggers are disabled in production without CRON_SECRET configured',
      );
    }
    await this.recurringExpensesScheduler.processDueExpenses();
    return new SuccessResponse('Scheduler triggered successfully', {});
  }
}
