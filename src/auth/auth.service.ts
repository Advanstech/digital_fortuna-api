import { Injectable, UnauthorizedException, BadRequestException, Inject, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { DRIZZLE_DB } from '../db/db.module';
import { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '../db/schema';
import { eq } from 'drizzle-orm';
import * as bcrypt from 'bcrypt';
import { createHash } from 'crypto';
import { generateSecret, generateURI, verify } from 'otplib';
import { MailService } from '../mail/mail.service';

const BCRYPT_ROUNDS = 12;

// bcrypt only reads the first 72 bytes; JWTs share a long identical prefix,
// so refresh tokens are hashed via SHA-256 digest instead of raw.
const tokenDigest = (token: string) => createHash('sha256').update(token).digest('hex');

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @Inject(DRIZZLE_DB) private db: PostgresJsDatabase<typeof schema>,
    private jwtService: JwtService,
    private mailService: MailService,
  ) {}

  async register(email: string, pass: string) {
    const existing = await this.db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.email, email.toLowerCase()))
      .limit(1);

    if (existing.length) {
      throw new BadRequestException('An account with this email already exists');
    }

    const hashed = await bcrypt.hash(pass, BCRYPT_ROUNDS);
    const inserted = await this.db
      .insert(schema.users)
      .values({
        email: email.toLowerCase(),
        password: hashed,
        role: 'buyer',
      })
      .returning({ id: schema.users.id, email: schema.users.email, role: schema.users.role });

    const user = inserted[0];

    await this.db
      .insert(schema.profiles)
      .values({ userId: user.id })
      .catch(() => {});

    this.mailService.sendWelcomeEmail(user.email, user.email.split('@')[0]).catch((err) => {
      this.logger.warn(`Welcome email failed: ${err.message}`);
    });

    return this.login(user);
  }

  async validateUser(email: string, pass: string): Promise<any> {
    const users = await this.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, email.toLowerCase()))
      .limit(1);

    if (!users.length) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const user = users[0];
    const valid = await bcrypt.compare(pass, user.password);
    if (!valid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return user;
  }

  async login(user: any) {
    if (user.isTwoFactorEnabled) {
      return {
        message: '2FA required',
        userId: user.id,
        isTwoFactorRequired: true,
      };
    }

    return this.issueTokens(user);
  }

  private async issueTokens(user: { id: string; email: string; role: string }) {
    const payload = { email: user.email, sub: user.id, role: user.role };
    const accessToken = this.jwtService.sign(payload);
    const refreshToken = this.jwtService.sign(payload, { expiresIn: '7d' });

    await this.db
      .update(schema.users)
      .set({ refreshToken: await bcrypt.hash(tokenDigest(refreshToken), BCRYPT_ROUNDS) })
      .where(eq(schema.users.id, user.id));

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
    };
  }

  async refreshTokens(userId: string, refreshToken: string) {
    try {
      this.jwtService.verify(refreshToken);
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const users = await this.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1);

    if (!users.length || !users[0].refreshToken) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const user = users[0];
    const storedHash = user.refreshToken as string;
    const matches = await bcrypt.compare(tokenDigest(refreshToken), storedHash);
    if (!matches) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    return this.issueTokens(user);
  }

  async logout(userId: string) {
    await this.db
      .update(schema.users)
      .set({ refreshToken: null })
      .where(eq(schema.users.id, userId));
    return { success: true };
  }

  async getMe(userId: string) {
    const users = await this.db
      .select({
        id: schema.users.id,
        email: schema.users.email,
        role: schema.users.role,
        kycStatus: schema.users.kycStatus,
        subscriptionTier: schema.users.subscriptionTier,
        isTwoFactorEnabled: schema.users.isTwoFactorEnabled,
        createdAt: schema.users.createdAt,
      })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1);

    if (!users.length) throw new UnauthorizedException('User not found');
    return users[0];
  }

  async generateTwoFactorSecret(userId: string) {
    const users = await this.db
      .select({ email: schema.users.email })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1);
    if (!users.length) throw new UnauthorizedException('User not found');

    const secret = generateSecret();
    const otpauthUrl = generateURI({
      secret,
      label: users[0].email,
      issuer: 'DigitalFortuna',
    });

    await this.db
      .update(schema.users)
      .set({ twoFactorSecret: secret })
      .where(eq(schema.users.id, userId));

    return { secret, otpauthUrl };
  }

  async turnOnTwoFactorAuthentication(userId: string, authCode: string) {
    const users = await this.db
      .select({ twoFactorSecret: schema.users.twoFactorSecret })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1);
    if (!users.length || !users[0].twoFactorSecret) {
      throw new BadRequestException('Generate a 2FA secret first');
    }

    const isValid = await verify({ token: authCode, secret: users[0].twoFactorSecret });
    if (!isValid) {
      throw new UnauthorizedException('Invalid 2FA code');
    }

    await this.db
      .update(schema.users)
      .set({ isTwoFactorEnabled: true })
      .where(eq(schema.users.id, userId));

    return { success: true };
  }

  async verifyTwoFactorAuthAndLogin(userId: string, authCode: string) {
    const users = await this.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1);
    if (!users.length || !users[0].isTwoFactorEnabled || !users[0].twoFactorSecret) {
      throw new UnauthorizedException('2FA is not enabled for this account');
    }

    const user = users[0];
    const isValid = await verify({ token: authCode, secret: user.twoFactorSecret as string });
    if (!isValid) {
      throw new UnauthorizedException('Invalid 2FA code');
    }

    return this.issueTokens(user);
  }
}
