import { TestBed, ComponentFixture } from '@angular/core/testing';
import { FriendsComponent } from './friends.component';
import { FriendsService } from '../../services/friends.service';
import { of, throwError } from 'rxjs';
import { provideRouter } from '@angular/router';

describe('FriendsComponent', () => {
  let component: FriendsComponent;
  let fixture: ComponentFixture<FriendsComponent>;
  let mockFriendsService: jest.Mocked<FriendsService>;

  const mockFriendsData = [
    {
      friendId: 'friend-1',
      displayName: 'Alice Cooper',
      email: 'alice@cooper.com',
      netBalance: 150,
      currencyDetails: [
        {
          groupId: 'group-1',
          groupName: 'Trip to Tokyo',
          amount: 150,
          currency: 'USD',
        },
      ],
    },
    {
      friendId: 'friend-2',
      displayName: 'Bob Dylan',
      email: 'bob@dylan.com',
      netBalance: -50,
      currencyDetails: [
        {
          groupId: 'group-1',
          groupName: 'Trip to Tokyo',
          amount: -50,
          currency: 'USD',
        },
      ],
    },
  ];

  beforeEach(async () => {
    mockFriendsService = {
      getFriends: jest.fn().mockReturnValue(of(mockFriendsData)),
      searchUsers: jest.fn(),
    } as any;

    await TestBed.configureTestingModule({
      imports: [FriendsComponent],
      providers: [
        { provide: FriendsService, useValue: mockFriendsService },
        provideRouter([]),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(FriendsComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should load friends and calculate summaries on init', () => {
    fixture.detectChanges(); // triggers ngOnInit

    expect(mockFriendsService.getFriends).toHaveBeenCalled();
    expect(component.isLoading).toBe(false);
    expect(component.friends.length).toBe(2);
    expect(component.totalOwed).toBe(150);
    expect(component.totalOwes).toBe(50);
    expect(component.netTotal).toBe(100);
  });

  it('should toggle expand state of a friend', () => {
    fixture.detectChanges();
    const friend = component.friends[0];
    expect(friend.isExpanded).toBeUndefined();

    component.toggleExpand(friend);
    expect(friend.isExpanded).toBe(true);

    component.toggleExpand(friend);
    expect(friend.isExpanded).toBe(false);
  });

  it('should handle error when fetching friends', () => {
    mockFriendsService.getFriends.mockReturnValue(
      throwError(() => new Error('Error fetching friends')),
    );
    fixture.detectChanges();

    expect(component.isLoading).toBe(false);
    expect(component.friends.length).toBe(0);
  });
});
