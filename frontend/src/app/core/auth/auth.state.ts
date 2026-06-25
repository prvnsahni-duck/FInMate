import { Injectable, inject } from '@angular/core';
import { State, Action, StateContext, Selector } from '@ngxs/store';
import { jwtDecode } from 'jwt-decode';
import { AuthService } from './auth.service';
import { tap } from 'rxjs/operators';
import {
  JwtPayload,
  LoginDto,
  LoginResponse,
  RegisterDto,
} from '@finmate/data-models';
import { ClientEncryptionService } from '../services/encryption.service';

export class Login {
  static readonly type = '[Auth] Login';
  constructor(public payload: LoginDto) {}
}

export class Register {
  static readonly type = '[Auth] Register';
  constructor(public payload: RegisterDto) {}
}

export class Logout {
  static readonly type = '[Auth] Logout';
}

export class RefreshTokenSuccess {
  static readonly type = '[Auth] Refresh Token Success';
  constructor(
    public accessToken: string,
    public refreshToken?: string,
  ) {}
}

export interface AuthStateModel {
  token: string | null;
  refreshToken: string | null;
  user: JwtPayload | null;
}

@State<AuthStateModel>({
  name: 'auth',
  defaults: {
    token: localStorage.getItem('finmate_token'),
    refreshToken: localStorage.getItem('finmate_refresh_token'),
    user: localStorage.getItem('finmate_token')
      ? jwtDecode<JwtPayload>(localStorage.getItem('finmate_token') as string)
      : null,
  },
})
@Injectable()
export class AuthState {
  private authService = inject(AuthService);
  private encryptionService = inject(ClientEncryptionService);

  @Selector()
  static isAuthenticated(state: AuthStateModel): boolean {
    return !!state.token;
  }

  @Selector()
  static getUser(state: AuthStateModel): JwtPayload | null {
    return state.user;
  }

  @Action(Login)
  login(ctx: StateContext<AuthStateModel>, action: Login) {
    return this.authService.login(action.payload).pipe(
      tap((result: LoginResponse) => {
        localStorage.setItem('finmate_token', result.accessToken);
        if (result.refreshToken) {
          localStorage.setItem('finmate_refresh_token', result.refreshToken);
        }
        ctx.patchState({
          token: result.accessToken,
          refreshToken: result.refreshToken,
          user: jwtDecode<JwtPayload>(result.accessToken),
        });

        // Derive and store key client-side asynchronously
        this.encryptionService
          .deriveAndStoreKey(action.payload.password, action.payload.email)
          .catch((err) => {
            console.error('Failed to derive master key on login', err);
          });
      }),
    );
  }

  @Action(Register)
  register(ctx: StateContext<AuthStateModel>, action: Register) {
    return this.authService.register(action.payload);
  }

  @Action(Logout)
  logout(ctx: StateContext<AuthStateModel>) {
    const state = ctx.getState();
    const logout$ = state.refreshToken
      ? this.authService.logout(state.refreshToken)
      : null;

    if (state.user?.email) {
      this.encryptionService.clearKey(state.user.email);
    }

    // Clear local storage and state regardless of API success to ensure client safety
    localStorage.removeItem('finmate_token');
    localStorage.removeItem('finmate_refresh_token');
    ctx.setState({
      token: null,
      refreshToken: null,
      user: null,
    });

    return logout$;
  }

  @Action(RefreshTokenSuccess)
  refreshTokenSuccess(
    ctx: StateContext<AuthStateModel>,
    action: RefreshTokenSuccess,
  ) {
    localStorage.setItem('finmate_token', action.accessToken);
    if (action.refreshToken) {
      localStorage.setItem('finmate_refresh_token', action.refreshToken);
    }
    ctx.patchState({
      token: action.accessToken,
      refreshToken: action.refreshToken || ctx.getState().refreshToken,
      user: jwtDecode<JwtPayload>(action.accessToken),
    });
  }
}
