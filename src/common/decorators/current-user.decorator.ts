import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface CurrentUserData {
  userId: string;
  email: string;
  role: string;
}

export const CurrentUser = createParamDecorator(
  (data: keyof CurrentUserData | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<any>();
    const user = request.user as CurrentUserData;

    if (!user) {
      return null;
    }

    return data ? user[data] : user;
  },
);
