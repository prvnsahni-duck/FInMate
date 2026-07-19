import {
  IsString,
  IsNotEmpty,
  IsUUID,
  IsArray,
  ValidateNested,
  IsOptional,
  IsIn,
  MinLength,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Supported wrapping methods for the group data key.
 *
 * - 'AES-KW'   : symmetric wrap using the member's AES master key (iv:ciphertext format)
 * - 'RSA-OAEP' : asymmetric wrap using the member's RSA-OAEP public wrapping key (base64url)
 */
export type WrappingMethod = 'AES-KW' | 'RSA-OAEP';

/**
 * A single wrapped-key entry for provisioning a group data key to one member.
 *
 * Length bounds:
 *  - AES-KW (symmetric):  iv (16B) + : (1B) + ciphertext (32-64B) ≈ 66–110 chars base64url
 *  - RSA-OAEP 2048:       256 raw bytes → ~344 chars base64url
 *  - Upper bound 1 KB to reject obviously malformed payloads.
 */
export class WrappedKeyEntryDto {
  @IsUUID('4', { message: 'userId must be a valid UUID v4' })
  @IsNotEmpty({ message: 'userId is required' })
  userId!: string;

  @IsString({ message: 'wrappedKey must be a string' })
  @IsNotEmpty({ message: 'wrappedKey is required' })
  @MinLength(32, {
    message: 'wrappedKey is too short to be a valid wrapped key',
  })
  @MaxLength(1024, { message: 'wrappedKey exceeds the maximum allowed length' })
  wrappedKey!: string;

  @IsString({ message: 'wrappingMethod must be a string' })
  @IsIn(['AES-KW', 'RSA-OAEP'], {
    message: 'wrappingMethod must be one of: AES-KW, RSA-OAEP',
  })
  @IsOptional()
  wrappingMethod?: WrappingMethod;
}

/** Request body for provisioning group data keys for one or more members. */
export class ProvisionGroupKeysDto {
  @IsArray({ message: 'keys must be an array' })
  @ValidateNested({ each: true })
  @Type(() => WrappedKeyEntryDto)
  keys!: WrappedKeyEntryDto[];
}

/** Response for a single user's wrapped group key. */
export interface WrappedGroupKeyResponse {
  groupId: string;
  groupKeyVersionId?: string | null;
  groupKeyVersion?: number | null;
  userId: string;
  wrappedKey: string;
}

export class RotateGroupKeyDto {
  @IsArray({ message: 'keys must be an array' })
  @ValidateNested({ each: true })
  @Type(() => WrappedKeyEntryDto)
  keys!: WrappedKeyEntryDto[];

  @IsString({ message: 'reason must be a string' })
  @IsOptional()
  @MaxLength(255, { message: 'reason cannot exceed 255 characters' })
  reason?: string;
}

export interface RotateGroupKeyResponse {
  groupId: string;
  groupKeyVersionId: string;
  groupKeyVersion: number;
  status: 'ACTIVE';
}
