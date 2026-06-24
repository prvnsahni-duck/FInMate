import { Component, input, output, inject, signal } from '@angular/core';
import { NgClass } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { GroupMember, UserSearchResult } from '@finmate/data-models';
import { GroupsService } from '../../services/groups.service';
import { FriendsService } from '../../../friends/services/friends.service';
import { APP_NAME } from '../../../../core/constants/app.constants';
import { DropdownComponent, DropdownOption } from '../../../../shared/components/dropdown/dropdown.component';

export interface StagedInvite {
  id: string;
  name: string;
  identifier: string; // Email or phone number
  role: 'admin' | 'member' | 'viewer' | 'spectator';
  isRegisteredUser: boolean;
  userId?: string;
}

interface FailedInviteResult {
  error: true;
  invite: StagedInvite;
  message: string;
}

function isFailedInviteResult(result: GroupMember | FailedInviteResult): result is FailedInviteResult {
  return 'error' in result && result.error;
}

@Component({
  selector: 'app-group-members',
  standalone: true,
  imports: [NgClass, FormsModule, DropdownComponent],
  templateUrl: './group-members.component.html'
})
export class GroupMembersComponent {
  private groupsService = inject(GroupsService);
  private friendsService = inject(FriendsService);

  members = input.required<GroupMember[]>();
  groupId = input.required<string>();
  isOwnerOrAdmin = input.required<boolean>();
  inviteToken = input<string>();
  groupName = input<string>('');

  memberChanged = output<void>();

  // Invite Form & Centralized Config State
  appName = APP_NAME;
  inviteRole: 'admin' | 'member' | 'viewer' | 'spectator' = 'member';
  isInviting = false;
  inviteError = '';
  inviteSuccess = '';

  roleOptions: DropdownOption[] = [
    { value: 'member', label: 'Member' },
    { value: 'admin', label: 'Admin' },
    { value: 'viewer', label: 'Viewer' },
    { value: 'spectator', label: 'Spectator' }
  ];

  stagedInvites = signal<StagedInvite[]>([]);
  isNewContactModalOpen = false;
  newContactName = '';
  newContactIdentifier = '';
  newContactRole: 'admin' | 'member' | 'viewer' | 'spectator' = 'member';
  newContactError = '';

  // QR Modal State
  isQrModalOpen = false;
  qrCodeUrl = '';
  joinUrl = '';

  // Mobile/Messenger Share Modal State
  isMobileShareModalOpen = false;
  justInvitedPhoneContacts: StagedInvite[] = [];

  // User Lookup / Auto-suggest state
  searchQuery = '';
  searchResults: UserSearchResult[] = [];
  isSearching = false;

  isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  isValidPhone(phone: string): boolean {
    return /^\+?[0-9\s-]{7,15}$/.test(phone);
  }

  onSearchChange(query: string) {
    if (query.trim().length < 2) {
      this.searchResults = [];
      return;
    }
    this.isSearching = true;
    this.friendsService.searchUsers(query).subscribe({
      next: (users) => {
        this.searchResults = users.filter(user => 
          !this.members().some(m => m.user?.id === user.id) &&
          !this.stagedInvites().some(s => s.userId === user.id || s.identifier === (user.email || user.username || user.phoneNumber))
        );
        this.isSearching = false;
      },
      error: () => {
        this.isSearching = false;
      }
    });
  }

  stageUser(invite: Omit<StagedInvite, 'id'>) {
    const id = Math.random().toString(36).substring(2, 9);
    this.stagedInvites.update(list => [...list, { ...invite, id }]);
  }

  removeStagedInvite(id: string) {
    this.stagedInvites.update(list => list.filter(item => item.id !== id));
  }

  selectUserForInvite(user: UserSearchResult) {
    this.stageUser({
      name: user.displayName || user.email.split('@')[0],
      identifier: user.email || user.username || user.phoneNumber || user.id,
      role: this.inviteRole,
      isRegisteredUser: true,
      userId: user.id
    });
    this.searchQuery = '';
    this.searchResults = [];
  }

  selectCustomInvite() {
    const query = this.searchQuery.trim();
    if (!query) return;

    if (this.isValidEmail(query) || this.isValidPhone(query)) {
      this.stageUser({
        name: query,
        identifier: query,
        role: this.inviteRole,
        isRegisteredUser: false
      });
      this.searchQuery = '';
      this.searchResults = [];
    } else {
      this.openNewContactModal(query);
    }
  }

