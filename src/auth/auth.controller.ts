import { Controller, Post, Patch, Body, Param, UseGuards, Request, Get, Res, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './auth.guard';
import * as qrcode from 'qrcode';
import { 
  CreateUserDto, 
  LoginDto, 
  RefreshTokenDto, 
  TwoFactorVerifyDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  KycSubmitDto,
  UpdateProfileDto
} from '../common/dto/user.dto';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../common/decorators/public.decorator';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Public()
  @Post('register')
  @Throttle({ auth: { limit: 5, ttl: 60000 } }) // Stricter rate limit for auth
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Register a new user' })
  @ApiResponse({ status: 201, description: 'User successfully registered' })
  @ApiResponse({ status: 400, description: 'Invalid input or user already exists' })
  async register(@Body() body: CreateUserDto) {
    return this.authService.register(body.email, body.password);
  }

  @Public()
  @Post('login')
  @Throttle({ auth: { limit: 5, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login with email and password' })
  @ApiResponse({ status: 200, description: 'Login successful or 2FA required' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  async login(@Body() body: LoginDto) {
    const user = await this.authService.validateUser(body.email, body.password);
    return this.authService.login(user);
  }

  @Public()
  @Post('forgot-password')
  @Throttle({ auth: { limit: 3, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request a password reset email' })
  @ApiResponse({ status: 200, description: 'Reset email sent if account exists' })
  async forgotPassword(@Body() body: ForgotPasswordDto) {
    return this.authService.forgotPassword(body.email);
  }

  @Public()
  @Post('reset-password')
  @Throttle({ auth: { limit: 5, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reset password using token' })
  @ApiResponse({ status: 200, description: 'Password reset successfully' })
  @ApiResponse({ status: 400, description: 'Invalid or expired token' })
  async resetPassword(@Body() body: ResetPasswordDto) {
    return this.authService.resetPassword(body.token, body.password);
  }

  @Public()
  @Post('refresh')
  @Throttle({ auth: { limit: 10, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access token' })
  @ApiResponse({ status: 200, description: 'Tokens refreshed successfully' })
  @ApiResponse({ status: 401, description: 'Invalid refresh token' })
  async refresh(@Body() body: RefreshTokenDto) {
    return this.authService.refreshTokens(body.userId, body.refreshToken);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @Post('2fa/generate')
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Generate 2FA secret and QR code' })
  @ApiResponse({ status: 200, description: 'Returns QR code for 2FA setup' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async generateTwoFactorSecret(@Request() req: any, @Res() res: any) {
    const { otpauthUrl } = await this.authService.generateTwoFactorSecret(req.user.userId);
    const qrCodeImage = await qrcode.toDataURL(otpauthUrl);
    return res.json({ qrCodeImage });
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @Post('2fa/turn-on')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Enable 2FA for the user' })
  @ApiResponse({ status: 200, description: '2FA enabled successfully' })
  @ApiResponse({ status: 401, description: 'Invalid 2FA code' })
  async turnOnTwoFactorAuthentication(@Request() req: any, @Body() body: TwoFactorVerifyDto) {
    return this.authService.turnOnTwoFactorAuthentication(req.user.userId, body.authCode);
  }

  @Public()
  @Post('2fa/verify-login')
  @Throttle({ auth: { limit: 5, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify 2FA code and complete login' })
  @ApiResponse({ status: 200, description: 'Login completed with 2FA' })
  @ApiResponse({ status: 401, description: 'Invalid 2FA code' })
  async verify2FALogin(@Body() body: TwoFactorVerifyDto) {
    return this.authService.verifyTwoFactorAuthAndLogin(body.userId, body.authCode);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @Get('profile')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get current user profile' })
  @ApiResponse({ status: 200, description: 'Returns user profile' })
  getProfile(@Request() req: any) {
    return req.user;
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @Patch('profile')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update user profile' })
  @ApiResponse({ status: 200, description: 'Profile updated' })
  updateProfile(@Request() req: any, @Body() body: UpdateProfileDto) {
    return this.authService.updateProfile(req.user.userId, body);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @Get('me')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get current user record' })
  @ApiResponse({ status: 200, description: 'Returns user record' })
  getMe(@Request() req: any) {
    return this.authService.getMe(req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Log out and revoke refresh token' })
  @ApiResponse({ status: 200, description: 'Logged out' })
  logout(@Request() req: any) {
    return this.authService.logout(req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @Post('kyc/submit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Submit KYC information' })
  @ApiResponse({ status: 200, description: 'KYC submitted successfully' })
  submitKyc(@Request() req: any, @Body() body: KycSubmitDto) {
    return this.authService.submitKyc(req.user.userId, body);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @Get('admin/users')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Admin list all users and KYC data' })
  adminGetUsers() {
    return this.authService.adminGetUsers();
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @Patch('admin/users/:id/kyc')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Admin approve or reject KYC' })
  adminUpdateKyc(@Param('id') id: string, @Body() body: { status: string }) {
    return this.authService.adminUpdateKycStatus(id, body.status);
  }
}
