import { Test, TestingModule } from '@nestjs/testing';
import { ContactsController } from './contacts.controller';
import { ContactsService } from './contacts.service';

describe('ContactsController', () => {
  let controller: ContactsController;
  let mockContactsService: {
    listAddressBook: jest.Mock;
    findMergeCandidates: jest.Mock;
    mergeContacts: jest.Mock;
    getTimeline: jest.Mock;
  };

  beforeEach(async () => {
    mockContactsService = {
      listAddressBook: jest.fn(),
      findMergeCandidates: jest.fn(),
      mergeContacts: jest.fn(),
      getTimeline: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ContactsController],
      providers: [
        { provide: ContactsService, useValue: mockContactsService },
      ],
    }).compile();

    controller = module.get<ContactsController>(ContactsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('listContacts (GET /contacts)', () => {
    it('delegates to ContactsService.listAddressBook with the authenticated user id', async () => {
      const entries = [
        {
          contactId: 'contact-1',
          displayName: 'Alice',
          email: 'alice@x.com',
          phoneNumber: null,
          sharedGroups: [{ groupId: 'g1', groupName: 'Group One' }],
        },
      ];
      mockContactsService.listAddressBook.mockResolvedValue(entries);

      const req = { user: { id: 'caller-id' } };
      const result = await controller.listContacts(req as any);

      expect(mockContactsService.listAddressBook).toHaveBeenCalledWith(
        'caller-id',
      );
      expect(result.success).toBe(true);
      expect(result.message).toBe('Contacts retrieved successfully');
      expect(result.data).toEqual(entries);
    });

    it('propagates an empty list unchanged', async () => {
      mockContactsService.listAddressBook.mockResolvedValue([]);

      const req = { user: { id: 'caller-id' } };
      const result = await controller.listContacts(req as any);

      expect(result.data).toEqual([]);
    });
  });

  describe('getTimeline (GET /contacts/:id/timeline)', () => {
    it('delegates to ContactsService.getTimeline with the authenticated user id, contact id, and pagination', async () => {
      const paginated = {
        data: [
          {
            id: 'log-1',
            action: 'contact.created',
            actorUserId: 'u1',
            actorDisplayName: 'Alice',
            metadata: null,
            createdAt: new Date('2026-01-01'),
          },
        ],
        meta: {
          totalItems: 1,
          itemCount: 1,
          itemsPerPage: 20,
          totalPages: 1,
          currentPage: 1,
        },
        links: { first: '', previous: null, next: null, last: '' },
      };
      mockContactsService.getTimeline.mockResolvedValue(paginated);

      const req = { user: { id: 'caller-id' } };
      const result = await controller.getTimeline(
        'contact-1',
        1,
        20,
        req as any,
      );

      expect(mockContactsService.getTimeline).toHaveBeenCalledWith(
        'caller-id',
        'contact-1',
        1,
        20,
      );
      expect(result.success).toBe(true);
      expect(result.message).toBe('Contact timeline retrieved successfully');
      expect(result.data).toEqual(paginated);
    });
  });
});
