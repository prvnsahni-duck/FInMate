import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { CreateExpenseDto, UpdateExpenseDto } from '@finmate/data-models';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ExpensesService } from './expenses.service';

@Controller('expenses')
@UseGuards(JwtAuthGuard)
export class ExpensesController {
  constructor(private readonly expensesService: ExpensesService) {}

  @Post()
  async create(@Body() dto: CreateExpenseDto, @Req() req: any) {
    return this.expensesService.createExpense(req.user.id, dto);
  }

  @Get()
  async findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
    @Query('groupId') groupId?: string,
    @Query('category') category?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Req() req?: any,
  ) {
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 20;

    return this.expensesService.listExpenses(req.user.id, {
      page: pageNum,
      limit: limitNum,
      cursor,
      groupId,
      category,
      startDate,
      endDate,
    });
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @Req() req: any) {
    return this.expensesService.getExpenseById(req.user.id, id);
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateExpenseDto, @Req() req: any) {
    return this.expensesService.updateExpense(req.user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string, @Req() req: any): Promise<void> {
    await this.expensesService.deleteExpense(req.user.id, id);
  }
}
