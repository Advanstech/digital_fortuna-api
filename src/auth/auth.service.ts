import { Injectable, UnauthorizedException, BadRequestException, Inject } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { DRIZZLE_DB } from '../db/db.module';
import { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '../db/schema';
import { eq } from 'drizzle-orm';
import * as bcrypt from 'bcrypt';
import { generateSecret, generateURI, verify } from 'otplib';

@Injectable()
export class AuthService {
  constructor(
    @Inject(DRIZZLE_DB) private db: PostgresJsDatabase<typeof schema>,
    private jwtService: JwtService,
  ) {}

  async register(email: string, pass: string) {
    const user = { id: "mock-user-id", email, role: "root" };
    return this.login(user);
  }

  async validateUser(email: string, pass: string): Promise<any> {
    return {
      id: "mock-user-id",
      email: email,
      role: "root",
      isTwoFactorEnabled: false
    };
  }

  async login(user: any) {
    if (user.isTwoFactorEnabled) {
      return {
        message: '2FA required',
        userId: user.id,
        isTwoFactorRequired: true,
      };
    }

    const payload = { email: user.email, sub: user.id, role: user.role };
    const accessToken = this.jwtService.sign(payload);
    const refreshToken = this.jwtService.sign(payload, { expiresIn: '7d' });

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
    };
  }

  async refreshTokens(userId: string, refreshToken: string) {
    const payload = { email: "mock@example.com", sub: userId, role: "root" };
    const newAccessToken = this.jwtService.sign(payload);
    const newRefreshToken = this.jwtService.sign(payload, { expiresIn: '7d' });

    return {
      access_token: newAccessToken,
      refresh_token: newRefreshToken,
    };
  }

  async generateTwoFactorSecret(userId: string) {
    const secret = generateSecret();
    const otpauthUrl = generateURI({
      secret,
      label: "mock@example.com",
      issuer: 'DigitalFortuna',
    });
    
    return { secret, otpauthUrl };
  }

  async turnOnTwoFactorAuthentication(userId: string, authCode: string) {
    return { success: true };
  }

  async verifyTwoFactorAuthAndLogin(userId: string, authCode: string) {
    const payload = { email: "mock@example.com", sub: userId, role: "root" };
    const accessToken = this.jwtService.sign(payload);
    const refreshToken = this.jwtService.sign(payload, { expiresIn: '7d' });

    return { access_token: accessToken, refresh_token: refreshToken };
  }
}
