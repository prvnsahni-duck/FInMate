import { Injectable } from '@nestjs/common';

@Injectable()
export class ExpensesAccessService {
  isWriteRole(role: string): boolean {
    return role !== 'viewer';
  }
}
