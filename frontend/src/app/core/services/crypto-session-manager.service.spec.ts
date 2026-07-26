import { TestBed } from '@angular/core/testing';
import { Store } from '@ngxs/store';
import {
  CryptoSessionManager,
  CryptoSessionEndedError,
} from './crypto-session-manager.service';
import { ClientEncryptionService } from './encryption.service';
import { GroupKeyService } from './group-key.service';

describe('CryptoSessionManager', () => {
  let service: CryptoSessionManager;
  let mockStore: any;
  let mockEncryption: any;
  let mockGroupKeys: any;
  let currentUser: any;

  const mockMasterKey = {} as CryptoKey;
  const mockGroupKey = {} as CryptoKey;

  beforeEach(() => {
    currentUser = { userId: 'user-1', email: 'test@example.com' };

    mockStore = {
      selectSnapshot: jest.fn().mockImplementation(() => currentUser),
    };

    mockEncryption = {
      loadKeyFromSession: jest.fn().mockResolvedValue(mockMasterKey),
    };

    mockGroupKeys = {
      resolveGroupKey: jest
        .fn()
        .mockResolvedValue({ status: 'ready', key: mockGroupKey }),
      getGroupKeyForEncryption: jest
        .fn()
        .mockResolvedValue({ key: mockGroupKey, versionId: 'v1' }),
      clearCache: jest.fn(),
    };

    TestBed.configureTestingModule({
      providers: [
        CryptoSessionManager,
        { provide: Store, useValue: mockStore },
        { provide: ClientEncryptionService, useValue: mockEncryption },
        { provide: GroupKeyService, useValue: mockGroupKeys },
      ],
    });

    service = TestBed.inject(CryptoSessionManager);
  });

  describe('ensureCryptoContext', () => {
    it('throws and transitions to NoSession when there is no user', async () => {
      currentUser = null;

      await expect(service.ensureCryptoContext()).rejects.toThrow(
        'No crypto session is available',
      );
      expect(service.state()).toBe('NoSession');
    });

    it('resolves the context and transitions to Ready when the master key loads', async () => {
      const ctx = await service.ensureCryptoContext();

      expect(ctx.masterKey).toBe(mockMasterKey);
      expect(ctx.user).toBe(currentUser);
      expect(service.state()).toBe('Ready');
    });

    it('throws when the master key is not loaded and records a recovery attempt', async () => {
      mockEncryption.loadKeyFromSession.mockResolvedValue(null);

      await expect(service.ensureCryptoContext()).rejects.toThrow(
        'Secure session is not ready',
      );
      // no_master_key recovery resolves synchronously to NoSession.
      expect(service.state()).toBe('NoSession');
    });
  });

  describe('ensureGroupKey — read path', () => {
    it('passes through the classified status from resolveGroupKey unchanged', async () => {
      mockGroupKeys.resolveGroupKey.mockResolvedValue({ status: 'no_access' });

      const result = await service.ensureGroupKey('group-1', 'read');

      expect(result.status).toBe('no_access');
      expect(mockGroupKeys.resolveGroupKey).toHaveBeenCalledWith(
        'group-1',
        undefined,
      );
    });
  });

  describe('ensureGroupKey — write path', () => {
    it('uses the fast path and does not call resolveGroupKey when ready', async () => {
      const result = await service.ensureGroupKey('group-1', 'write');

      expect(result).toEqual({
        status: 'ready',
        key: mockGroupKey,
        versionId: 'v1',
      });
      expect(mockGroupKeys.resolveGroupKey).not.toHaveBeenCalled();
    });

    it('regression: preserves the real classified status on fast-path failure instead of collapsing to pending', async () => {
      mockGroupKeys.getGroupKeyForEncryption.mockResolvedValue(null);
      mockGroupKeys.resolveGroupKey.mockResolvedValue({
        status: 'no_access',
      });

      const result = await service.ensureGroupKey('group-1', 'write');

      expect(result.status).toBe('no_access');
      expect(mockGroupKeys.resolveGroupKey).toHaveBeenCalledWith('group-1');
    });

    it('regression: rate_limited on the fast-path failure is not reported as pending', async () => {
      mockGroupKeys.getGroupKeyForEncryption.mockResolvedValue(null);
      mockGroupKeys.resolveGroupKey.mockResolvedValue({
        status: 'rate_limited',
      });

      const result = await service.ensureGroupKey('group-1', 'write');

      expect(result.status).toBe('rate_limited');
    });
  });

  describe('epoch cancellation', () => {
    it('assertCurrentEpoch throws CryptoSessionEndedError once the epoch has moved on', async () => {
      const ctx = await service.ensureCryptoContext();

      service.beginLogout();

      expect(() => service.assertCurrentEpoch(ctx.epoch)).toThrow(
        CryptoSessionEndedError,
      );
    });

    it('assertCurrentEpoch does not throw for the current epoch', async () => {
      const ctx = await service.ensureCryptoContext();

      expect(() => service.assertCurrentEpoch(ctx.epoch)).not.toThrow();
    });
  });

  describe('beginLogout', () => {
    it('increments the epoch and transitions to NoSession', async () => {
      await service.ensureCryptoContext();
      const epochBefore = service.epoch();

      service.beginLogout();

      expect(service.epoch()).toBe(epochBefore + 1);
      expect(service.state()).toBe('NoSession');
    });

    it('clears the group key cache via broadcast handling on other tabs is not required locally, but local state resets', async () => {
      await service.ensureCryptoContext();

      service.beginLogout();

      expect(service.recoveryBlockedReason()).toBeNull();
      expect(service.fatalReason()).toBeNull();
    });
  });

  describe('recovery escalation', () => {
    it('allows two silent attempts then escalates to RecoveringBlocked on the third', async () => {
      const scope = {
        userId: 'user-1',
        groupId: 'group-1',
        operationType: 'group_key_read',
        failureClass: 'pending',
      };

      const first = await service.handleRecoverableFailure(scope);
      const second = await service.handleRecoverableFailure(scope);
      const third = await service.handleRecoverableFailure(scope);

      expect(first).not.toBe('RecoveringBlocked');
      expect(second).not.toBe('RecoveringBlocked');
      expect(third).toBe('RecoveringBlocked');
      expect(service.state()).toBe('RecoveringBlocked');
      expect(service.recoveryBlockedReason()).toBe('group_key_read:pending');
    });

    it('tracks distinct scopes independently', async () => {
      const scopeA = {
        operationType: 'group_key_read',
        failureClass: 'pending',
        groupId: 'group-a',
      };
      const scopeB = {
        operationType: 'group_key_read',
        failureClass: 'pending',
        groupId: 'group-b',
      };

      await service.handleRecoverableFailure(scopeA);
      await service.handleRecoverableFailure(scopeA);
      const resultB = await service.handleRecoverableFailure(scopeB);

      expect(resultB).not.toBe('RecoveringBlocked');
    });
  });

  describe('markFatal', () => {
    it('transitions to Fatal and is sticky against further non-logout transitions', async () => {
      service.markFatal('decrypt_integrity_failure');

      expect(service.state()).toBe('Fatal');
      expect(service.fatalReason()).toBe('decrypt_integrity_failure');

      // A subsequent successful context resolution must not silently clear
      // Fatal — only an explicit logout may.
      await service.ensureCryptoContext();
      expect(service.state()).toBe('Fatal');
    });

    it('beginLogout can clear a Fatal state', async () => {
      service.markFatal('decrypt_integrity_failure');

      service.beginLogout();

      expect(service.state()).toBe('NoSession');
      expect(service.fatalReason()).toBeNull();
    });
  });

  describe('handleBroadcast — cross-tab crypto-session-ready recovery', () => {
    it('re-attempts ensureCryptoContext when another tab reports ready and this tab is not Ready', async () => {
      expect(service.state()).toBe('NoSession');

      (service as any).handleBroadcast({
        type: 'crypto-session-ready',
        epoch: 0,
      });
      await Promise.resolve();
      await Promise.resolve();

      expect(mockEncryption.loadKeyFromSession).toHaveBeenCalled();
    });

    it('does nothing when this tab is already Ready (no redundant retry)', async () => {
      await service.ensureCryptoContext();
      expect(service.state()).toBe('Ready');
      mockEncryption.loadKeyFromSession.mockClear();

      (service as any).handleBroadcast({
        type: 'crypto-session-ready',
        epoch: 0,
      });
      await Promise.resolve();

      expect(mockEncryption.loadKeyFromSession).not.toHaveBeenCalled();
    });

    it('recovers a tab stuck in NoSession once the master key becomes available', async () => {
      mockEncryption.loadKeyFromSession.mockResolvedValueOnce(null);
      await expect(service.ensureCryptoContext()).rejects.toThrow();
      expect(service.state()).toBe('NoSession');

      // The key becomes available (e.g. another tab persisted it to the
      // shared IndexedDB vault) before the broadcast is handled.
      mockEncryption.loadKeyFromSession.mockResolvedValue(mockMasterKey);

      (service as any).handleBroadcast({
        type: 'crypto-session-ready',
        epoch: 0,
      });
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      expect(service.state()).toBe('Ready');
    });
  });
});
