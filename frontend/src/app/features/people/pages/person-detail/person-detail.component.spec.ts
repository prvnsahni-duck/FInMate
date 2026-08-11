import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { of, throwError } from 'rxjs';
import { PersonDetailComponent } from './person-detail.component';
import { PeopleService } from '../../services/people.service';
import { PersonDetailResponse } from '@finmate/data-models';

function detail(partial: Partial<PersonDetailResponse> = {}): PersonDetailResponse {
  return {
    counterpartyUserId: 'u2',
    displayName: 'Naveen',
    email: 'n@x.com',
    currency: 'INR',
    netBalance: 720,
    direction: 'owes_you',
    breakdown: [
      { currency: 'INR', groupObligations: 500, directLending: 300, settlements: -80, net: 720 },
    ],
    history: [
      { id: 'expense:e1', source: 'group_expense', amount: 500, currency: 'INR', date: '2026-08-08', groupId: 'g1', groupName: 'Goa Trip', expenseId: 'e1', title: 'Room Rent' },
      { id: 'direct:d1', source: 'direct', entryType: 'lend', amount: 300, currency: 'INR', date: '2026-08-04' },
      { id: 'settlement:s1', source: 'settlement', entryType: 'settlement', amount: -80, currency: 'INR', date: '2026-08-10' },
    ],
    ...partial,
  };
}

describe('PersonDetailComponent', () => {
  let fixture: ComponentFixture<PersonDetailComponent>;
  let peopleService: {
    getPersonDetail: jest.Mock;
    deleteTransaction: jest.Mock;
  };

  async function setup(ret = of(detail())) {
    peopleService = {
      getPersonDetail: jest.fn().mockReturnValue(ret),
      deleteTransaction: jest.fn().mockReturnValue(of(void 0)),
    };
    await TestBed.configureTestingModule({
      imports: [PersonDetailComponent],
      providers: [
        provideRouter([]),
        { provide: PeopleService, useValue: peopleService },
        {
          provide: ActivatedRoute,
          useValue: { paramMap: of(convertToParamMap({ userId: 'u2' })) },
        },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(PersonDetailComponent);
    fixture.detectChanges();
  }

  it('shows the current balance and direction from the backend', async () => {
    await setup();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="detail-net"]')?.textContent).toContain('720');
    expect(el.textContent).toContain('Naveen owes you');
  });

  it('renders the breakdown rows', async () => {
    await setup();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="breakdown-row"]')).toBeTruthy();
    expect(el.textContent).toContain('Group expenses');
    expect(el.textContent).toContain('Direct lending');
    expect(el.textContent).toContain('Settlements');
  });

  it('renders history with the source group reference', async () => {
    await setup();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Room Rent');
    const link = el.querySelector('[data-testid="history-group-link"]') as HTMLAnchorElement;
    expect(link?.getAttribute('href')).toContain('/groups/g1');
  });

  it('offers delete only on direct/settlement lines, not group expenses', async () => {
    await setup();
    const el = fixture.nativeElement as HTMLElement;
    const deletes = el.querySelectorAll('[data-testid="history-delete"]');
    // direct + settlement = 2; the group_expense line has none.
    expect(deletes.length).toBe(2);
  });

  it('hides the Return action and shows settled when net is zero', async () => {
    await setup(of(detail({ netBalance: 0, direction: 'settled', history: [] })));
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="open-return"]')).toBeNull();
    expect(el.querySelector('[data-testid="history-empty"]')).toBeTruthy();
  });

  it('shows an error state on failure', async () => {
    await setup(throwError(() => new Error('boom')));
    expect(fixture.nativeElement.querySelector('[data-testid="detail-retry"]')).toBeTruthy();
  });
});
