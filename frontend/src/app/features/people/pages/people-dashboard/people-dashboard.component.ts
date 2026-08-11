import { Component, inject, signal, OnInit } from '@angular/core';
import { CurrencyPipe, NgClass } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { Store } from '@ngxs/store';
import { PeopleService } from '../../services/people.service';
import { PeopleOverviewResponse, UserSearchResult } from '@finmate/data-models';
import { AuthState } from '../../../../core/auth/auth.state';
import { StatsCardComponent } from '../../../../shared/components/stats-card/stats-card.component';
import { PersonSearchModalComponent } from '../../components/person-search-modal/person-search-modal.component';
import { directionSentence } from '../../utils/people-format.util';

/**
 * People dashboard: answers "who owes me / who do I owe" at a glance. Shows the
 * two totals and up to 5 people. All balances/directions come straight from the
 * backend (`GET /people?limit=5`) — nothing is recomputed here.
 */
@Component({
  selector: 'app-people-dashboard',
  standalone: true,
  imports: [
    CurrencyPipe,
    NgClass,
    RouterLink,
    StatsCardComponent,
    PersonSearchModalComponent,
  ],
  templateUrl: './people-dashboard.component.html',
})
export class PeopleDashboardComponent implements OnInit {
  private peopleService = inject(PeopleService);
  private router = inject(Router);
  private store = inject(Store);

  readonly overview = signal<PeopleOverviewResponse | null>(null);
  readonly isLoading = signal(true);
  readonly hasError = signal(false);
  readonly showSearch = signal(false);

  readonly directionSentence = directionSentence;

  /** Own user id — excluded from the "new transaction" search. */
  get currentUserId(): string | null {
    return this.store.selectSnapshot(AuthState.getUser)?.userId ?? null;
  }

  ngOnInit(): void {
    this.load();
  }

  onPersonPicked(user: UserSearchResult): void {
    this.showSearch.set(false);
    this.router.navigate(['/people', user.id]);
  }

  load(): void {
    this.isLoading.set(true);
    this.hasError.set(false);
    this.peopleService.getOverview(5).subscribe({
      next: (res) => {
        this.overview.set(res);
        this.isLoading.set(false);
      },
      error: () => {
        this.hasError.set(true);
        this.isLoading.set(false);
      },
    });
  }
}
