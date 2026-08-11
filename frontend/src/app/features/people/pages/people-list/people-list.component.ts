import { Component, inject, signal, OnInit } from '@angular/core';
import { CurrencyPipe, NgClass } from '@angular/common';
import { RouterLink } from '@angular/router';
import { PeopleService } from '../../services/people.service';
import { PeopleOverviewResponse } from '@finmate/data-models';
import { directionSentence } from '../../utils/people-format.util';

/** Full "View all" people list — every relationship, backend-sorted (settled last). */
@Component({
  selector: 'app-people-list',
  standalone: true,
  imports: [CurrencyPipe, NgClass, RouterLink],
  templateUrl: './people-list.component.html',
})
export class PeopleListComponent implements OnInit {
  private peopleService = inject(PeopleService);

  readonly overview = signal<PeopleOverviewResponse | null>(null);
  readonly isLoading = signal(true);
  readonly hasError = signal(false);

  readonly directionSentence = directionSentence;

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.isLoading.set(true);
    this.hasError.set(false);
    this.peopleService.getOverview().subscribe({
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
