import {
  Component,
  input,
  output,
  inject,
  signal,
  DestroyRef,
} from '@angular/core';
import { NgClass } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Subscription, firstValueFrom } from 'rxjs';
import { GroupMember, UserSearchResult } from '@finmate/data-models';
import { GroupsService } from '../../services/groups.service';
import { FriendsService } from '../../../friends/services/friends.service';
import { APP_NAME } from '../../../../core/constants/app.constants';
import {
  DropdownComponent,
  DropdownOption,
} from '../../../../shared/components/dropdown/dropdown.component';
import { resolveMemberDisplayName } from '../../utils/member-display.util';
import {
  ClientEncryptionService,
  arrayBufferToBase64,
} from '../../../../core/services/encryption.service';
import { GroupKeyService } from '../../../../core/services/group-key.service';
import { environment } from '../../../../../environments/environment';

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

@Component({
  selector: 'app-group-members',
  standalone: true,
  imports: [NgClass, FormsModule, DropdownComponent],
  templateUrl: './group-members.component.html',
})
export class GroupMembersComponent {
  private groupsService = inject(GroupsService);
  private friendsService = inject(FriendsService);
  private destroyRef = inject(DestroyRef);
  private encryptionService = inject(ClientEncryptionService);
  private groupKeyService = inject(GroupKeyService);
  private http = inject(HttpClient);

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
    { value: 'spectator', label: 'Spectator' },
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
  private searchTimeoutId?: ReturnType<typeof setTimeout>;
  private searchSub?: Subscription;

  constructor() {
    this.destroyRef.onDestroy(() => {
      if (this.searchTimeoutId) {
        clearTimeout(this.searchTimeoutId);
      }
      this.searchSub?.unsubscribe();
    });
  }

  /** Display name for a member, whichever identity backs it (registered or pending). */
  memberDisplayName(member: GroupMember): string {
    return resolveMemberDisplayName(member);
  }

  /**
   * Resolves the group data key, self-healing inline if it isn't cached yet.
   *
   * GroupDetailComponent kicks off key resolution/minting/provisioning in
   * the background as soon as the group loads (initializeGroupKeysAndSelfHeal,
   * fire-and-forget — it does not block the UI). If a caller reaches Invite
   * before that finishes (slow network, or first-ever RSA keypair generation
   * for this browser), a bare `getGroupDataKey` can return null even though
   * the caller genuinely has access — this repeats the same
   * resolve-or-mint-then-provision sequence inline so Invite doesn't have to
   * wait for, or race, that background pass.
   */
  private async ensureGroupKey(): Promise<CryptoKey | null> {
    const groupId = this.groupId();
    const cached = await this.groupKeyService.getGroupDataKey(groupId);
    if (cached) return cached;

    try {
      await this.groupKeyService.getMyAsymmetricKeys();
      const result = await this.groupKeyService.resolveGroupKey(groupId);
      if (result.status === 'ready') {
        return result.key;
      }
      if (result.status === 'pending' && this.isOwnerOrAdmin()) {
        // No key resolvable and we're allowed to manage keys — this is a
        // brand-new group whose key was never minted; mint it now rather
        // than blocking Invite on a background pass that may not run again.
        return await this.groupKeyService.createAndStoreGroupKey(groupId);
      }
    } catch (e) {
      console.error('Group key self-heal failed', e);
    }
    return null;
  }

  memberInitials(member: GroupMember): string {
    return this.memberDisplayName(member).substring(0, 2).toUpperCase();
  }

  isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  isValidPhone(phone: string): boolean {
    return /^\+?[0-9\s-]{7,15}$/.test(phone);
  }

  onSearchChange(query: string) {
    if (this.searchTimeoutId) {
      clearTimeout(this.searchTimeoutId);
      this.searchTimeoutId = undefined;
    }
    this.searchSub?.unsubscribe();

    if (query.trim().length < 2) {
      this.searchResults = [];
      this.isSearching = false;
      return;
    }

    this.isSearching = true;
    this.searchTimeoutId = setTimeout(() => {
      this.searchSub = this.friendsService.searchUsers(query).subscribe({
        next: (users) => {
          this.searchResults = users.filter(
            (user) =>
              !this.members().some((m) => m.user?.id === user.id) &&
              !this.stagedInvites().some(
                (s) =>
                  s.userId === user.id ||
                  s.identifier ===
                    (user.email || user.username || user.phoneNumber),
              ),
          );
          this.isSearching = false;
        },
        error: () => {
          this.isSearching = false;
        },
      });
    }, 250);
  }

  stageUser(invite: Omit<StagedInvite, 'id'>) {
    const id = Math.random().toString(36).substring(2, 9);
    this.stagedInvites.update((list) => [...list, { ...invite, id }]);
  }

  removeStagedInvite(id: string) {
    this.stagedInvites.update((list) => list.filter((item) => item.id !== id));
  }

