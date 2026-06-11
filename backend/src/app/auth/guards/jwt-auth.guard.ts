import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  override handleRequest(err: any, user: any, info: any) {
    if (err || !user) {
      if (info && info.name === 'TokenExpiredError') {
        throw new UnauthorizedException('Token expired');
      }
      if (!info || info.message === 'No auth token' || String(info.message).toLowerCase().includes('missing')) {
        throw new UnauthorizedException('Missing token');
      }
      throw new UnauthorizedException(info?.message || 'Invalid token');
    }
    return user;
  }
}
