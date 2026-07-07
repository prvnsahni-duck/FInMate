import { Injectable, inject } from '@angular/core';
import { State, Action, StateContext, Selector } from '@ngxs/store';
import { jwtDecode } from 'jwt-decode';
import { AuthService } from './auth.service';
import { from } from 'rxjs';
import { mergeMap, tap } from 'rxjs/operators';
import {
  JwtPayload,
  LoginDto,
  LoginResponse,
  RegisterDto,
} from '@finmate/data-models';
import { ClientEncryptionService } from '../services/encryption.service';
import { GroupKeyService } from '../services/group-key.service';

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

export class SetPersistenceWarning {
  static readonly type = '[Auth] Set Persistence Warning';
  constructor(public payload: string | null) {}
}

export interface AuthStateModel {
  token: string | null;
  refreshToken: string | null;
  user: JwtPayload | null;
  persistenceWarning: string | null;
}

@State<AuthStateModel>({
  name: 'auth',
  defaults: {
    token: localStorage.getItem('finmate_token'),
    refreshToken: localStorage.getItem('finmate_refresh_token'),
    user: localStorage.getItem('finmate_token')
      ? jwtDecode<JwtPayload>(localStorage.getItem('finmate_token') as string)
      : null,
    persistenceWarning: null,
  },
})
@Injectable()
export class AuthState {
  private authService = inject(AuthService);
  private encryptionService = inject(ClientEncryptionService);
  private groupKeyService = inject(GroupKeyService);

  @Selector()
  static isAuthenticated(state: AuthStateModel): boolean {
    return !!state.token;
  }

  @Selector()
  static getUser(state: AuthStateModel): JwtPayload | null {
    return state.user;
  }

  @Selector()
  static getPersistenceWarning(state: AuthStateModel): string | null {
    return state.persistenceWarning;
  }

  @Action(Login)
  login(ctx: StateContext<AuthStateModel>, action: Login) {
    return this.authService.login(action.payload).pipe(
      mergeMap((result: LoginResponse) => {
        localStorage.setItem('finmate_token', result.accessToken);
        if (result.refreshToken) {
          localStorage.setItem('finmate_refresh_token', result.refreshToken);
        }
        ctx.patchState({
          token: result.accessToken,
          refreshToken: result.refreshToken,
          user: jwtDecode<JwtPayload>(result.accessToken),
        });

        // Derive and store key, blocking navigation until complete
        return from(
          this.encryptionService.deriveAndStoreKey(
            action.payload.password,
            action.payload.email,
          ),
        ).pipe(
          mergeMap(async (res) => {
            if (!res.persisted) {
              ctx.dispatch(
                new SetPersistenceWarning(
                  "Secure key persistence is unavailable in your browser. Your encrypted data will remain accessible during this session, but you'll need to sign in again after refreshing or reopening the app.",
                ),
              );
            }
            try {
              await this.groupKeyService.getMyAsymmetricKeys();
            } catch (err) {
              console.error(
                'Failed to auto-provision asymmetric keys on login',
                err,
              );
            }
            return result;
          }),
        );
      }),
    );
  }

  @Action(SetPersistenceWarning)
  setPersistenceWarning(ctx: StateContext<AuthStateModel>, action: SetPersistenceWarning) {
    ctx.patchState({
      persistenceWarning: action.payload,
    });
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
      void this.encryptionService.clearKey(state.user.email);
    }
    void this.groupKeyService.clearPersistentCache();

    // Clear local storage and state regardless of API success to ensure client safety
    localStorage.removeItem('finmate_token');
    localStorage.removeItem('finmate_refresh_token');
    ctx.setState({
      token: null,
      refreshToken: null,
      user: null,
      persistenceWarning: null,
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
