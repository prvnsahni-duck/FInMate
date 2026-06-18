import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class FriendsService {
  private http = inject(HttpClient);

  /**
   * Fetch aggregated friends balances.
   */
  getFriends(): Observable<any[]> {
    return this.http.get<any[]>('/api/friends');
  }

  /**
   * Search for users by email, username, or phone number.
   */
  searchUsers(query: string): Observable<any[]> {
    return this.http.get<any[]>(`/api/users/search?query=${encodeURIComponent(query)}`);
  }
}
