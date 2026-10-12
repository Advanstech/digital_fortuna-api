import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

export function setupSwagger(app: any): void {
  const config = new DocumentBuilder()
    .setTitle('Digital Fortuna API')
    .setDescription(
      `The Digital Fortuna API - A world-class marketplace for startup acquisitions.
      
## Features
- **Authentication**: JWT-based auth with 2FA support
- **Listings**: Browse and search startup listings
- **Deals**: Manage acquisition deals with AI-powered insights
- **Payments**: Secure payment processing via GTPay
- **AI Services**: Due diligence, valuations, and document generation

## Rate Limits
- Public endpoints: 100 requests/minute
- Authenticated endpoints: 1000 requests/minute
- AI endpoints: 10 requests/minute

## Authentication
All protected endpoints require a Bearer token in the Authorization header:
\`\`\`
Authorization: Bearer <your_jwt_token>
\`\`\`
      `
    )
    .setVersion('1.0.0')
    .setContact('Digital Fortuna Support', 'https://digitalfortuna.com', 'support@digitalfortuna.com')
    .setLicense('Proprietary', 'https://digitalfortuna.com/license')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'JWT',
        description: 'Enter JWT token',
        in: 'header',
      },
      'JWT-auth',
    )
    .addServer('http://localhost:4000', 'Local Development')
    .addServer('https://api.digitalfortuna.com', 'Production')
    .addTag('Auth', 'Authentication and user management')
    .addTag('Listings', 'Startup marketplace listings')
    .addTag('Deals', 'Deal management and negotiations')
    .addTag('Payments', 'Payment processing and invoicing')
    .addTag('AI', 'AI-powered services')
    .addTag('Brokers', 'Broker services and valuations')
    .addTag('Health', 'Health and monitoring endpoints')
    .build();

  const document = SwaggerModule.createDocument(app, config, {
    operationIdFactory: (controllerKey: string, methodKey: string) =>
      `${controllerKey.replace('Controller', '')}_${methodKey}`,
    ignoreGlobalPrefix: false,
  });

  SwaggerModule.setup('api/v1/docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
      docExpansion: 'none',
      filter: true,
      showRequestDuration: true,
      tryItOutEnabled: true,
    },
    customCss: `
      .swagger-ui .topbar { display: none }
      .swagger-ui .info .title { color: #F5C842; }
      .swagger-ui .btn.authorize { background-color: #00FF85; }
    `,
    customSiteTitle: 'Digital Fortuna API Docs',
  });
}
