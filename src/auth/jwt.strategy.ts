import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET') || 'default_secret',
    });
  }

  async validate(payload: any) {
    if (!payload.sub) {
      throw new UnauthorizedException('Invalid Token');
    }
    // Reject refresh tokens used as access tokens
    if (payload.typ === 'refresh') {
      throw new UnauthorizedException('Refresh tokens cannot be used for API access');
    }

    // Normalize legacy role aliases to the canonical enum values
    let role: string = payload.role;
    if (role === 'superadmin' || role === 'root') role = 'super_admin';

    // Bootstrap admins: emails listed in ADMIN_EMAILS always act as super_admin,
    // matching the frontend's owner-email check. Comma-separated list.
    const adminEmails = (this.configService.get<string>('ADMIN_EMAILS') || 'hanson.pepra@gmail.com')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
    if (payload.email && adminEmails.includes(payload.email.toLowerCase())) {
      role = 'super_admin';
    }

    return { userId: payload.sub, email: payload.email, role };
  }
}
