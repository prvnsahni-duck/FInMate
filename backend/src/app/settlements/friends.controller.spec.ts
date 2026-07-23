import { Test, TestingModule } from '@nestjs/testing';
import { FriendsController } from './friends.controller';
import { SettlementsService } from './settlements.service';

describe('FriendsController', () => {
  let controller: FriendsController;
  let mockSettlementsService: { calculateFriendsBalances: jest.Mock };

  beforeEach(async () => {
    mockSettlementsService = {
      calculateFriendsBalances: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [FriendsController],
      providers: [
        { provide: SettlementsService, useValue: mockSettlementsService },
      ],
    }).compile();

    controller = module.get<FriendsController>(FriendsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('delegates to SettlementsService.calculateFriendsBalances with the authenticated user id', async () => {
    const friends = [
      {
        friendId: 'user-friend_USD',
        displayName: 'Friend One (USD)',
        email: 'friend@x.com',
        netBalance: 30,
        currencyDetails: [],
      },
    ];
    mockSettlementsService.calculateFriendsBalances.mockResolvedValue(friends);

    const req = { user: { id: 'caller-id' } };
    const result = await controller.getFriendsBalances(req as any);

    expect(
      mockSettlementsService.calculateFriendsBalances,
    ).toHaveBeenCalledWith('caller-id');
    expect(result.success).toBe(true);
    expect(result.message).toBe('Friends balances calculated successfully');
    expect(result.data).toEqual(friends);
  });

  it('propagates an empty list unchanged (no active memberships / all balances settled)', async () => {
    mockSettlementsService.calculateFriendsBalances.mockResolvedValue([]);

    const req = { user: { id: 'caller-id' } };
    const result = await controller.getFriendsBalances(req as any);

    expect(result.data).toEqual([]);
  });
});
