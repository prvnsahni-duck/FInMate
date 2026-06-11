import { Injectable, CanActivate, ExecutionContext, BadRequestException, ForbiddenException } from '@nestjs/common';
import { verifyTotp } from '../utils/totp.util';

@Injectable()
export class MfaGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    // Check if 2FA is active (enabled) for this user
    if (user && user.isTwoFactorEnabled) {
      const mfaCode = request.headers['x-mfa-code'] as string | undefined;

      if (!mfaCode) {
        throw new ForbiddenException({
          errorCode: 'AUTH_MFA_REQUIRED',
          message: 'MFA verification required',
        });
      }

      const isValid = verifyTotp(user.twoFactorSecret, mfaCode);
      if (!isValid) {
        throw new BadRequestException({
          errorCode: 'AUTH_MFA_INVALID',
          message: 'Invalid 2FA code',
        });
      }
    }

    return true;
  }
}
