import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app/app.module';
import { HttpExceptionFilter } from './app/filters/http-exception.filter';
import helmet from 'helmet';
import compression from 'compression';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const globalPrefix = 'api/v1';
  app.setGlobalPrefix(globalPrefix);

  // HTTP response compression. Negotiates Brotli (br) when the client
  // supports it, otherwise falls back to gzip. Responses under 1 KB are
  // sent uncompressed (overhead exceeds benefit at that size).
  app.use(compression({ threshold: 1024 }));

  // Security headers with CSP configured to allow Swagger UI
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: [`'self'`],
          styleSrc: [`'self'`, `'unsafe-inline'`],
          imgSrc: [`'self'`, 'data:', 'validator.swagger.io'],
          scriptSrc: [`'self'`, `'unsafe-inline'`],
        },
      },
    }),
  );

  // CORS configuration
  const corsOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',').map((o) => o.trim())
    : [process.env.FRONTEND_URL || 'http://localhost:4200'];
  app.enableCors({
    origin: corsOrigins,
    credentials: true,
  });

  // When deployed behind a reverse proxy (nginx, ALB, Cloudflare), enable trust proxy
  // so `req.ip` and `req.headers['x-forwarded-for']` are populated correctly.
  // Only enable when running behind a trusted proxy.
  try {
    (app as any).set('trust proxy', true);
  } catch (err) {
    // older Nest/Express versions may not expose set; ignore if unavailable
  }

  // Global middleware to record request start time for response-time logging
  app.use((req: any, res: any, next: () => void) => {
    req.startTime = Date.now();
    next();
  });

  // Register global filter and validation pipes
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  // Configure Swagger Document
  const config = new DocumentBuilder()
    .setTitle('FinMate API')
    .setDescription('FinMate Backend API Specification')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  const port = process.env.PORT || 3000;
  await app.listen(port);
  Logger.log(
    `🚀 Application is running on: http://localhost:${port}/${globalPrefix}`,
  );
}

bootstrap();
