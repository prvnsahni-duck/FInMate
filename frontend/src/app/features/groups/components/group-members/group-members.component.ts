import { Component, input, output, inject, signal } from '@angular/core';
import { NgClass, CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { GroupMember } from '@finmate/data-models';
import { GroupsService } from '../../services/groups.service';
import { FriendsService } from '../../../friends/services/friends.service';

@Component({
  selector: 'app-group-members',
  standalone: true,
  imports: [CommonModule, NgClass, FormsModule],
  templateUrl: './group-members.component.html'
})
export class GroupMembersComponent {
  private groupsService = inject(GroupsService);
  private friendsService = inject(FriendsService);

  members = input.required<GroupMember[]>();
  groupId = input.required<string>();
  isOwnerOrAdmin = input.required<boolean>();
  inviteToken = input<string>();

  memberChanged = output<void>();

  // Invite Form State
  inviteIdentifier = '';
  inviteRole: 'admin' | 'member' | 'viewer' | 'spectator' = 'member';
  isInviting = false;
  inviteError = '';
  inviteSuccess = '';

  // QR Modal State
  isQrModalOpen = false;
  qrCodeUrl = '';
  joinUrl = '';

  // User Lookup / Auto-suggest state
  searchQuery = '';
  searchResults: any[] = [];
  isSearching = false;

  onSearchChange(query: string) {
    this.inviteIdentifier = query;
    if (query.trim().length < 2) {
      this.searchResults = [];
      return;
    }
    this.isSearching = true;
    this.friendsService.searchUsers(query).subscribe({
      next: (users) => {
        this.searchResults = users.filter(user => 
          !this.members().some(m => m.user?.id === user.id)
        );
        this.isSearching = false;
      },
      error: () => {
        this.isSearching = false;
      }
    });
  }

  selectUserForInvite(user: any) {
    this.inviteIdentifier = user.email || user.username || user.phoneNumber;
    this.searchQuery = this.inviteIdentifier;
    this.searchResults = [];
  }

  sendInvite() {
    if (!this.inviteIdentifier.trim()) return;
    this.isInviting = true;
    this.inviteError = '';
    this.inviteSuccess = '';

    this.groupsService.inviteMember(this.groupId(), {
      identifier: this.inviteIdentifier,
      role: this.inviteRole
    }).subscribe({
      next: () => {
        this.isInviting = false;
        this.inviteIdentifier = '';
        this.searchQuery = '';
        this.searchResults = [];
        this.inviteSuccess = 'Invitation sent successfully!';
        this.memberChanged.emit();
        setTimeout(() => this.inviteSuccess = '', 3000);
      },
      error: (err) => {
        this.isInviting = false;
        this.inviteError = err.error?.message || 'Failed to send invitation.';
      }
    });
  }

  removeOrRevokeMember(member: GroupMember) {
    if (confirm(`Are you sure you want to remove ${member.user?.displayName || member.user?.email}?`)) {
      this.groupsService.removeMember(this.groupId(), member.id).subscribe({
        next: () => {
          this.memberChanged.emit();
        },
        error: (err) => {
          alert(err.error?.message || 'Failed to remove member.');
        }
      });
    }
  }

  openQrModal() {
    const token = this.inviteToken();
    if (!token) return;
    
    const host = window.location.origin;
    this.joinUrl = `${host}/groups/join/${token}`;
    this.qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(this.joinUrl)}`;
    this.isQrModalOpen = true;
  }

  closeQrModal() {
    this.isQrModalOpen = false;
  }

  copyJoinUrl() {
    navigator.clipboard.writeText(this.joinUrl).then(() => {
      alert('Invite link copied to clipboard!');
    });
  }
}
