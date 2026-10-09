import { Controller, Post, Body, UseGuards, Request, Get, Res, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './auth.guard';
import * as qrcode from 'qrcode';
import { 
  CreateUserDto, 
  LoginDto, 
  RefreshTokenDto, 
  TwoFactorVerifyDto 
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
}
