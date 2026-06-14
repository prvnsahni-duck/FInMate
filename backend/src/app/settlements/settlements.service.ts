import { Injectable, NotFoundException, ForbiddenException, BadRequestException, PreconditionFailedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Group, GroupMember, Expense, ExpenseSplit, Settlement, ProposeSettlementDto, UpdateSettlementDto } from '@finmate/data-models';
import { paginate, PaginatedResponse } from '../common/pagination.util';

export interface MemberBalance {
  userId: string;
  balance: number;
}

export interface SimplifiedTransaction {
  fromUserId: string;
  toUserId: string;
  amount: number;
  currency: string;
}

@Injectable()
export class SettlementsService {
  constructor(
    @InjectRepository(Group)
    private readonly groupRepository: Repository<Group>,
    @InjectRepository(GroupMember)
    private readonly groupMemberRepository: Repository<GroupMember>,
    @InjectRepository(Expense)
    private readonly expenseRepository: Repository<Expense>,
    @InjectRepository(ExpenseSplit)
    private readonly expenseSplitRepository: Repository<ExpenseSplit>,
    @InjectRepository(Settlement)
    private readonly settlementRepository: Repository<Settlement>,
  ) {}

  simplifyDebts(balances: MemberBalance[], currency: string): SimplifiedTransaction[] {
    // 1. Filter out users with zero balances (within a 0.01 tolerance)
    let activeBalances = balances
      .map((b) => ({
        userId: b.userId,
        balance: Number(b.balance),
      }))
      .filter((b) => Math.abs(b.balance) >= 0.01);

    const transactions: SimplifiedTransaction[] = [];

    while (true) {
      // 2. Separate and sort debtors and creditors
      const debtors = activeBalances
        .filter((b) => b.balance < 0)
        .sort((a, b) => {
          if (Math.abs(a.balance - b.balance) < 0.0001) {
            return a.userId.localeCompare(b.userId); // Tie-break lexicographically
          }
          return a.balance - b.balance; // Most negative first (descending balance magnitude)
        });

      const creditors = activeBalances
        .filter((b) => b.balance > 0)
        .sort((a, b) => {
          if (Math.abs(a.balance - b.balance) < 0.0001) {
            return a.userId.localeCompare(b.userId); // Tie-break lexicographically
          }
          return b.balance - a.balance; // Largest positive first
        });

      // If either list is empty, we are done
      if (debtors.length === 0 || creditors.length === 0) {
        break;
      }

      const debtor = debtors[0];
      const creditor = creditors[0];

      // Calculate transfer amount
      const debitAmount = Math.abs(debtor.balance);
      const creditAmount = creditor.balance;
      const transferAmount = Math.min(debitAmount, creditAmount);

      // Round to 2 decimal places (standard financial rounding)
      const roundedTransfer = Math.round(transferAmount * 100) / 100;

      if (roundedTransfer > 0) {
        transactions.push({
          fromUserId: debtor.userId,
          toUserId: creditor.userId,
          amount: roundedTransfer,
          currency: currency,
        });
      }

      // Update balances
      debtor.balance += transferAmount;
      creditor.balance -= transferAmount;

      // Refresh active balances list by filtering out settled users
      activeBalances = activeBalances
        .map((b) => {
          if (b.userId === debtor.userId) return { ...b, balance: debtor.balance };
          if (b.userId === creditor.userId) return { ...b, balance: creditor.balance };
          return b;
        })
        .filter((b) => Math.abs(b.balance) >= 0.01);
    }

    return transactions;
  }

