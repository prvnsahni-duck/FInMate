import { Controller, Get, Patch, Body, UseGuards, Req, NotFoundException, Query } from '@nestjs/common';
import { UpdateProfileDto } from '@finmate/data-models';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('search')
  async search(@Query('query') query: string, @Req() req: any) {
    const results = await this.usersService.searchUsers(query || '', req.user.id);
    return results.map(user => this.serializeUser(user));
  }

  @Get('me')
  async getMe(@Req() req: any) {
    const user = req.user;
    const profile = await this.usersService.findProfileByUserId(user.id);
    if (!profile) {
      throw new NotFoundException('Profile not found');
    }
    return {
      user: this.serializeUser(user),
      profile,
    };
  }

  @Patch('me')
  async updateMe(@Body() updateProfileDto: UpdateProfileDto, @Req() req: any) {
    const result = await this.usersService.updateProfile(req.user.id, updateProfileDto);
    return {
      user: this.serializeUser(result.user),
      profile: result.profile,
    };
  }

  private serializeUser(user: any) {
    return {
      id: user.id,
      email: user.email,
      username: user.username,
      phoneNumber: user.phoneNumber,
      displayName: user.displayName,
      status: user.status,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}
