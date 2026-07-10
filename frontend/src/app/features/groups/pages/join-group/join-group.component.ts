import { Component, inject, OnInit } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { GroupsService } from '../../services/groups.service';
import { NgClass } from '@angular/common';
import { InviteDetailsResponse } from '@finmate/data-models';
import { Store } from '@ngxs/store';
import { firstValueFrom } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../../environments/environment';
import { ClientEncryptionService, base64ToArrayBuffer } from '../../../../core/services/encryption.service';
import { GroupKeyService } from '../../../../core/services/group-key.service';

@Component({
  selector: 'app-join-group',
  standalone: true,
  imports: [NgClass, RouterLink],
  templateUrl: './join-group.component.html',
})
export class JoinGroupComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private groupsService = inject(GroupsService);
  private store = inject(Store);
  private encryptionService = inject(ClientEncryptionService);
  private groupKeyService = inject(GroupKeyService);
  private http = inject(HttpClient);

  inviteToken = '';
  groupDetails: InviteDetailsResponse | null = null;
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
        this.errorMessage =
          err.error?.message ||
          'Failed to fetch invitation details. The link may have expired or is invalid.';
        this.isLoading = false;
      },
    });
  }

  async onJoin() {
    this.isJoining = true;
    this.errorMessage = '';

    try {
      // 1. Send join request to backend
      const res: any = await firstValueFrom(this.groupsService.joinGroup(this.inviteToken));
      const groupId = res.groupId;
      const wrappedGroupKey = res.wrappedGroupKey;

      // 2. Extract TIK from hash fragment
      const hash = window.location.hash;
      const tikUrlSafe = hash ? hash.substring(1) : '';

      if (wrappedGroupKey && tikUrlSafe) {
        // TIK symmetric key decryption flow
        const subtle = window.crypto.subtle || (globalThis as any).crypto?.subtle;
        if (!subtle) {
          throw new Error('Web Cryptography API is not available');
        }

        // Convert URL-safe base64 back to raw ArrayBuffer
        let base64 = tikUrlSafe.replace(/-/g, '+').replace(/_/g, '/');
        while (base64.length % 4) {
          base64 += '=';
        }
        const rawTik = base64ToArrayBuffer(base64);

        // Import TIK as AES-GCM key
        const tik = await subtle.importKey(
          'raw',
          rawTik,
          { name: 'AES-GCM' },
          false,
          ['decrypt']
        );

        // Decrypt group key using TIK to get raw key bytes
        const decryptedGroupKey = await this.encryptionService.unwrapKey(wrappedGroupKey, tik);

        // Export decrypted key as raw to import it with appropriate usages
        const rawGk = await subtle.exportKey('raw', decryptedGroupKey);
        const groupKey = await subtle.importKey(
          'raw',
          rawGk,
          { name: 'AES-GCM' },
          true, // extractable so we can wrap it for self
          ['encrypt', 'decrypt']
        );

        // Resolve user's derived master key
        const user = this.store.selectSnapshot((state: any) => state.auth?.user);
        if (user && user.email) {
          const masterKey = await this.encryptionService.loadKeyFromSession(user.email);
          if (masterKey) {
            // Wrap group key with master key for self
            const wrappedGkForSelf = await this.encryptionService.wrapKey(groupKey, masterKey);

            // Save wrapped key to server
            await firstValueFrom(
              this.http.post(`${environment.apiBaseUrl}/groups/${groupId}/keys`, {
                keys: [{ userId: user.userId ?? user.id, wrappedKey: wrappedGkForSelf }],
              })
            );

            // Warm the cache through GroupKeyService so the key is stored under
            // the same versioned vault/memory keys the ledger later looks up
            // (avoids the group:${id} vs ${id}:${version} mismatch).
            await this.groupKeyService.getGroupDataKey(groupId);
          }
        }
      }

      this.isJoining = false;
      if (this.groupDetails) {
        this.router.navigate(['/groups', this.groupDetails.id]);
      } else {
        this.router.navigate(['/groups', groupId]);
      }
    } catch (err: any) {
      this.isJoining = false;
      this.errorMessage = err.error?.message || err.message || 'Failed to join group. Please try again.';
    }
  }

  onDecline() {
    // Go back to groups list
    this.router.navigate(['/groups']);
  }
}
