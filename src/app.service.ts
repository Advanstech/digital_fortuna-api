import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHello() {
    return {
      name: 'Digital Fortuna Computing API',
      version: '1.0.0',
      status: 'operational',
      environment: process.env.NODE_ENV || 'development',
      docs: '/api/v1/docs',
      health: '/api/v1/health',
      message: 'Welcome to the Digital Fortuna marketplace API.',
    };
  }
}
