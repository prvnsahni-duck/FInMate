import { Component, inject, OnInit } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { GroupsService } from '../../services/groups.service';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-join-group',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './join-group.component.html'
})
export class JoinGroupComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private groupsService = inject(GroupsService);

  inviteToken = '';
  groupDetails: any = null;
  isLoading = true;
  isJoining = false;
  errorMessage = '';

  ngOnInit() {
    this.inviteToken = this.route.snapshot.paramMap.get('inviteToken') || '';
    if (!this.inviteToken) {
      this.errorMessage = 'Invalid invitation link.';
      this.isLoading = false;
      return;
    }
    this.fetchDetails();
  }

  fetchDetails() {
    this.isLoading = true;
    this.groupsService.getInviteDetails(this.inviteToken).subscribe({
      next: (details) => {
        this.groupDetails = details;
        this.isLoading = false;
      },
      error: (err) => {
        this.errorMessage = err.error?.message || 'Failed to fetch invitation details. The link may have expired or is invalid.';
        this.isLoading = false;
      }
    });
  }

  onJoin() {
    this.isJoining = true;
    this.groupsService.joinGroup(this.inviteToken).subscribe({
      next: () => {
        this.isJoining = false;
        // Redirect to the group detail page
        this.router.navigate(['/groups', this.groupDetails.id]);
      },
      error: (err) => {
        this.isJoining = false;
        this.errorMessage = err.error?.message || 'Failed to join group. Please try again.';
      }
    });
  }

  onDecline() {
    // Go back to groups list
    this.router.navigate(['/groups']);
  }
}
