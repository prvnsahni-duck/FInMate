import {
  Controller,
  Get,
  Patch,
  Delete,
  Body,
  UseGuards,
  Req,
  NotFoundException,
  BadRequestException,
  Query,
  Post,
  Param,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { UpdateProfileDto, SetRecoveryKeyDto } from '@finmate/data-models';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SuccessResponse } from '../common/response.util';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('lookup')
  async lookup(@Query('identifier') identifier: string) {
    if (!identifier) {
      throw new BadRequestException('identifier query parameter is required');
    }
    const user = await this.usersService.lookupUser(identifier);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return new SuccessResponse('User looked up successfully', {
      userId: user.id,
      publicWrappingKey: user.publicWrappingKey || null,
      displayName: user.displayName,
      email: user.email,
    });
  }

  @Get('search')
  async search(@Query('query') query: string, @Req() req: any) {
    const results = await this.usersService.searchUsers(
      query || '',
      req.user.id,
    );
    const serialized = results.map((user) => this.serializeUser(user));
    return new SuccessResponse('Users searched successfully', serialized);
  }

  @Get('me')
  async getMe(@Req() req: any) {
    const user = req.user;
    const profile = await this.usersService.findProfileByUserId(user.id);
    if (!profile) {
      throw new NotFoundException('Profile not found');
    }
    const data = {
      user: this.serializeUser(user),
      profile,
    };
    return new SuccessResponse(
      'Current user profile retrieved successfully',
      data,
    );
  }

  @Patch('me')
  async updateMe(@Body() updateProfileDto: UpdateProfileDto, @Req() req: any) {
    const result = await this.usersService.updateProfile(
      req.user.id,
      updateProfileDto,
    );
    const data = {
      user: this.serializeUser(result.user),
      profile: result.profile,
    };
    return new SuccessResponse('User profile updated successfully', data);
  }

  /**
   * Delete the caller's account (PII-only policy): anonymizes personal data,
   * revokes auth + keys, removes sessions; preserves financial history.
   */
  @Delete('me')
  @HttpCode(HttpStatus.OK)
  async deleteMe(@Req() req: any) {
    await this.usersService.deleteAccount(req.user.id);
    return new SuccessResponse('Account deleted successfully', {});
  }

  @Post('me/keys')
  async saveKeys(
    @Body()
    body: { publicWrappingKey: string; encryptedPrivateWrappingKey: string },
    @Req() req: any,
  ) {
    const result = await this.usersService.saveKeys(
      req.user.id,
      body.publicWrappingKey,
      body.encryptedPrivateWrappingKey,
    );
    return new SuccessResponse('Wrapping keys saved successfully', {
      id: result.id,
      publicWrappingKey: result.publicWrappingKey,
    });
  }

  @Get('me/keys')
  async getKeys(@Req() req: any) {
    const keys = await this.usersService.getKeys(req.user.id);
    return new SuccessResponse('Wrapping keys retrieved successfully', keys);
  }

  /** Store the client-produced recovery-wrapped key blob (zero-knowledge). */
  @Post('me/recovery-key')
  async setRecoveryKey(@Body() body: SetRecoveryKeyDto, @Req() req: any) {
    const result = await this.usersService.setRecoveryKey(
      req.user.id,
      body.recoveryWrappedKey,
    );
    return new SuccessResponse('Recovery key saved successfully', result);
  }

  /** Whether the caller has a recovery key configured. */
  @Get('me/recovery-key/status')
  async getRecoveryKeyStatus(@Req() req: any) {
    const result = await this.usersService.getRecoveryKeyStatus(req.user.id);
    return new SuccessResponse('Recovery key status retrieved', result);
  }

  @Get(':id/public-key')
  async getPublicKey(@Param('id', ParseUUIDPipe) id: string) {
    const publicWrappingKey = await this.usersService.getPublicWrappingKey(id);
    return new SuccessResponse('Public wrapping key retrieved successfully', {
      userId: id,
      publicWrappingKey,
    });
  }

  private serializeUser(user: any) {
    return {
      id: user.id,
      email: user.email,
      username: user.username,
      phoneNumber: user.phoneNumber,
      displayName: user.displayName,
      status: user.status,
      aiOptIn: user.aiOptIn,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}
