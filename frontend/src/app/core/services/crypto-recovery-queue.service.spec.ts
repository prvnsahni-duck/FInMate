import { TestBed } from '@angular/core/testing';
import { Store } from '@ngxs/store';
import { CryptoRecoveryQueueService } from './crypto-recovery-queue.service';
import { CryptoSessionManager } from './crypto-session-manager.service';
import { ClientEncryptionService } from './encryption.service';
import { GroupKeyService } from './group-key.service';

describe('CryptoRecoveryQueueService', () => {
  let service: CryptoRecoveryQueueService;
  let cryptoSession: CryptoSessionManager;
  let mockEncryption: { loadKeyFromSession: jest.Mock };

  beforeEach(() => {
    mockEncryption = { loadKeyFromSession: jest.fn().mockResolvedValue(null) };

    TestBed.configureTestingModule({
      providers: [
        CryptoRecoveryQueueService,
        CryptoSessionManager,
        {
          provide: Store,
          useValue: {
            selectSnapshot: jest
              .fn()
              .mockReturnValue({ email: 'test@example.com' }),
          },
        },
        { provide: ClientEncryptionService, useValue: mockEncryption },
        {
          provide: GroupKeyService,
          useValue: { resolveGroupKey: jest.fn(), clearCache: jest.fn() },
        },
      ],
    });

    service = TestBed.inject(CryptoRecoveryQueueService);
    cryptoSession = TestBed.inject(CryptoSessionManager);
  });

  /**
   * runWithRecovery's catch block awaits a fresh ensureCryptoContext() check
   * (itself several microtask ticks deep: loadKeyFromSession, then
   * handleRecoverableFailure's internal await) before it enqueues — so a
   * fixed count of `await Promise.resolve()` is fragile. Flush generously
   * instead of guessing the exact tick count.
   */
  async function flushMicrotasks(times = 15): Promise<void> {
    for (let i = 0; i < times; i++) {
      await Promise.resolve();
    }
  }

  it('runs the operation immediately and returns its result when the session is already Ready', async () => {
    mockEncryption.loadKeyFromSession.mockResolvedValue({});
    await cryptoSession.ensureCryptoContext();

    const op = jest.fn().mockResolvedValue('done');
    const result = await service.runWithRecovery(op);

    expect(result).toBe('done');
    expect(op).toHaveBeenCalledTimes(1);
  });

  it('re-throws immediately, without queueing, when the failure happens while the session is already Ready (a real, unrelated error)', async () => {
    mockEncryption.loadKeyFromSession.mockResolvedValue({});
    await cryptoSession.ensureCryptoContext();

    const op = jest.fn().mockRejectedValue(new Error('network error'));
    await expect(service.runWithRecovery(op)).rejects.toThrow(
      'network error',
    );
    expect(service.pendingCount).toBe(0);
  });

  it('queues the operation on a crypto-related failure and auto-resumes once the session becomes Ready', async () => {
    // Session starts NoSession (no ensureCryptoContext call yet).
    const op = jest.fn().mockRejectedValueOnce(new Error('no session'));
    // The queued retry should succeed once the session is Ready.
    op.mockResolvedValueOnce('resumed');

    const resultPromise = service.runWithRecovery(op);
    // Give the initial (failing) attempt time to run, get authoritatively
    // re-checked against the session, and enqueue.
    await flushMicrotasks();
    expect(service.pendingCount).toBe(1);
    expect(op).toHaveBeenCalledTimes(1);

    mockEncryption.loadKeyFromSession.mockResolvedValue({});
    await cryptoSession.ensureCryptoContext();

    const result = await resultPromise;
    expect(result).toBe('resumed');
    expect(op).toHaveBeenCalledTimes(2);
    expect(service.pendingCount).toBe(0);
  });

  it('resumes multiple concurrently-queued operations together on the same Ready transition', async () => {
    const opA = jest
      .fn()
      .mockRejectedValueOnce(new Error('no session'))
      .mockResolvedValueOnce('A done');
    const opB = jest
      .fn()
      .mockRejectedValueOnce(new Error('no session'))
      .mockResolvedValueOnce('B done');

    const promiseA = service.runWithRecovery(opA);
    const promiseB = service.runWithRecovery(opB);
    await flushMicrotasks();
    expect(service.pendingCount).toBe(2);

    mockEncryption.loadKeyFromSession.mockResolvedValue({});
    await cryptoSession.ensureCryptoContext();

    const [resultA, resultB] = await Promise.all([promiseA, promiseB]);
    expect(resultA).toBe('A done');
    expect(resultB).toBe('B done');
  });

  it('does not retry in a loop if the resumed attempt fails again', async () => {
    const op = jest
      .fn()
      .mockRejectedValueOnce(new Error('no session'))
      .mockRejectedValueOnce(new Error('still broken'));

    const resultPromise = service.runWithRecovery(op);
    await Promise.resolve();
    await Promise.resolve();

    mockEncryption.loadKeyFromSession.mockResolvedValue({});
    await cryptoSession.ensureCryptoContext();

    await expect(resultPromise).rejects.toThrow('still broken');
    expect(op).toHaveBeenCalledTimes(2);
    expect(service.pendingCount).toBe(0);
  });
});
