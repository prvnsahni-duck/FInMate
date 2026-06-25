import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { FriendBalanceResponse, UserSearchResult } from '@finmate/data-models';

@Injectable({
  providedIn: 'root',
})
export class FriendsService {
  private http = inject(HttpClient);
  private baseUrl = environment.apiBaseUrl;

  /**
   * Fetch aggregated friends balances.
   */
  getFriends(): Observable<FriendBalanceResponse[]> {
    return this.http.get<FriendBalanceResponse[]>(`${this.baseUrl}/friends`);
  }

  /**
   * Search for users by email, username, or phone number.
   */
  searchUsers(query: string): Observable<UserSearchResult[]> {
    return this.http.get<UserSearchResult[]>(
      `${this.baseUrl}/users/search?query=${encodeURIComponent(query)}`,
    );
  }
}
