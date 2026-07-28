import { TestBed } from '@angular/core/testing';
import {
  GroupHistoryLogComponent,
  GroupAuditLog,
} from './group-history-log.component';

describe('GroupHistoryLogComponent getLogMessage', () => {
  let component: GroupHistoryLogComponent;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [GroupHistoryLogComponent] });
    const fixture = TestBed.createComponent(GroupHistoryLogComponent);
    fixture.componentRef.setInput('historyLogs', []);
    component = fixture.componentInstance;
  });

  const msg = (action: string, metadata?: GroupAuditLog['metadata']): string =>
    component.getLogMessage({
      id: '1',
      action,
      metadata,
      createdAt: '',
    });

  it('maps known group/settlement actions to friendly text', () => {
    expect(msg('group.keys_provisioned')).toBe('set up group encryption');
    expect(msg('group.created')).toBe('created the group');
    expect(msg('group.updated')).toBe('updated the group settings');
    expect(msg('settlement.confirmed')).toBe('confirmed a settlement');
  });

  it('interpolates expense actions with title and amount', () => {
    expect(
      msg('expense.created', {
        title: 'Lunch',
        amountTotal: 10,
        currency: 'USD',
      }),
    ).toBe('created expense "Lunch" (10 USD)');
  });

  it('humanizes unmapped codes instead of showing the raw identifier', () => {
    expect(msg('group.some_future_action')).toBe(
      'performed "some future action"',
    );
  });
});
