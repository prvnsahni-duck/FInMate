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
import { ExpensesService } from './expenses.service';
import { CreateExpenseDto, UpdateExpenseDto } from './dto';

@Controller('expenses')
@UseGuards(JwtAuthGuard)
export class ExpensesController {
  constructor(private readonly expensesService: ExpensesService) {}

  // ─── CRUD ─────────────────────────────────────────────────────────────────

  @Post()
  async create(@Body() dto: CreateExpenseDto, @Req() req: Request & { user: { id: string } }) {
    return this.expensesService.createExpense(req.user.id, dto);
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
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 20;

    return this.expensesService.listExpenses(req!.user.id, {
      page: pageNum,
      limit: limitNum,
      cursor,
      groupId,
      category,
      status,
      startDate,
      endDate,
    });
  }

  @Get(':id')
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request & { user: { id: string } },
  ) {
    return this.expensesService.getExpenseById(req.user.id, id);
  }

  @Patch(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateExpenseDto,
    @Req() req: Request & { user: { id: string } },
  ) {
    return this.expensesService.updateExpense(req.user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request & { user: { id: string } },
  ): Promise<void> {
    await this.expensesService.deleteExpense(req.user.id, id);
  }

  // ─── Restore ──────────────────────────────────────────────────────────────

  /** Restore a soft-deleted expense within the allowed restore window. */
  @Post(':id/restore')
  async restore(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request & { user: { id: string } },
  ) {
    return this.expensesService.restoreExpense(req.user.id, id);
  }

  // ─── Analytics ────────────────────────────────────────────────────────────

  /** Monthly expense totals for a given year. */
  @Get('analytics/monthly')
  async monthlySummary(
    @Query('year', new DefaultValuePipe(new Date().getFullYear()), ParseIntPipe) year: number,
    @Query('groupId') groupId: string | undefined,
    @Req() req: Request & { user: { id: string } },
  ) {
    return this.expensesService.getMonthlySummary({ userId: req.user.id, groupId, year });
  }

  /** Yearly expense totals across all years. */
  @Get('analytics/yearly')
  async yearlySummary(
    @Query('groupId') groupId: string | undefined,
    @Req() req: Request & { user: { id: string } },
  ) {
    return this.expensesService.getYearlySummary({ userId: req.user.id, groupId });
  }

  /** Category distribution totals, optionally filtered by date range. */
  @Get('analytics/categories')
  async categoryDistribution(
    @Query('groupId') groupId: string | undefined,
    @Query('startDate') startDate: string | undefined,
    @Query('endDate') endDate: string | undefined,
    @Req() req: Request & { user: { id: string } },
  ) {
    return this.expensesService.getCategoryDistribution({ userId: req.user.id, groupId, startDate, endDate });
  }
}
