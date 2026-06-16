import { Component, input } from '@angular/core';
import { NgClass } from '@angular/common';
import { GroupMember } from '@finmate/data-models';

@Component({
  selector: 'app-group-members',
  standalone: true,
  imports: [NgClass],
  template: `
    @if (members().length > 0) {
      <div class="bg-white/70 dark:bg-finmate-card/70 backdrop-blur-xl border border-slate-200 dark:border-white/5 rounded-3xl p-6 shadow-xl shadow-black/5">
        <h2 class="text-xl font-bold mb-4">Group Members</h2>
        <div class="space-y-4">
          @for (member of members(); track member.user.id) {
            <div class="flex items-center justify-between">
              <div class="flex items-center space-x-3">
                <div class="w-8 h-8 rounded-full bg-slate-200 dark:bg-white/10 flex items-center justify-center font-bold text-xs">
                  {{ (member.user.displayName || member.user.email).substring(0, 2).toUpperCase() }}
                </div>
                <div>
                  <h4 class="font-semibold text-sm">{{ member.user.displayName || member.user.email }}</h4>
                  <p class="text-xs text-slate-500 dark:text-slate-400 capitalize">{{ member.role }}</p>
                </div>
              </div>
              <span class="text-xs font-semibold px-2 py-0.5 rounded-full" [ngClass]="{'bg-green-500/10 text-green-500': member.joinStatus === 'active', 'bg-yellow-500/10 text-yellow-500': member.joinStatus === 'invited'}">
                {{ member.joinStatus }}
              </span>
            </div>
          }
        </div>
      </div>
    }
  `
})
export class GroupMembersComponent {
  members = input.required<GroupMember[]>();
}