  async calculateGroupBalances(userId: string, groupId: string) {
    // 1. Verify access: caller must have active membership
    const callerMember = await this.groupMemberRepository
      .createQueryBuilder('member')
      .where('member.group_id = :groupId', { groupId })
      .andWhere('member.user_id = :userId', { userId })
      .andWhere('member.joinStatus = :status', { status: 'active' })
      .getOne();
    if (!callerMember) {
      throw new ForbiddenException('You do not have access to this group');
    }

    // Verify group exists
    const groupExists = await this.groupRepository.findOne({ where: { id: groupId } });
    if (!groupExists) {
      throw new NotFoundException('Group not found');
    }

    // 2. Fetch active and invited group members
    const allMembers = await this.groupMemberRepository.find({
      where: { group: { id: groupId }, joinStatus: In(['active', 'invited']) },
      relations: ['user'],
    });

    // 3. Fetch all posted expenses in this group
    const expenses = await this.expenseRepository.find({
      where: { group: { id: groupId }, status: 'posted' },
      relations: ['paidByUser'],
    });

    // 4. Fetch expense splits for those expenses
    const expenseIds = expenses.map((e) => e.id);
    const splits =
      expenseIds.length > 0
        ? await this.expenseSplitRepository.find({
            where: { expense: { id: In(expenseIds) } },
            relations: ['expense', 'participantUser', 'participantGroupMember', 'participantGroupMember.user'],
          })
        : [];

    // 5. Fetch confirmed settlements
    const settlements = await this.settlementRepository.find({
      where: { group: { id: groupId }, status: 'confirmed' },
      relations: ['fromUser', 'toUser'],
    });

    // 6. Build list of all unique currencies and users
    const currencies = new Set<string>();
    expenses.forEach((e) => currencies.add(e.currency));
    settlements.forEach((s) => currencies.add(s.currency));

    // Mapping of userId -> User Entity / displayName to format response
    const userMap = new Map<string, { id: string; displayName?: string; email: string }>();
    allMembers.forEach((m) => userMap.set(m.user.id, m.user));
    expenses.forEach((e) => userMap.set(e.paidByUser.id, e.paidByUser));
    splits.forEach((s) => {
      const u = s.participantUser || s.participantGroupMember?.user;
      if (u) userMap.set(u.id, u);
    });
    settlements.forEach((s) => {
      userMap.set(s.fromUser.id, s.fromUser);
      userMap.set(s.toUser.id, s.toUser);
    });

    const finalBalances: any[] = [];
    const finalSuggestedSettlements: SimplifiedTransaction[] = [];

    // 7. Calculate balances per currency
    for (const currency of currencies) {
      // Map of userId -> balance
      const balanceMap = new Map<string, number>();

      // Initialize all members to 0 for this currency
      allMembers.forEach((m) => balanceMap.set(m.user.id, 0));

      // Add paid expenses
      for (const expense of expenses) {
        if (expense.currency !== currency) continue;
        const payerId = expense.paidByUser.id;
        balanceMap.set(payerId, (balanceMap.get(payerId) || 0) + Number(expense.amountTotal));
      }

      // Subtract split owes
      for (const split of splits) {
        if (split.expense.currency !== currency) continue;
        const participantId = split.participantUser?.id || split.participantGroupMember?.user?.id;
        if (!participantId) continue;
        balanceMap.set(participantId, (balanceMap.get(participantId) || 0) - Number(split.amountOwed));
      }

      // Add settlements
      for (const settlement of settlements) {
        if (settlement.currency !== currency) continue;
        const fromId = settlement.fromUser.id;
        const toId = settlement.toUser.id;
        balanceMap.set(fromId, (balanceMap.get(fromId) || 0) + Number(settlement.amount));
        balanceMap.set(toId, (balanceMap.get(toId) || 0) - Number(settlement.amount));
      }

      // Convert to MemberBalance array
      const memberBalances: MemberBalance[] = [];
      for (const [userId, balance] of balanceMap.entries()) {
        memberBalances.push({ userId, balance });
      }

      // Add to final balances list (formatting each user entry)
      for (const mb of memberBalances) {
        const u = userMap.get(mb.userId);
        if (u) {
          finalBalances.push({
            userId: mb.userId,
            displayName: u.displayName || u.email,
            netBalance: Math.round(mb.balance * 100) / 100,
            currency,
          });
        }
      }

      // Run simplifyDebts for this currency
      const simplified = this.simplifyDebts(memberBalances, currency);
      finalSuggestedSettlements.push(...simplified);
    }

    return {
      balances: finalBalances,
      suggestedSettlements: finalSuggestedSettlements,
    };
  }

