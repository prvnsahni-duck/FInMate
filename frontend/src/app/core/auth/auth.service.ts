import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  CurrentUserResponse,
  LoginDto,
  LoginResponse,
  RefreshTokenResponse,
  RegisterDto,
  RegisterResponse,
  UpdateProfileDto,
} from '@finmate/data-models';
import { ClientEncryptionService } from '../services/encryption.service';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private http = inject(HttpClient);
  private baseUrl = `${environment.apiBaseUrl}/auth`;
  private encryptionService = inject(ClientEncryptionService);

  login(credentials: LoginDto): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(`${this.baseUrl}/login`, credentials);
  }

  register(data: RegisterDto): Observable<RegisterResponse> {
    return this.http.post<RegisterResponse>(`${this.baseUrl}/register`, data);
  }

  logout(refreshToken: string): Observable<void> {
    this.encryptionService.clearKey();
    return this.http.post<void>(`${this.baseUrl}/logout`, { refreshToken });
  }

  refresh(refreshToken: string): Observable<RefreshTokenResponse> {
    return this.http.post<RefreshTokenResponse>(`${this.baseUrl}/refresh`, {
      refreshToken,
    });
  }

  getMe(): Observable<CurrentUserResponse> {
    return this.http.get<CurrentUserResponse>(
      `${environment.apiBaseUrl}/users/me`,
    );
  }

  updateProfile(
    profileData: UpdateProfileDto,
  ): Observable<CurrentUserResponse> {
    return this.http.patch<CurrentUserResponse>(
      `${environment.apiBaseUrl}/users/me`,
      profileData,
    );
  }
}
