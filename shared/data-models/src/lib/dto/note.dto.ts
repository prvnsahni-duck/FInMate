import {
  IsString,
  IsNotEmpty,
  MaxLength,
  IsOptional,
  IsEnum,
  IsUUID,
  IsInt,
} from 'class-validator';
import { IsCiphertext } from './is-ciphertext.decorator';

export class CreateNoteDto {
  @IsString()
  @IsNotEmpty({ message: 'Note title is required' })
  @MaxLength(1000, { message: 'Note title cannot exceed 1000 characters' })
  @IsCiphertext({
    message: 'Note title could not be processed securely. Please try again.',
  })
  title!: string;

  @IsString()
  @IsNotEmpty({ message: 'Note body is required' })
  @IsCiphertext({
    message: 'Note body could not be processed securely. Please try again.',
  })
  body!: string;

  @IsEnum(['private', 'group'], { message: 'Invalid note visibility option' })
  @IsNotEmpty({ message: 'Note visibility option is required' })
  visibility!: 'private' | 'group';

  @IsUUID('4', { message: 'Group ID must be a valid UUID' })
  @IsOptional()
  groupId?: string;
}

export class UpdateNoteDto {
  @IsString()
  @IsOptional()
  @MaxLength(1000, { message: 'Note title cannot exceed 1000 characters' })
  @IsCiphertext({
    message: 'Note title could not be processed securely. Please try again.',
  })
  title?: string;

  @IsString()
  @IsOptional()
  @IsCiphertext({
    message: 'Note body could not be processed securely. Please try again.',
  })
  body?: string;

  @IsEnum(['private', 'group'], { message: 'Invalid note visibility option' })
  @IsOptional()
  visibility?: 'private' | 'group';

  @IsUUID('4', { message: 'Group ID must be a valid UUID' })
  @IsOptional()
  groupId?: string;

  @IsInt({ message: 'Version must be an integer' })
  @IsNotEmpty({ message: 'Version is required to resolve concurrent edits' })
  version!: number;
}
