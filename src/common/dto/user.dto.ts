import { IsEmail, IsString, MinLength, IsEnum, IsOptional, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum UserRole {
  BUYER = 'buyer',
  SELLER = 'seller',
  ADMIN = 'admin',
  SUPER_ADMIN = 'super_admin',
  BROKER = 'broker',
  VC = 'vc',
  LEGAL = 'legal',
  BANK = 'bank',
}

export class CreateUserDto {
  @ApiProperty({ example: 'user@example.com', description: 'User email address' })
  @IsEmail({}, { message: 'Please provide a valid email address' })
  email!: string;

  @ApiProperty({ example: 'StrongP@ssw0rd123', description: 'User password (min 8 characters)' })
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  password!: string;
}

export class LoginDto {
  @ApiProperty({ example: 'user@example.com', description: 'User email address' })
  @IsEmail({}, { message: 'Please provide a valid email address' })
  email!: string;

  @ApiProperty({ example: 'password123', description: 'User password' })
  @IsString()
  password!: string;
}

export class RefreshTokenDto {
  @ApiProperty({ description: 'User ID' })
  @IsUUID()
  userId!: string;

  @ApiProperty({ description: 'Refresh token' })
  @IsString()
  refreshToken!: string;
}

export class TwoFactorVerifyDto {
  @ApiProperty({ description: 'User ID' })
  @IsUUID()
  userId!: string;

  @ApiProperty({ example: '123456', description: '6-digit TOTP code' })
  @IsString()
  @MinLength(6)
  authCode!: string;
}

export class ForgotPasswordDto {
  @ApiProperty({ example: 'user@example.com', description: 'User email address' })
  @IsEmail({}, { message: 'Please provide a valid email address' })
  email!: string;
}

export class KycSubmitDto {
  @ApiProperty({ description: 'ID Type e.g., passport, drivers_license' })
  @IsString()
  idType!: string;

  @ApiProperty({ description: 'ID Number' })
  @IsString()
  idNumber!: string;

  @ApiProperty({ description: 'URL of the ID document' })
  @IsString()
  documentUrl!: string;
}

export class UpdateProfileDto {
  @ApiPropertyOptional({ description: 'User full name' })
  @IsString()
  @IsOptional()
  displayName?: string;

  @ApiPropertyOptional({ description: 'Company name' })
  @IsString()
  @IsOptional()
  companyName?: string;
}

export class ResetPasswordDto {
  @ApiProperty({ description: 'The JWT reset token sent via email' })
  @IsString()
  token!: string;

  @ApiProperty({ example: 'StrongP@ssw0rd123', description: 'New user password (min 8 characters)' })
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  password!: string;
}

export class UserResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty({ enum: UserRole })
  role!: UserRole;

  @ApiProperty({ required: false })
  @IsOptional()
  kycStatus?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  subscriptionTier?: string;
}