  async proposeSettlement(userId: string, groupId: string, dto: ProposeSettlementDto): Promise<Settlement> {
    // 1. Validate caller active membership in group
    const callerMember = await this.groupMemberRepository.findOne({
      where: { group: { id: groupId }, user: { id: userId }, joinStatus: 'active' },
      relations: ['user'],
    });
    if (!callerMember) {
      throw new ForbiddenException('You do not have access to this group');
    }

    const group = await this.groupRepository.findOne({ where: { id: groupId } });
    if (!group) {
      throw new NotFoundException('Group not found');
    }

    // 2. Validate recipient active/invited membership in group
    const recipientMember = await this.groupMemberRepository.findOne({
      where: { group: { id: groupId }, user: { id: dto.toUserId }, joinStatus: In(['active', 'invited']) },
      relations: ['user'],
    });
    if (!recipientMember) {
      throw new BadRequestException('Recipient is not a member of this group');
    }

    // Proposer is the fromUser (caller)
    const settlement = this.settlementRepository.create({
      group,
      fromUser: callerMember.user,
      toUser: recipientMember.user,
      amount: dto.amount,
      currency: dto.currency,
      status: 'proposed',
      note: dto.note,
    });

    return this.settlementRepository.save(settlement);
  }

  async listSettlements(
    userId: string,
    groupId: string,
    page: number,
    limit: number,
  ): Promise<PaginatedResponse<Settlement>> {
    // Validate caller active membership
    const callerMember = await this.groupMemberRepository.findOne({
      where: { group: { id: groupId }, user: { id: userId }, joinStatus: 'active' },
    });
    if (!callerMember) {
      throw new ForbiddenException('You do not have access to this group');
    }

    const query = this.settlementRepository
      .createQueryBuilder('settlement')
      .leftJoinAndSelect('settlement.fromUser', 'fromUser')
      .leftJoinAndSelect('settlement.toUser', 'toUser')
      .where('settlement.group_id = :groupId', { groupId })
      .orderBy('settlement.createdAt', 'DESC');

    const total = await query.getCount();
    const settlements = await query
      .skip((page - 1) * limit)
      .take(limit)
      .getMany();

    return paginate(settlements, total, page, limit, `/api/v1/groups/${groupId}/settlements`);
  }

  async updateSettlement(
    userId: string,
    groupId: string,
    id: string,
    dto: UpdateSettlementDto,
  ): Promise<Settlement> {
    // Validate caller active membership
    const callerMember = await this.groupMemberRepository.findOne({
      where: { group: { id: groupId }, user: { id: userId }, joinStatus: 'active' },
    });
    if (!callerMember) {
      throw new ForbiddenException('You do not have access to this group');
    }

    const settlement = await this.settlementRepository.findOne({
      where: { id, group: { id: groupId } },
      relations: ['fromUser', 'toUser'],
    });
    if (!settlement) {
      throw new NotFoundException('Settlement not found');
    }

    // Concurrency control: verify version matches
    if (settlement.version !== dto.version) {
      throw new PreconditionFailedException({
        errorCode: 'CON_VERSION_CONFLICT',
        message: 'Version conflict: the resource has been modified by another request',
      });
    }

    if (dto.status === 'confirmed') {
      // ONLY the creditor (toUser) can confirm receipt
      if (settlement.toUser.id !== userId) {
        throw new ForbiddenException({
          errorCode: 'RES_FORBIDDEN',
          message: 'Only the creditor can confirm receipt of the settlement',
        });
      }
      settlement.status = 'confirmed';
      settlement.settledOn = dto.settledOn || new Date().toISOString().split('T')[0];
    } else if (dto.status === 'cancelled') {
      // Either debtor (fromUser) or creditor (toUser) can cancel
      if (settlement.fromUser.id !== userId && settlement.toUser.id !== userId) {
        throw new ForbiddenException({
          errorCode: 'RES_FORBIDDEN',
          message: 'Only the debtor or creditor can cancel the settlement',
        });
      }
      settlement.status = 'cancelled';
    }

    return this.settlementRepository.save(settlement);
  }
}