  selectUserForInvite(user: UserSearchResult) {
    this.stageUser({
      name: user.displayName || user.email.split('@')[0],
      identifier: user.email || user.username || user.phoneNumber || user.id,
      role: this.inviteRole,
      isRegisteredUser: true,
      userId: user.id,
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
        isRegisteredUser: false,
      });
      this.searchQuery = '';
      this.searchResults = [];
    } else {
      this.openNewContactModal(query);
    }
  }

  openNewContactModal(initialName = '') {
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
      this.newContactError =
        'Please enter a valid email address or phone number (7-15 digits).';
      return;
    }

    const isAlreadyStaged = this.stagedInvites().some(
      (s) => s.identifier.toLowerCase() === identifier.toLowerCase(),
    );
    const isAlreadyMember = this.members().some(
      (m) =>
        m.user?.email?.toLowerCase() === identifier.toLowerCase() ||
        m.user?.phoneNumber === identifier,
    );

    if (isAlreadyStaged || isAlreadyMember) {
      this.newContactError = 'This person is already added or a group member.';
      return;
    }

    this.stageUser({
      name,
      identifier,
      role: this.newContactRole,
      isRegisteredUser: false,
    });

    this.closeNewContactModal();
    this.searchQuery = '';
    this.searchResults = [];
  }

  async sendBulkInvites() {
    const list = this.stagedInvites();
    if (list.length === 0) return;

    this.isInviting = true;
    this.inviteError = '';
    this.inviteSuccess = '';

    try {
      const groupKey = await this.ensureGroupKey();
      if (!groupKey) {
        throw new Error('Group key not available. Please unlock your vault.');
      }

      const subtle = window.crypto.subtle || (globalThis as any).crypto?.subtle;
      if (!subtle) {
        throw new Error('Web Cryptography API is not available');
      }
      const results: any[] = [];
      const failed: FailedInviteResult[] = [];

      for (const invite of list) {
        try {
          let wrappedGroupKey: string | undefined;
          let tikUrlSafe: string | undefined;

          // 1. Try lookup user on the server
          let lookupData: any = null;
          try {
            const lookupRes = await firstValueFrom(
              this.http.get<{
                data: { userId: string; publicWrappingKey: string | null };
              }>(
                `${environment.apiBaseUrl}/users/lookup?identifier=${encodeURIComponent(invite.identifier)}`,
              ),
            );
            lookupData = lookupRes.data;
          } catch {
            // User not registered or lookup failed
          }
          let wrappingMethod: 'AES-KW' | 'RSA-OAEP' | undefined;

          if (lookupData && lookupData.publicWrappingKey) {
            // Flow B: User is registered and has public wrapping key
            const publicKey = await subtle.importKey(
              'jwk',
              JSON.parse(lookupData.publicWrappingKey),
              { name: 'RSA-OAEP', hash: 'SHA-256' },
              true,
              ['wrapKey'],
            );
            wrappedGroupKey = await this.encryptionService.wrapKey(
              groupKey,
              publicKey,
            );
            wrappingMethod = 'RSA-OAEP';
          } else {
            // Flow C: User is unregistered or doesn't have public wrapping key
            // Generate TIK (AES-GCM 256-bit)
            const tik = await this.encryptionService.generateDataKey();
            wrappedGroupKey = await this.encryptionService.wrapKey(
              groupKey,
              tik,
            );
            wrappingMethod = 'AES-KW';

            const rawTik = await subtle.exportKey('raw', tik);
            const tikBase64 = arrayBufferToBase64(rawTik);
            tikUrlSafe = tikBase64
              .replace(/\+/g, '-')
              .replace(/\//g, '_')
              .replace(/=+$/, '');
          }

          // 2. Send invitation
          const inviteRes = await firstValueFrom(
            this.groupsService.inviteMember(this.groupId(), {
              identifier: invite.identifier,
              role: invite.role,
              displayName: invite.isRegisteredUser ? undefined : invite.name,
              wrappedGroupKey,
              wrappingMethod,
              inviteKeyHash: tikUrlSafe,
            }),
          );

          // 3. If TIK was used, save invite URL with TIK hash
          if (tikUrlSafe && inviteRes.inviteToken) {
            const host = window.location.origin;
            (invite as any).joinUrl =
              `${host}/groups/join/${inviteRes.inviteToken}#${tikUrlSafe}`;
          } else if (inviteRes.inviteToken) {
            const host = window.location.origin;
            (invite as any).joinUrl =
              `${host}/groups/join/${inviteRes.inviteToken}`;
          }

          results.push(inviteRes);
        } catch (err: any) {
          failed.push({
            error: true,
            invite,
            message:
              err.error?.message || err.message || 'Failed to send invite.',
          });
        }
      }

      this.isInviting = false;

      if (failed.length === 0) {
        const phoneInvites = list.filter((invite) =>
          this.isValidPhone(invite.identifier),
        );
        this.stagedInvites.set([]);
        this.inviteSuccess = 'All invitations sent successfully!';
        this.memberChanged.emit();

        if (phoneInvites.length > 0) {
          this.justInvitedPhoneContacts = phoneInvites;
          this.isMobileShareModalOpen = true;
        } else {
          setTimeout(() => (this.inviteSuccess = ''), 3000);
        }
      } else {
        const failedIds = new Set(failed.map((f) => f.invite.id));
        this.stagedInvites.update((staged) =>
          staged.filter((item) => failedIds.has(item.id)),
        );
        this.inviteError = `Failed to invite: ${failed.map((f) => f.invite.name).join(', ')}`;
        this.memberChanged.emit();
      }
    } catch (err: any) {
      this.isInviting = false;
      this.inviteError = err.message || 'An unexpected error occurred.';
    }
  }

  removeOrRevokeMember(member: GroupMember) {
    if (
      confirm(
        `Are you sure you want to remove ${this.memberDisplayName(member)}?`,
      )
    ) {
      this.groupsService.removeMember(this.groupId(), member.id).subscribe({
        next: () => {
          this.memberChanged.emit();
        },
        error: (err) => {
          alert(err.error?.message || 'Failed to remove member.');
        },
      });
    }
  }

  isGeneratingLink = false;

  async generateSecureInviteLink() {
    this.isGeneratingLink = true;
    try {
      const subtle = window.crypto.subtle || (globalThis as any).crypto?.subtle;
      if (!subtle) {
        throw new Error('Web Cryptography API is not available');
      }

      // 1. Resolve Group Key
      const groupKey = await this.ensureGroupKey();
      if (!groupKey) {
        throw new Error('Group key not available. Please unlock your vault.');
      }

      // 2. Generate TIK (AES-GCM 256-bit)
      const tik = await this.encryptionService.generateDataKey();

      // 3. Wrap Group Key with TIK
      const wrappedGk = await this.encryptionService.wrapKey(groupKey, tik);

      // 4. Export TIK raw bytes to put in URL
      const rawTik = await subtle.exportKey('raw', tik);
      const tikBase64 = arrayBufferToBase64(rawTik);
      const tikUrlSafe = tikBase64
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

      // 5. Post to API to create invite and store wrapped key
      const response = await firstValueFrom(
        this.http.post<{ data: { inviteToken: string } }>(
          `${environment.apiBaseUrl}/groups/${this.groupId()}/invites`,
          { wrappedGroupKey: wrappedGk },
        ),
      );

      const inviteToken = response.data.inviteToken;
      const host = window.location.origin;
      this.joinUrl = `${host}/groups/join/${inviteToken}#${tikUrlSafe}`;
      this.qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(this.joinUrl)}`;
    } catch (err: any) {
      alert(err.message || 'Failed to generate secure invite link');
      this.joinUrl = '';
      this.qrCodeUrl = '';
    } finally {
      this.isGeneratingLink = false;
    }
  }

  async openQrModal() {
    await this.generateSecureInviteLink();
    if (this.joinUrl) {
      this.isQrModalOpen = true;
    }
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
    if (
      member.user?.email &&
      member.user.email.endsWith('@placeholder.finmate')
    ) {
      return member.user.email.split('@')[0];
    }
    return null;
  }

  getWhatsAppShareUrl(phoneNumber: string, displayName: string): string {
    const cleanPhone = phoneNumber.replace(/[^0-9]/g, '');
    const staged = this.justInvitedPhoneContacts.find(
      (c) => c.identifier === phoneNumber,
    );
    const joinUrl =
      (staged as any)?.joinUrl ||
      this.joinUrl ||
      `${window.location.origin}/groups/join/${this.inviteToken()}`;
    const text = `Hey ${displayName}! I've invited you to join our group "${this.groupName()}" on FinMate. Use this link to join and track split expenses: ${joinUrl}`;

    if (cleanPhone) {
      return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`;
    }
    return `https://wa.me/?text=${encodeURIComponent(text)}`;
  }

  getSmsShareUrl(phoneNumber: string, displayName: string): string {
    const staged = this.justInvitedPhoneContacts.find(
      (c) => c.identifier === phoneNumber,
    );
    const joinUrl =
      (staged as any)?.joinUrl ||
      this.joinUrl ||
      `${window.location.origin}/groups/join/${this.inviteToken()}`;
    const text = `Hey ${displayName}! I've invited you to join our group "${this.groupName()}" on FinMate. Join here: ${joinUrl}`;
    return `sms:${phoneNumber}?body=${encodeURIComponent(text)}`;
  }

  closeMobileShareModal() {
    this.isMobileShareModalOpen = false;
    this.justInvitedPhoneContacts = [];
  }
}
