import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { PeopleListComponent } from './people-list.component';
import { PeopleService } from '../../services/people.service';
import { PeopleOverviewResponse } from '@finmate/data-models';

const data: PeopleOverviewResponse = {
  currency: 'INR',
  totalYouAreOwed: 720,
  totalYouOwe: 0,
  hasMultipleCurrencies: false,
  people: [
    { counterpartyUserId: 'u2', displayName: 'Naveen', email: 'n@x.com', currency: 'INR', netBalance: 720, direction: 'owes_you' },
  ],
};

describe('PeopleListComponent', () => {
  let fixture: ComponentFixture<PeopleListComponent>;
  let peopleService: { getOverview: jest.Mock };

  async function setup(ret = of(data)) {
    peopleService = { getOverview: jest.fn().mockReturnValue(ret) };
    await TestBed.configureTestingModule({
      imports: [PeopleListComponent],
      providers: [
        provideRouter([]),
        { provide: PeopleService, useValue: peopleService },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(PeopleListComponent);
    fixture.detectChanges();
  }

  it('requests the full list (no limit)', async () => {
    await setup();
    expect(peopleService.getOverview).toHaveBeenCalledWith();
  });

  it('renders people rows', async () => {
    await setup();
    expect(fixture.nativeElement.textContent).toContain('Naveen owes you');
  });

  it('shows an error state on failure', async () => {
    await setup(throwError(() => new Error('x')));
    expect(fixture.nativeElement.querySelector('[data-testid="people-retry"]')).toBeTruthy();
  });
});