  openNewContactModal(initialName: string = '') {
    this.newContactName = initialName;
    this.newContactIdentifier = '';
    this.newContactRole = this.inviteRole;
    this.newContactError = '';
    this.isNewContactModalOpen = true;
  }

  closeNewContactModal() {
    this.isNewContactModalOpen = false;
  }

  confirmAddStagedContact() {
    this.newContactError = '';
    const name = this.newContactName.trim();
    const identifier = this.newContactIdentifier.trim();

    if (!name) {
      this.newContactError = 'Name is required.';
      return;
    }
    if (!identifier) {
      this.newContactError = 'Email or phone number is required.';
      return;
    }

    if (!this.isValidEmail(identifier) && !this.isValidPhone(identifier)) {
      this.newContactError = 'Please enter a valid email address or phone number (7-15 digits).';
      return;
    }

    const isAlreadyStaged = this.stagedInvites().some(
      s => s.identifier.toLowerCase() === identifier.toLowerCase()
    );
    const isAlreadyMember = this.members().some(
      m => m.user?.email?.toLowerCase() === identifier.toLowerCase() ||
           m.user?.phoneNumber === identifier
    );

    if (isAlreadyStaged || isAlreadyMember) {
      this.newContactError = 'This person is already added or a group member.';
      return;
    }

    this.stageUser({
      name,
      identifier,
      role: this.newContactRole,
      isRegisteredUser: false
    });

    this.closeNewContactModal();
    this.searchQuery = '';
    this.searchResults = [];
  }

  sendBulkInvites() {
    const list = this.stagedInvites();
    if (list.length === 0) return;

    this.isInviting = true;
    this.inviteError = '';
    this.inviteSuccess = '';

    const requests = list.map(invite => 
      this.groupsService.inviteMember(this.groupId(), {
        identifier: invite.identifier,
        role: invite.role,
        displayName: invite.isRegisteredUser ? undefined : invite.name
      }).pipe(
        catchError(err => of({ error: true, invite, message: err.error?.message || 'Failed to send invite.' } satisfies FailedInviteResult))
      )
    );

    forkJoin(requests).subscribe({
      next: (results) => {
        this.isInviting = false;
        const failed = results.filter(isFailedInviteResult);

        if (failed.length === 0) {
          const phoneInvites = list.filter(invite => this.isValidPhone(invite.identifier));
          this.stagedInvites.set([]);
          this.inviteSuccess = 'All invitations sent successfully!';
          this.memberChanged.emit();
          
          if (phoneInvites.length > 0) {
            this.justInvitedPhoneContacts = phoneInvites;
            this.isMobileShareModalOpen = true;
          } else {
            setTimeout(() => this.inviteSuccess = '', 3000);
          }
        } else {
          const failedIds = new Set(failed.map(f => f.invite.id));
          this.stagedInvites.update(staged => staged.filter(item => failedIds.has(item.id)));
          this.inviteError = `Failed to invite: ${failed.map(f => f.invite.name).join(', ')}`;
          this.memberChanged.emit();
        }
      },
      error: () => {
        this.isInviting = false;
        this.inviteError = 'An unexpected error occurred.';
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

  getPhoneNumber(member: GroupMember): string | null {
    if (member.user?.phoneNumber) {
      return member.user.phoneNumber;
    }
    if (member.user?.email && member.user.email.endsWith('@placeholder.finmate')) {
      return member.user.email.split('@')[0];
    }
    return null;
  }

  getWhatsAppShareUrl(phoneNumber: string, displayName: string): string {
    const cleanPhone = phoneNumber.replace(/[^0-9]/g, '');
    const host = window.location.origin;
    const joinUrl = `${host}/groups/join/${this.inviteToken()}`;
    const text = `Hey ${displayName}! I've invited you to join our group "${this.groupName()}" on FinMate. Use this link to join and track split expenses: ${joinUrl}`;
    
    if (cleanPhone) {
      return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`;
    }
    return `https://wa.me/?text=${encodeURIComponent(text)}`;
  }

  getSmsShareUrl(phoneNumber: string, displayName: string): string {
    const host = window.location.origin;
    const joinUrl = `${host}/groups/join/${this.inviteToken()}`;
    const text = `Hey ${displayName}! I've invited you to join our group "${this.groupName()}" on FinMate. Join here: ${joinUrl}`;
    return `sms:${phoneNumber}?body=${encodeURIComponent(text)}`;
  }

  closeMobileShareModal() {
    this.isMobileShareModalOpen = false;
    this.justInvitedPhoneContacts = [];
  }
}
