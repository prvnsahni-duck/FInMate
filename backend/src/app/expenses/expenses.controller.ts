import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
  DefaultValuePipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateExpenseDto, UpdateExpenseDto } from './dto';
import { ExpensesAnalyticsService, ExpensesCrudService } from './services';
import { SuccessResponse } from '../common/response.util';

@Controller('expenses')
@UseGuards(JwtAuthGuard)
export class ExpensesController {
  constructor(
    private readonly expensesCrudService: ExpensesCrudService,
    private readonly expensesAnalyticsService: ExpensesAnalyticsService,
  ) {}

  // ─── CRUD ─────────────────────────────────────────────────────────────────

  @Post()
  async create(
    @Body() dto: CreateExpenseDto,
    @Req() req: Request & { user: { id: string } },
  ) {
    const result = await this.expensesCrudService.createExpense(
      req.user.id,
      dto,
    );
    return new SuccessResponse('Expense created successfully', result);
  }

  @Get()
  async findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
    @Query('groupId') groupId?: string,
    @Query('category') category?: string,
    @Query('status') status?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Req() req?: Request & { user: { id: string } },
  ) {
    let pageNum = page ? parseInt(page, 10) : 1;
    let limitNum = limit ? parseInt(limit, 10) : 20;
    if (isNaN(pageNum) || pageNum <= 0) pageNum = 1;
    if (isNaN(limitNum) || limitNum <= 0) limitNum = 20;

    const result = await this.expensesCrudService.listExpenses(req!.user.id, {
      page: pageNum,
      limit: limitNum,
      cursor,
      groupId,
      category,
      status,
      startDate,
      endDate,
    });
    return new SuccessResponse('Expenses retrieved successfully', result);
  }

  @Get(':id')
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request & { user: { id: string } },
  ) {
    const result = await this.expensesCrudService.getExpenseById(
      req.user.id,
      id,
    );
    return new SuccessResponse('Expense retrieved successfully', result);
  }

  @Patch(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateExpenseDto,
    @Req() req: Request & { user: { id: string } },
  ) {
    const result = await this.expensesCrudService.updateExpense(
      req.user.id,
      id,
      dto,
    );
    return new SuccessResponse('Expense updated successfully', result);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request & { user: { id: string } },
  ) {
    await this.expensesCrudService.deleteExpense(req.user.id, id);
    return new SuccessResponse('Expense deleted successfully', {});
  }

  // ─── Restore ──────────────────────────────────────────────────────────────

  /** Restore a soft-deleted expense within the allowed restore window. */
  @Post(':id/restore')
  async restore(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request & { user: { id: string } },
  ) {
    const result = await this.expensesCrudService.restoreExpense(
      req.user.id,
      id,
    );
    return new SuccessResponse('Expense restored successfully', result);
  }

  // ─── Analytics ────────────────────────────────────────────────────────────

  /** Monthly expense totals for a given year. */
  @Get('analytics/monthly')
  async monthlySummary(
    @Query('year', new DefaultValuePipe(new Date().getFullYear()), ParseIntPipe)
    year: number,
    @Query('groupId') groupId: string | undefined,
    @Req() req: Request & { user: { id: string } },
  ) {
    const result = await this.expensesAnalyticsService.getMonthlySummary({
      userId: req.user.id,
      groupId,
      year,
    });
    return new SuccessResponse(
      'Monthly analytics summary retrieved successfully',
      result,
    );
  }

  /** Yearly expense totals across all years. */
  @Get('analytics/yearly')
  async yearlySummary(
    @Query('groupId') groupId: string | undefined,
    @Req() req: Request & { user: { id: string } },
  ) {
    const result = await this.expensesAnalyticsService.getYearlySummary({
      userId: req.user.id,
      groupId,
    });
    return new SuccessResponse(
      'Yearly analytics summary retrieved successfully',
      result,
    );
  }

  /** Category distribution totals, optionally filtered by date range. */
  @Get('analytics/categories')
  async categoryDistribution(
    @Query('groupId') groupId: string | undefined,
    @Query('startDate') startDate: string | undefined,
    @Query('endDate') endDate: string | undefined,
    @Req() req: Request & { user: { id: string } },
  ) {
    const result = await this.expensesAnalyticsService.getCategoryDistribution({
      userId: req.user.id,
      groupId,
      startDate,
      endDate,
    });
    return new SuccessResponse(
      'Category distribution analytics retrieved successfully',
      result,
    );
  }

  /** Combined category-level aggregated monthly expenditures (personal + group splits). */
  @Get('analytics/all-monthly')
  async allMonthlySummary(
    @Query('month') month: string | undefined,
    @Req() req: Request & { user: { id: string } },
  ) {
    const targetMonth = month ?? new Date().toISOString().slice(0, 7);
    const result =
      await this.expensesAnalyticsService.getCombinedMonthlyAnalytics(
        req.user.id,
        targetMonth,
      );
    return new SuccessResponse(
      'All monthly summary analytics retrieved successfully',
      result,
    );
  }
}
