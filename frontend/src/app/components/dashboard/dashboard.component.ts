import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Store } from '@ngxs/store';
import { AuthState } from '../../state/auth.state';

@Component({
  selector: 'app-dashboard',
  imports: [CommonModule],
  templateUrl: './dashboard.component.html'
})
export class DashboardComponent implements OnInit {
  private store = inject(Store);
  userName = 'User';

  ngOnInit() {
    const user = this.store.selectSnapshot(AuthState.getUser);
    if (user && user.email) {
      // Use display name if available, else username from email
      this.userName = user.displayName || user.email.split('@')[0];
    }
  }
}
