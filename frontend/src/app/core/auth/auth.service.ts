import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { RegisterDto, LoginDto } from '@finmate/data-models';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private http = inject(HttpClient);
  private baseUrl = '/api/auth';

  login(credentials: LoginDto): Observable<{ accessToken: string, refreshToken: string, user: any }> {
    return this.http.post<any>(`${this.baseUrl}/login`, credentials);
  }

  register(data: RegisterDto): Observable<any> {
    return this.http.post<any>(`${this.baseUrl}/register`, data);
  }

  logout(refreshToken: string): Observable<void> {
    return this.http.post<void>(`${this.baseUrl}/logout`, { refreshToken });
  }

  refresh(refreshToken: string): Observable<{ accessToken: string; refreshToken: string }> {
    return this.http.post<{ accessToken: string; refreshToken: string }>(`${this.baseUrl}/refresh`, { refreshToken });
  }

  getMe(): Observable<{ user: any; profile: any }> {
    return this.http.get<{ user: any; profile: any }>('/api/users/me');
  }

  updateProfile(profileData: any): Observable<{ user: any; profile: any }> {
    return this.http.patch<{ user: any; profile: any }>('/api/users/me', profileData);
  }
}
