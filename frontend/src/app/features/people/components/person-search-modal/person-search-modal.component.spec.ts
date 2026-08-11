import { TestBed, ComponentFixture } from '@angular/core/testing';
import { of } from 'rxjs';
import { PersonSearchModalComponent } from './person-search-modal.component';
import { FriendsService } from '../../../friends/services/friends.service';
import { UserSearchResult } from '@finmate/data-models';

const results: UserSearchResult[] = [
  { id: 'u2', email: 'naveen@x.com', displayName: 'Naveen' },
  { id: 'me', email: 'me@x.com', displayName: 'Me' },
];

describe('PersonSearchModalComponent', () => {
  let fixture: ComponentFixture<PersonSearchModalComponent>;
  let component: PersonSearchModalComponent;
  let friends: { searchUsers: jest.Mock };

  async function setup() {
    friends = { searchUsers: jest.fn().mockReturnValue(of(results)) };
    await TestBed.configureTestingModule({
      imports: [PersonSearchModalComponent],
      providers: [{ provide: FriendsService, useValue: friends }],
    }).compileComponents();
    fixture = TestBed.createComponent(PersonSearchModalComponent);
    fixture.componentRef.setInput('excludeUserId', 'me');
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('does not search for queries shorter than 2 chars', async () => {
    await setup();
    component.query.setValue('a');
    jest.advanceTimersByTime(350);
    expect(friends.searchUsers).not.toHaveBeenCalled();
  });

  it('searches (debounced) and excludes the current user from results', async () => {
    await setup();
    component.query.setValue('nav');
    jest.advanceTimersByTime(350);
    expect(friends.searchUsers).toHaveBeenCalledWith('nav');
    expect(component.results().map((r) => r.id)).toEqual(['u2']);
  });

  it('emits the selected user', async () => {
    await setup();
    const picked = jest.fn();
    component.selected.subscribe(picked);
    component.pick(results[0]);
    expect(picked).toHaveBeenCalledWith(results[0]);
  });
});
