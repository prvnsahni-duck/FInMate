import { Component, inject, input, output, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { Subject, of } from 'rxjs';
import {
  debounceTime,
  distinctUntilChanged,
  switchMap,
  catchError,
} from 'rxjs/operators';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { UserSearchResult } from '@finmate/data-models';
import { FriendsService } from '../../../friends/services/friends.service';

/**
 * Lightweight user picker to start a brand-new person-to-person relationship
 * with someone who has never shared a group. Reuses the existing
 * `FriendsService.searchUsers` (`/users/search`) — no new search system.
 */
@Component({
  selector: 'app-person-search-modal',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './person-search-modal.component.html',
})
export class PersonSearchModalComponent {
  private friendsService = inject(FriendsService);

  /** Excluded from results (the caller can't transact with themselves). */
  readonly excludeUserId = input<string | null>(null);

  readonly selected = output<UserSearchResult>();
  readonly closed = output<void>();

  readonly query = new FormControl('', { nonNullable: true });
  readonly results = signal<UserSearchResult[]>([]);
  readonly isSearching = signal(false);
  readonly searched = signal(false);

  private readonly term$ = new Subject<string>();

  constructor() {
    this.query.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((v) => this.term$.next(v));

    this.term$
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
        switchMap((q) => {
          const trimmed = q.trim();
          if (trimmed.length < 2) {
            this.searched.set(false);
            return of<UserSearchResult[]>([]);
          }
          this.isSearching.set(true);
          return this.friendsService
            .searchUsers(trimmed)
            .pipe(catchError(() => of<UserSearchResult[]>([])));
        }),
        takeUntilDestroyed(),
      )
      .subscribe((res) => {
        this.isSearching.set(false);
        this.searched.set(true);
        const exclude = this.excludeUserId();
        this.results.set(res.filter((u) => u.id !== exclude));
      });
  }

  pick(user: UserSearchResult): void {
    this.selected.emit(user);
  }
}
