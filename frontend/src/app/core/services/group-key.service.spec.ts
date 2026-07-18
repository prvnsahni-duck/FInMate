import { TestBed } from '@angular/core/testing';
import {
  HttpClientTestingModule,
  HttpTestingController,
} from '@angular/common/http/testing';
import { Store } from '@ngxs/store';
import { ClientEncryptionService } from './encryption.service';
import { GroupKeyService } from './group-key.service';
import { ZkKeyVaultService } from './zk-key-vault.service';

describe('GroupKeyService', () => {
  let service: GroupKeyService;
  let httpMock: HttpTestingController;
  let encryptionService: jest.Mocked<ClientEncryptionService>;

  const masterKey = 'master-key' as unknown as CryptoKey;
  const groupKey = 'group-key' as unknown as CryptoKey;

  beforeEach(() => {
    const encryptionSpy = {
      loadKeyFromSession: jest.fn().mockResolvedValue(masterKey),
      unwrapKey: jest.fn().mockResolvedValue(groupKey),
    };

    const vaultSpy = {
      loadGroupKey: jest.fn().mockResolvedValue(null),
      storeGroupKey: jest.fn().mockResolvedValue(undefined),
      deleteGroupKey: jest.fn().mockResolvedValue(undefined),
    };

    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        GroupKeyService,
        { provide: ClientEncryptionService, useValue: encryptionSpy },
        { provide: ZkKeyVaultService, useValue: vaultSpy },
        {
          provide: Store,
          useValue: {
            selectSnapshot: jest.fn().mockReturnValue({
              email: 'test@finmate.local',
              userId: 'user-1',
            }),
          },
        },
      ],
    });

    service = TestBed.inject(GroupKeyService);
    httpMock = TestBed.inject(HttpTestingController);
    encryptionService = TestBed.inject(
      ClientEncryptionService,
    ) as jest.Mocked<ClientEncryptionService>;
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('returns key and version id from an interceptor-unwrapped group key response', async () => {
    const promise = service.getGroupKeyForEncryption('group-1');
    await new Promise((resolve) => setTimeout(resolve, 0));

    const req = httpMock.expectOne('/api/groups/group-1/keys/me');
    expect(req.request.method).toBe('GET');
    req.flush({
      wrappedKey: 'wrapped:key',
      groupKeyVersionId: '11111111-1111-4111-8111-111111111111',
      hasActiveKeys: true,
    });

    await expect(promise).resolves.toEqual({
      key: groupKey,
      versionId: '11111111-1111-4111-8111-111111111111',
    });
    expect(encryptionService.unwrapKey).toHaveBeenCalledWith(
      'wrapped:key',
      masterKey,
    );
  });
});
