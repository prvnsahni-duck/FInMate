import { Component, inject, OnInit } from '@angular/core';
import { NgClass, CurrencyPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FriendsService } from '../../services/friends.service';

interface CurrencyDetail {
  groupId: string;
  groupName: string;
  amount: number;
  currency: string;
}

interface FriendBalance {
  friendId: string;
  displayName: string;
  email: string;
  netBalance: number;
  currencyDetails: CurrencyDetail[];
  isExpanded?: boolean;
}

@Component({
  selector: 'app-friends',
  standalone: true,
  imports: [NgClass, CurrencyPipe, RouterLink],
  template: `
    <div class="mb-8">
      <h1 class="text-3xl md:text-4xl font-extrabold tracking-tight">Friends & Balances</h1>
      <p class="text-slate-500 dark:text-slate-400 mt-2">See your net debts and credits aggregated across all groups.</p>
    </div>

    <!-- Summary Cards -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
      <div class="bg-white/70 dark:bg-finmate-card/70 backdrop-blur-xl border border-slate-200 dark:border-white/5 rounded-3xl p-6 shadow-xl shadow-black/5">
        <h3 class="text-slate-500 dark:text-slate-400 text-sm font-medium mb-1">Total You Are Owed</h3>
        <p class="text-3xl font-bold text-green-500 dark:text-green-400">+{{ totalOwed | currency:'USD' }}</p>
      </div>
      <div class="bg-white/70 dark:bg-finmate-card/70 backdrop-blur-xl border border-slate-200 dark:border-white/5 rounded-3xl p-6 shadow-xl shadow-black/5">
        <h3 class="text-slate-500 dark:text-slate-400 text-sm font-medium mb-1">Total You Owe</h3>
        <p class="text-3xl font-bold text-red-500 dark:text-red-400">-{{ totalOwes | currency:'USD' }}</p>
      </div>
      <div class="bg-gradient-dark rounded-3xl p-6 shadow-xl shadow-black/10 text-white border border-white/10 relative overflow-hidden">
        <div class="absolute top-0 right-0 w-32 h-32 bg-finmate-neon/20 rounded-full blur-[40px]"></div>
        <h3 class="text-white/70 text-sm font-medium mb-1 relative z-10">Net Balance</h3>
        <p class="text-3xl font-bold relative z-10" [ngClass]="{'text-green-400': netTotal >= 0, 'text-red-400': netTotal < 0}">
          {{ netTotal >= 0 ? '+' : '' }}{{ netTotal | currency:'USD' }}
        </p>
      </div>
    </div>

    <!-- Friends Ledger -->
    <div class="bg-white/70 dark:bg-finmate-card/70 backdrop-blur-xl border border-slate-200 dark:border-white/5 rounded-3xl p-6 shadow-xl shadow-black/5">
      <h2 class="text-xl font-bold mb-6">Settlement Summary</h2>

      @if (isLoading) {
        <div class="space-y-4">
          @for (i of [1, 2, 3]; track i) {
            <div class="h-20 bg-slate-200 dark:bg-white/5 rounded-2xl animate-pulse"></div>
          }
        </div>
      } @else if (friends.length === 0) {
        <div class="text-center py-12">
          <div class="w-16 h-16 bg-slate-100 dark:bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg class="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"></path></svg>
          </div>
          <p class="text-slate-500 dark:text-slate-400 font-medium">All settled up! No active debts or credits with friends.</p>
        </div>
      } @else {
        <div class="space-y-4">
          @for (friend of friends; track friend.friendId) {
            <div class="border border-slate-100 dark:border-white/5 rounded-2xl overflow-hidden bg-slate-50/50 dark:bg-white/5 hover:border-finmate-neon/30 transition-all">
              
              <!-- Friend Card Row -->
              <div (click)="toggleExpand(friend)" class="flex items-center justify-between p-4 cursor-pointer select-none">
                <div class="flex items-center space-x-4">
                  <div class="w-12 h-12 rounded-full bg-slate-200 dark:bg-white/10 flex items-center justify-center font-bold text-slate-600 dark:text-slate-300">
                    {{ friend.displayName.substring(0, 2).toUpperCase() }}
                  </div>
                  <div>
                    <h4 class="font-bold text-slate-800 dark:text-white">{{ friend.displayName }}</h4>
                    <p class="text-xs text-slate-500 dark:text-slate-400">{{ friend.email }}</p>
                  </div>
                </div>

                <div class="flex items-center space-x-6 text-right">
                  <div>
                    <p class="font-bold text-lg" [ngClass]="{'text-green-500 dark:text-green-400': friend.netBalance > 0, 'text-red-500 dark:text-red-400': friend.netBalance < 0, 'text-slate-500': friend.netBalance === 0}">
                      {{ friend.netBalance > 0 ? 'owes you' : (friend.netBalance < 0 ? 'you owe' : 'settled') }}
                      @if (friend.netBalance !== 0) {
                        <span>
                          {{ Math.abs(friend.netBalance) | currency:'USD' }}
                        </span>
                      }
                    </p>
                    <p class="text-xs text-slate-400 dark:text-slate-500">
                      {{ friend.currencyDetails.length }} group{{ friend.currencyDetails.length > 1 ? 's' : '' }}
                    </p>
                  </div>
                  <svg class="w-5 h-5 text-slate-400 transition-transform duration-300" [class.rotate-180]="friend.isExpanded" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
                  </svg>
                </div>
              </div>

              <!-- Collapsible Group Breakdown -->
              @if (friend.isExpanded) {
                <div class="border-t border-slate-200/50 dark:border-white/5 bg-slate-100/50 dark:bg-black/10 px-6 py-4 space-y-3">
                  <h5 class="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2">Group Breakdown</h5>
                  @for (det of friend.currencyDetails; track det.groupId) {
                    <div class="flex justify-between items-center text-sm py-1.5 border-b border-dashed border-slate-200 dark:border-white/5 last:border-b-0">
                      <a [routerLink]="['/groups', det.groupId]" class="font-semibold text-finmate-neon2 hover:underline">
                        {{ det.groupName }}
                      </a>
                      <span class="font-bold" [ngClass]="{'text-green-500 dark:text-green-400': det.amount > 0, 'text-red-500 dark:text-red-400': det.amount < 0}">
                        {{ det.amount > 0 ? '+' : '' }}{{ det.amount | currency:det.currency }}
                      </span>
                    </div>
                  }
                </div>
              }

            </div>
          }
        </div>
      }
    </div>
  `
})
export class FriendsComponent implements OnInit {
  private friendsService = inject(FriendsService);
  Math = Math;

  friends: FriendBalance[] = [];
  isLoading = true;

  totalOwed = 0;
  totalOwes = 0;
  netTotal = 0;

  ngOnInit() {
    this.fetchFriendsBalances();
  }

  fetchFriendsBalances() {
    this.friendsService.getFriends().subscribe({
      next: (res) => {
        this.friends = res;
        this.calculateSummaries();
        this.isLoading = false;
      },
      error: () => this.isLoading = false
    });
  }

  toggleExpand(friend: FriendBalance) {
    friend.isExpanded = !friend.isExpanded;
  }

  calculateSummaries() {
    let owed = 0;
    let owes = 0;
    this.friends.forEach((f) => {
      if (f.netBalance > 0) {
        owed += f.netBalance;
      } else {
        owes += Math.abs(f.netBalance);
      }
    });
    this.totalOwed = owed;
    this.totalOwes = owes;
    this.netTotal = owed - owes;
  }
}
