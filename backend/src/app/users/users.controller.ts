import { Controller, Get, Patch, Body, UseGuards, Req, NotFoundException } from '@nestjs/common';
import { UpdateProfileDto } from '@finmate/data-models';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

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
      displayName: user.displayName,
      status: user.status,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}
