import { Injectable, inject } from '@angular/core';
import { State, Action, StateContext, Selector } from '@ngxs/store';
import { jwtDecode } from 'jwt-decode';
import { AuthService } from '../services/auth.service';
import { tap } from 'rxjs/operators';
import { LoginDto, RegisterDto } from '@finmate/data-models';

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

export interface AuthStateModel {
  token: string | null;
  refreshToken: string | null;
  user: any | null;
}

@State<AuthStateModel>({
  name: 'auth',
  defaults: {
    token: localStorage.getItem('finmate_token'),
    refreshToken: localStorage.getItem('finmate_refresh_token'),
    user: localStorage.getItem('finmate_token') ? jwtDecode(localStorage.getItem('finmate_token') as string) : null
  }
})
@Injectable()
export class AuthState {
  private authService = inject(AuthService);

  @Selector()
  static isAuthenticated(state: AuthStateModel): boolean {
    return !!state.token;
  }

  @Selector()
  static getUser(state: AuthStateModel): any {
    return state.user;
  }

  @Action(Login)
  login(ctx: StateContext<AuthStateModel>, action: Login) {
    return this.authService.login(action.payload).pipe(
      tap((result: any) => {
        localStorage.setItem('finmate_token', result.accessToken);
        if (result.refreshToken) {
          localStorage.setItem('finmate_refresh_token', result.refreshToken);
        }
        ctx.patchState({
          token: result.accessToken,
          refreshToken: result.refreshToken,
          user: jwtDecode(result.accessToken)
        });
      })
    );
  }

  @Action(Register)
  register(ctx: StateContext<AuthStateModel>, action: Register) {
    return this.authService.register(action.payload);
  }

  @Action(Logout)
  logout(ctx: StateContext<AuthStateModel>) {
    const state = ctx.getState();
    const logout$ = state.refreshToken ? this.authService.logout(state.refreshToken) : null;
    
    // Clear local storage and state regardless of API success to ensure client safety
    localStorage.removeItem('finmate_token');
    localStorage.removeItem('finmate_refresh_token');
    ctx.setState({
      token: null,
      refreshToken: null,
      user: null
    });

    return logout$;
  }
}
