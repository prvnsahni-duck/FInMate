import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, LessThanOrEqual, Repository } from 'typeorm';
import {
  RecurringExpense,
  RecurringExpenseSplit,
  Expense,
  ExpenseSplit,
} from '@finmate/data-models';
import { RedisService } from '../../redis/redis.service';

@Injectable()
export class RecurringExpensesScheduler {
  private readonly logger = new Logger(RecurringExpensesScheduler.name);

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    @InjectRepository(RecurringExpense)
    private readonly recurringExpenseRepository: Repository<RecurringExpense>,
    @InjectRepository(RecurringExpenseSplit)
    private readonly recurringExpenseSplitRepository: Repository<RecurringExpenseSplit>,
    private readonly redisService: RedisService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleRecurringExpensesCron() {
    const lockKey = 'lock:recurring_expenses_cron';
    const acquired = await this.redisService.setNx(lockKey, 'locked', 3600);
    if (!acquired) {
      this.logger.log(
        'Another instance is already processing recurring expenses. Skipping.',
      );
      return;
    }
    this.logger.log(
      'Acquired scheduler lock. Starting recurring expenses processing...',
    );
    try {
      await this.processDueExpenses();
    } finally {
      this.logger.log('Recurring expenses cron job complete.');
    }
  }

  async processDueExpenses() {
    const todayStr = new Date().toISOString().slice(0, 10);

    const dueTemplates = await this.recurringExpenseRepository.find({
      where: {
        status: 'active',
        nextOccurrenceDate: LessThanOrEqual(todayStr),
      },
      relations: ['paidByUser', 'ownerUser', 'group'],
    });

    this.logger.log(
      `Found ${dueTemplates.length} due recurring expenses to process.`,
    );

    for (const template of dueTemplates) {
      try {
        await this.processSingleTemplate(template, todayStr);
      } catch (err) {
        this.logger.error(
          `Error processing recurring expense ${template.id}:`,
          err,
        );
      }
    }
  }

  private async processSingleTemplate(
    template: RecurringExpense,
    todayStr: string,
  ) {
    // Process all occurrences up to today (handles missed runs)
    let currentOccurrenceDate = template.nextOccurrenceDate;

    while (currentOccurrenceDate <= todayStr && template.status === 'active') {
      const occurrenceDateStr = currentOccurrenceDate;
      const nextDate = this.advanceDate(occurrenceDateStr, template.frequency);

      await this.dataSource.transaction(async (manager) => {
        // 1. Create standard Expense
        const expense = manager.getRepository(Expense).create({
          title: template.title,
          description: template.description,
          amountTotal: template.amountTotal,
          currency: template.currency,
          category: template.category,
          paidByUser: template.paidByUser,
          ownerUser: template.ownerUser,
          group: template.group,
          expenseDate: occurrenceDateStr,
          status: 'posted',
          ledgerMonth:
            template.group?.groupType === 'household'
              ? occurrenceDateStr.slice(0, 7)
              : undefined,
          isCarryForward: false,
        });
        const savedExpense = await manager.getRepository(Expense).save(expense);

        // 2. Load template splits
        const templateSplits = await manager
          .getRepository(RecurringExpenseSplit)
          .find({
            where: { recurringExpense: { id: template.id } },
            relations: ['participantUser', 'participantGroupMember'],
          });

        // 3. Create expense splits
        for (const tSplit of templateSplits) {
          const split = manager.getRepository(ExpenseSplit).create({
            expense: savedExpense,
            participantUser: tSplit.participantUser,
            participantGroupMember: tSplit.participantGroupMember,
            splitType: tSplit.splitType,
            shareValue: tSplit.shareValue,
            amountOwed: tSplit.amountOwed,
            isSettled: false,
          });
          await manager.getRepository(ExpenseSplit).save(split);
        }

        // 4. Update nextOccurrenceDate and status
        template.nextOccurrenceDate = nextDate;
        if (template.endDate && nextDate > template.endDate) {
          template.status = 'completed';
        }
        await manager.getRepository(RecurringExpense).save(template);
      });

      this.logger.log(
        `Created expense for template ${template.id} on date ${occurrenceDateStr}. Next occurrence is ${nextDate}`,
      );
      currentOccurrenceDate = nextDate;
    }
  }

  private advanceDate(
    dateStr: string,
    frequency: 'daily' | 'weekly' | 'monthly' | 'yearly',
  ): string {
    const d = new Date(dateStr);
    if (frequency === 'daily') {
      d.setDate(d.getDate() + 1);
    } else if (frequency === 'weekly') {
      d.setDate(d.getDate() + 7);
    } else if (frequency === 'monthly') {
      d.setMonth(d.getMonth() + 1);
    } else if (frequency === 'yearly') {
      d.setFullYear(d.getFullYear() + 1);
    }
    return d.toISOString().slice(0, 10);
  }
}
