import { Component, inject, signal, OnInit } from '@angular/core';
import { CurrencyPipe, DatePipe, NgClass } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { PersonDetailResponse, PersonHistoryItem } from '@finmate/data-models';
import { PeopleService } from '../../services/people.service';
import { AddTransactionModalComponent } from '../../components/add-transaction-modal/add-transaction-modal.component';
import { ReturnModalComponent } from '../../components/return-modal/return-modal.component';
import {
  directionSentence,
  historyLabel,
} from '../../utils/people-format.util';

/**
 * Person detail — the unified relationship view. Header balance/direction,
 * per-currency breakdown, and chronological history all come from the backend.
 * After any mutation (add / return / delete) the detail is re-fetched so the
 * frontend never becomes the source of financial truth.
 */
@Component({
  selector: 'app-person-detail',
  standalone: true,
  imports: [
    CurrencyPipe,
    DatePipe,
    NgClass,
    RouterLink,
    AddTransactionModalComponent,
    ReturnModalComponent,
  ],
  templateUrl: './person-detail.component.html',
})
export class PersonDetailComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private peopleService = inject(PeopleService);

  readonly userId = signal<string>('');
  readonly detail = signal<PersonDetailResponse | null>(null);
  readonly isLoading = signal(true);
  readonly hasError = signal(false);

  readonly showAdd = signal(false);
  readonly showReturn = signal(false);
  readonly deletingId = signal<string | null>(null);

  readonly directionSentence = directionSentence;
  readonly historyLabel = historyLabel;
  readonly abs = Math.abs;

  ngOnInit(): void {
    this.route.paramMap.subscribe((params) => {
      const id = params.get('userId') ?? '';
      this.userId.set(id);
      this.reload();
    });
  }

  reload(): void {
    if (!this.userId()) return;
    this.isLoading.set(true);
    this.hasError.set(false);
    this.peopleService.getPersonDetail(this.userId()).subscribe({
      next: (res) => {
        this.detail.set(res);
        this.isLoading.set(false);
      },
      error: () => {
        this.hasError.set(true);
        this.isLoading.set(false);
      },
    });
  }

  onSaved(): void {
    this.showAdd.set(false);
    this.showReturn.set(false);
    this.reload();
  }

  /** Direct/settlement lines can be deleted; group-derived lines cannot. */
  canDelete(item: PersonHistoryItem): boolean {
    return item.source === 'direct' || item.source === 'settlement';
  }

  deleteEntry(item: PersonHistoryItem): void {
    if (!this.canDelete(item)) return;
    const rawId = item.id.split(':')[1];
    if (!rawId) return;
    if (!confirm('Delete this transaction? This cannot be undone.')) return;
    this.deletingId.set(item.id);
    this.peopleService.deleteTransaction(rawId).subscribe({
      next: () => {
        this.deletingId.set(null);
        this.reload();
      },
      error: () => this.deletingId.set(null),
    });
  }
}
