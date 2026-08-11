import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Store } from '@ngxs/store';
import { of, throwError } from 'rxjs';
import { PeopleDashboardComponent } from './people-dashboard.component';
import { PeopleService } from '../../services/people.service';
import { PeopleOverviewResponse } from '@finmate/data-models';

function overview(
  partial: Partial<PeopleOverviewResponse> = {},
): PeopleOverviewResponse {
  return {
    currency: 'INR',
    totalYouAreOwed: 720,
    totalYouOwe: 180,
    hasMultipleCurrencies: false,
    people: [
      { counterpartyUserId: 'u2', displayName: 'Naveen', email: 'n@x.com', currency: 'INR', netBalance: 720, direction: 'owes_you' },
      { counterpartyUserId: 'u3', displayName: 'Praveen', email: 'p@x.com', currency: 'INR', netBalance: -180, direction: 'you_owe' },
      { counterpartyUserId: 'u4', displayName: 'Sneha', email: 's@x.com', currency: 'INR', netBalance: 0, direction: 'settled' },
    ],
    ...partial,
  };
}

describe('PeopleDashboardComponent', () => {
  let fixture: ComponentFixture<PeopleDashboardComponent>;
  let peopleService: { getOverview: jest.Mock };

  async function setup(ret = of(overview())) {
    peopleService = { getOverview: jest.fn().mockReturnValue(ret) };
    await TestBed.configureTestingModule({
      imports: [PeopleDashboardComponent],
      providers: [
        provideRouter([]),
        { provide: PeopleService, useValue: peopleService },
        { provide: Store, useValue: { selectSnapshot: () => ({ userId: 'me' }) } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(PeopleDashboardComponent);
    fixture.detectChanges();
  }

  it('requests only the top 5 people', async () => {
    await setup();
    expect(peopleService.getOverview).toHaveBeenCalledWith(5);
  });

  it('renders people with correct direction text', async () => {
    await setup();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Naveen owes you');
    expect(text).toContain('You owe Praveen');
  });

  it('renders a settled state', async () => {
    await setup();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Settled');
  });

  it('shows the empty state when there are no people', async () => {
    await setup(of(overview({ people: [], totalYouAreOwed: 0, totalYouOwe: 0 })));
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('all settled up');
  });

  it('shows an error state on failure', async () => {
    await setup(throwError(() => new Error('boom')));
    expect(fixture.nativeElement.querySelector('[data-testid="people-retry"]')).toBeTruthy();
  });
});
