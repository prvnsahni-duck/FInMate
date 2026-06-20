import { Expense } from './expense.entity';
import { Group } from './group.entity';
import { GroupMember } from './group-member.entity';
import { Profile } from './profile.entity';
import { User } from './user.entity';

export type PublicUser = Pick<
  User,
  | 'id'
  | 'email'
  | 'username'
  | 'phoneNumber'
  | 'displayName'
  | 'status'
  | 'lastLoginAt'
  | 'createdAt'
  | 'updatedAt'
>;

export interface JwtPayload {
  userId: string;
  email?: string;
  refreshId?: string;
  iat?: number;
  exp?: number;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: PublicUser;
}

export interface RefreshTokenResponse {
  accessToken: string;
  refreshToken: string;
}

export interface CurrentUserResponse {
  user: PublicUser;
  profile: Profile;
}

export type RegisterResponse = PublicUser;

export interface PaginationMeta {
  totalItems: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta?: PaginationMeta;
}

export interface ErrorResponse {
  statusCode: number;
  errorCode?: string;
  message: string;
  details?: unknown;
  retryable?: boolean;
  timestamp?: string;
  path?: string;
}

export type GetExpensesResponse = PaginatedResponse<Expense>;

export interface ExpenseAnalyticsPoint {
  month: string;
  category: string;
  total: number;
  currency: string;
}

export type MonthlyAnalyticsPoint = Omit<ExpenseAnalyticsPoint, 'category'>;

export type CategoryAnalyticsPoint = Omit<ExpenseAnalyticsPoint, 'month'>;

export interface BalanceEntry {
  userId: string;
  currency: string;
  netBalance: number;
}

export interface SuggestedSettlementResponse {
  fromUserId: string;
  toUserId: string;
  amount: number;
  currency: string;
}

export interface GroupBalancesResponse {
  balances: BalanceEntry[];
  suggestedSettlements: SuggestedSettlementResponse[];
}

export interface GroupAuditLogEntry {
  id: string;
  action: string;
  actorDisplayName?: string;
  metadata?: {
    title?: string;
    newTitle?: string;
    amountTotal?: number;
    currency?: string;
  };
  createdAt: string | Date;
}

export type GroupAuditLogResponse = PaginatedResponse<GroupAuditLogEntry>;

export interface InviteDetailsResponse {
  id: string;
  name: string;
  description?: string;
  ownerName: string;
  groupType: Group['groupType'];
  currency: string;
  members?: Array<{
    email?: string;
    phoneNumber?: string;
    displayName?: string;
    role: GroupMember['role'];
  }>;
}

export interface PendingInvitationResponse extends InviteDetailsResponse {
  membershipId: string;
}

export interface CarryForwardBalance {
  userId: string;
  displayName: string | null;
  paid: number;
  expected: number;
  netBalance: number;
  percentage: number;
  currency: string;
}

export interface GroupContributionResponse {
  memberId: string;
  userId?: string;
  displayName?: string;
  role?: GroupMember['role'];
  percentage: number;
  amount?: number;
}

export interface FriendCurrencyDetail {
  groupId: string;
  groupName: string;
  amount: number;
  currency: string;
}

export interface FriendBalanceResponse {
  friendId: string;
  displayName: string;
  email: string;
  netBalance: number;
  currencyDetails: FriendCurrencyDetail[];
  isExpanded?: boolean;
}

export interface UpdateContributionsPayload {
  ledgerMonth: string;
  contributions: Array<{
    memberId: string;
    percentage: number;
  }>;
}

export interface UserSearchResult {
  id: string;
  email: string;
  username?: string;
  phoneNumber?: string;
  displayName?: string;
}
