import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_GUARD } from '@nestjs/core';
import { ConditionalThrottleGuard } from './guards/conditional-throttle.guard';
import { UserThrottlerGuard } from './guards/user-throttler.guard';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import * as Migrations from '../migrations';
import { SnakeNamingStrategy } from './common/snake-naming-strategy';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { GroupsModule } from './groups/groups.module';
import { ExpensesModule } from './expenses/expenses.module';
import { SettlementsModule } from './settlements/settlements.module';
import { ImportModule } from './import/import.module';
import { AiModule } from './ai/ai.module';
import { EmailModule } from './email/email.module';
import { Note, Goal, AuditLog } from '@finmate/data-models';

@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const envNode = config.get('NODE_ENV') || process.env.NODE_ENV;
        // Detect automated E2E/test contexts and disable throttling there.
        // Conditions covered:
        // - NODE_ENV === 'test'
        // - explicit THROTTLE_SKIP=true (env or config)
        // - NX orchestrator running an e2e target (NX_TASK_TARGET / NX_TASK_ID)
        // - Playwright worker environments (PLAYWRIGHT_WORKER_INDEX / PLAYWRIGHT_TEST)
        // - generic E2E flag (E2E=true)
        const isTest =
          envNode === 'test' ||
          config.get('THROTTLE_SKIP') === 'true' ||
          process.env.THROTTLE_SKIP === 'true' ||
          String(process.env.NX_TASK_TARGET || process.env.NX_TASK_ID || '').includes('e2e') ||
          typeof process.env.PLAYWRIGHT_WORKER_INDEX !== 'undefined' ||
          process.env.PLAYWRIGHT_TEST === '1' ||
          process.env.E2E === 'true';
        const getLimit = (key: string, defaultValue: number) => {
          if (isTest) return 10000;
          return Number(config.get(key)) || defaultValue;
        };

        return [
          {
            name: 'default',
            ttl: 60000,
            limit: getLimit('THROTTLE_LIMIT_DEFAULT', 100),
          },
          {
            name: 'login',
            ttl: 60000,
            limit: getLimit('THROTTLE_LIMIT_LOGIN', 5),
          },
          {
            name: 'register',
            ttl: 60000,
            limit: getLimit('THROTTLE_LIMIT_REGISTER', 5),
          },
          {
            name: 'forgotPassword',
            ttl: 60000,
            limit: getLimit('THROTTLE_LIMIT_FORGOT', 3),
          },
          {
            name: 'resetPassword',
            ttl: 60000,
            limit: getLimit('THROTTLE_LIMIT_RESET', 3),
          },
          {
            name: 'otp',
            ttl: 60000,
            limit: getLimit('THROTTLE_LIMIT_OTP', 5),
          },
          {
            name: 'refresh',
            ttl: 60000,
            limit: getLimit('THROTTLE_LIMIT_REFRESH', 15),
          },
          {
            name: 'import',
            ttl: 60000,
            limit: getLimit('THROTTLE_LIMIT_IMPORT', 10),
          },
          {
            name: 'export',
            ttl: 60000,
            limit: getLimit('THROTTLE_LIMIT_EXPORT', 20),
          },
        ];
      },
    }),
    ScheduleModule.forRoot(),
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '.env.dev'],
    }),
    TypeOrmModule.forFeature([Note, Goal, AuditLog]),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        const sslEnabled = configService.get<string>('DB_SSL') === 'true';
        const sslRejectUnauthorized = configService.get<string>('DB_SSL_REJECT_UNAUTHORIZED') !== 'false';
        const ssl = sslEnabled
          ? { rejectUnauthorized: sslRejectUnauthorized }
          : undefined;

        return {
          type: 'postgres',
          url: configService.get<string>('DATABASE_URL'),
          ssl,
          autoLoadEntities: true,
          synchronize: false, // never true in production
          migrations: [...Object.values(Migrations)],
          migrationsRun: true,
          namingStrategy: new SnakeNamingStrategy(),
        };
      },
      inject: [ConfigService],
    }),
    AuthModule,
    UsersModule,
    GroupsModule,
    ExpensesModule,
    SettlementsModule,
    ImportModule,
    AiModule,
    EmailModule,
  ],
  controllers: [AppController],
  providers: [AppService, { provide: ThrottlerGuard, useClass: UserThrottlerGuard }, { provide: APP_GUARD, useClass: ConditionalThrottleGuard }],
})
export class AppModule {}
