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
}
