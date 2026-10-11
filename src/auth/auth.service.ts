import { Injectable, UnauthorizedException, BadRequestException, Inject, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { DRIZZLE_DB } from '../db/db.module';
import { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '../db/schema';
import { eq, desc } from 'drizzle-orm';
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

  async forgotPassword(email: string) {
    const users = await this.db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.email, email.toLowerCase()))
      .limit(1);

    if (!users.length) {
      // Do not reveal that the user does not exist
      this.logger.log(`Password reset requested for non-existent email: ${email}`);
      return { message: 'If that email address is in our database, we will send you an email to reset your password.' };
    }

    const payload = { email: email.toLowerCase(), type: 'reset-password' };
    const resetToken = this.jwtService.sign(payload, { expiresIn: '1h' });
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const resetLink = `${frontendUrl}/auth/reset-password?token=${resetToken}`;

    this.logger.log(`=================================================`);
    this.logger.log(`PASSWORD RESET LINK: ${resetLink}`);
    this.logger.log(`=================================================`);

    await this.mailService.sendPasswordResetEmail(email.toLowerCase(), resetLink).catch((err) => {
      this.logger.warn(`Password reset email failed: ${err.message}`);
    });

    return { message: 'If that email address is in our database, we will send you an email to reset your password.' };
  }

  async resetPassword(token: string, newPassword: string) {
    let payload: any;
    try {
      payload = this.jwtService.verify(token);
    } catch (e) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    if (payload.type !== 'reset-password' || !payload.email) {
      throw new BadRequestException('Invalid reset token');
    }

    const hashed = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);

    await this.db
      .update(schema.users)
      .set({ password: hashed })
      .where(eq(schema.users.email, payload.email));

    return { message: 'Password has been successfully reset' };
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
    this.logger.debug(`Login attempt for ${email}: valid=${valid}`);
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
    const accessToken = this.jwtService.sign({ ...payload, typ: 'access' });
    const refreshToken = this.jwtService.sign({ ...payload, typ: 'refresh' }, { expiresIn: '7d' });

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
    const records = await this.db
      .select({
        id: schema.users.id,
        email: schema.users.email,
        role: schema.users.role,
        kycStatus: schema.users.kycStatus,
        kycRejectionReason: schema.users.kycRejectionReason,
        country: schema.users.country,
        subscriptionTier: schema.users.subscriptionTier,
        isTwoFactorEnabled: schema.users.isTwoFactorEnabled,
        createdAt: schema.users.createdAt,
        kycData: schema.profiles.kycData,
        displayName: schema.profiles.displayName,
        fullLegalName: schema.profiles.fullLegalName,
        companyName: schema.profiles.companyName,
        nationality: schema.profiles.nationality,
        dateOfBirth: schema.profiles.dateOfBirth,
        phone: schema.profiles.phone,
      })
      .from(schema.users)
      .leftJoin(schema.profiles, eq(schema.users.id, schema.profiles.userId))
      .where(eq(schema.users.id, userId))
      .limit(1);

    if (!records.length) throw new UnauthorizedException('User not found');
    return records[0];
  }

  async updateProfile(userId: string, data: any) {
    const updateData: any = {};
    if (data.displayName !== undefined) updateData.displayName = data.displayName;
    if (data.companyName !== undefined) updateData.companyName = data.companyName;
    
    if (Object.keys(updateData).length > 0) {
      await this.db
        .insert(schema.profiles)
        .values({ userId, ...updateData })
        .onConflictDoUpdate({ target: schema.profiles.userId, set: updateData });
    }
    
    return { success: true };
  }

  async submitKyc(userId: string, data: any) {
    const profileData: any = {
      kycData: {
        idType: data.idType,
        idNumber: data.idNumber,
        documentUrl: data.documentUrl,
        submittedAt: new Date().toISOString(),
      },
    };
    if (data.fullLegalName) profileData.fullLegalName = data.fullLegalName;
    if (data.nationality) profileData.nationality = data.nationality;
    if (data.dateOfBirth) profileData.dateOfBirth = data.dateOfBirth;
    if (data.phone) profileData.phone = data.phone;

    await this.db
      .insert(schema.profiles)
      .values({ userId, ...profileData })
      .onConflictDoUpdate({ target: schema.profiles.userId, set: profileData });

    const userUpdate: any = { kycStatus: 'pending' as const, kycRejectionReason: null };
    if (data.country) userUpdate.country = data.country;

    await this.db
      .update(schema.users)
      .set(userUpdate)
      .where(eq(schema.users.id, userId));

    // Send confirmation email
    const userRecord = await this.db
      .select({ email: schema.users.email, displayName: schema.profiles.displayName })
      .from(schema.users)
      .leftJoin(schema.profiles, eq(schema.users.id, schema.profiles.userId))
      .where(eq(schema.users.id, userId))
      .limit(1);

    if (userRecord.length) {
      const name = data.fullLegalName || userRecord[0].displayName || userRecord[0].email.split('@')[0];
      this.mailService.sendKycSubmittedEmail(userRecord[0].email, name).catch((err) => {
        this.logger.warn(`KYC submission email failed: ${err.message}`);
      });
    }

    return { message: 'KYC submitted successfully', status: 'pending' };
  }

  async adminGetUsers() {
    return this.db
      .select({
        id: schema.users.id,
        email: schema.users.email,
        role: schema.users.role,
        kycStatus: schema.users.kycStatus,
        kycRejectionReason: schema.users.kycRejectionReason,
        country: schema.users.country,
        subscriptionTier: schema.users.subscriptionTier,
        createdAt: schema.users.createdAt,
        displayName: schema.profiles.displayName,
        fullLegalName: schema.profiles.fullLegalName,
        companyName: schema.profiles.companyName,
        nationality: schema.profiles.nationality,
        phone: schema.profiles.phone,
        kycData: schema.profiles.kycData,
      })
      .from(schema.users)
      .leftJoin(schema.profiles, eq(schema.users.id, schema.profiles.userId))
      .orderBy(desc(schema.users.createdAt));
  }

  async adminUpdateKycStatus(userId: string, status: string, reason?: string) {
    const validStatuses = ['unverified', 'pending', 'verified', 'rejected'];
    if (!validStatuses.includes(status)) {
      throw new BadRequestException(`Invalid KYC status: ${status}. Must be one of: ${validStatuses.join(', ')}`);
    }

    const updateData: any = { kycStatus: status as any };
    if (status === 'rejected' && reason) {
      updateData.kycRejectionReason = reason;
    } else if (status === 'verified') {
      updateData.kycRejectionReason = null;
    }

    await this.db
      .update(schema.users)
      .set(updateData)
      .where(eq(schema.users.id, userId));

    // Send KYC status notification email
    const userRecord = await this.db
      .select({ email: schema.users.email, displayName: schema.profiles.displayName, fullLegalName: schema.profiles.fullLegalName })
      .from(schema.users)
      .leftJoin(schema.profiles, eq(schema.users.id, schema.profiles.userId))
      .where(eq(schema.users.id, userId))
      .limit(1);

    if (userRecord.length) {
      const name = userRecord[0].fullLegalName || userRecord[0].displayName || userRecord[0].email.split('@')[0];
      if (status === 'verified') {
        this.mailService.sendKycApprovedEmail(userRecord[0].email, name).catch((err) => {
          this.logger.warn(`KYC approved email failed: ${err.message}`);
        });
      } else if (status === 'rejected' && reason) {
        this.mailService.sendKycRejectedEmail(userRecord[0].email, name, reason).catch((err) => {
          this.logger.warn(`KYC rejected email failed: ${err.message}`);
        });
      }
    }

    return { success: true, userId, status };
  }

  async adminUpdateRole(userId: string, role: string) {
    const validRoles = ['buyer', 'seller', 'admin', 'super_admin', 'broker', 'vc', 'legal', 'bank'];
    if (!validRoles.includes(role)) {
      throw new BadRequestException(`Invalid role: ${role}`);
    }
    await this.db
      .update(schema.users)
      .set({ role: role as any })
      .where(eq(schema.users.id, userId));
    return { success: true, userId, role };
  }

  async adminUpdateUserProfile(userId: string, data: any) {
    const userUpdate: Record<string, any> = {};
    const profileUpdate: Record<string, any> = {};

    if (data.country !== undefined) userUpdate.country = data.country;
    if (data.subscriptionTier !== undefined) userUpdate.subscriptionTier = data.subscriptionTier;

    if (data.displayName !== undefined) profileUpdate.displayName = data.displayName;
    if (data.fullLegalName !== undefined) profileUpdate.fullLegalName = data.fullLegalName;
    if (data.companyName !== undefined) profileUpdate.companyName = data.companyName;
    if (data.nationality !== undefined) profileUpdate.nationality = data.nationality;
    if (data.dateOfBirth !== undefined) profileUpdate.dateOfBirth = data.dateOfBirth;
    if (data.phone !== undefined) profileUpdate.phone = data.phone;

    if (Object.keys(userUpdate).length > 0) {
      await this.db.update(schema.users).set(userUpdate).where(eq(schema.users.id, userId));
    }
    if (Object.keys(profileUpdate).length > 0) {
      await this.db
        .insert(schema.profiles)
        .values({ userId, ...profileUpdate })
        .onConflictDoUpdate({ target: schema.profiles.userId, set: profileUpdate });
    }

    return { success: true, userId };
  }

  async adminGetUserDetail(userId: string) {
    const records = await this.db
      .select({
        id: schema.users.id,
        email: schema.users.email,
        role: schema.users.role,
        kycStatus: schema.users.kycStatus,
        kycRejectionReason: schema.users.kycRejectionReason,
        country: schema.users.country,
        subscriptionTier: schema.users.subscriptionTier,
        isTwoFactorEnabled: schema.users.isTwoFactorEnabled,
        createdAt: schema.users.createdAt,
        kycData: schema.profiles.kycData,
        displayName: schema.profiles.displayName,
        fullLegalName: schema.profiles.fullLegalName,
        companyName: schema.profiles.companyName,
        nationality: schema.profiles.nationality,
        dateOfBirth: schema.profiles.dateOfBirth,
        phone: schema.profiles.phone,
        avatarUrl: schema.profiles.avatarUrl,
        bio: schema.profiles.bio,
        location: schema.profiles.location,
      })
      .from(schema.users)
      .leftJoin(schema.profiles, eq(schema.users.id, schema.profiles.userId))
      .where(eq(schema.users.id, userId))
      .limit(1);

    if (!records.length) throw new BadRequestException('User not found');

    // Get user's listings
    const userListings = await this.db
      .select({
        id: schema.listings.id,
        title: schema.listings.title,
        status: schema.listings.status,
        category: schema.listings.category,
        acquisitionPrice: schema.listings.acquisitionPrice,
        createdAt: schema.listings.createdAt,
      })
      .from(schema.listings)
      .where(eq(schema.listings.sellerId, userId))
      .orderBy(desc(schema.listings.createdAt));

    // Get user's offers
    const userOffers = await this.db
      .select({
        id: schema.offers.id,
        amount: schema.offers.amount,
        status: schema.offers.status,
        createdAt: schema.offers.createdAt,
        listingTitle: schema.listings.title,
      })
      .from(schema.offers)
      .leftJoin(schema.listings, eq(schema.offers.listingId, schema.listings.id))
      .where(eq(schema.offers.buyerId, userId))
      .orderBy(desc(schema.offers.createdAt));

    return {
      ...records[0],
      listings: userListings,
      offers: userOffers,
    };
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
