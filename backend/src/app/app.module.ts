import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { InitialSchema1717977600000 } from '../migrations/1717977600000-InitialSchema';
import { AddTwoFactorAuth1718000000000 } from '../migrations/1718000000000-AddTwoFactorAuth';
import { AddGroupCurrencyAndExpenseSoftDelete1718100000000 } from '../migrations/1718100000000-AddGroupCurrencyAndExpenseSoftDelete';
import { AddGroupTypeAndSpectatorAndHousehold1718200000000 } from '../migrations/1718200000000-AddGroupTypeAndSpectatorAndHousehold';
import { EncryptExpenseAmounts1718300000000 } from '../migrations/1718300000000-EncryptExpenseAmounts';
import { AddUserPhoneAndGroupInviteToken1718400000000 } from '../migrations/1718400000000-AddUserPhoneAndGroupInviteToken';
import { SnakeNamingStrategy } from './common/snake-naming-strategy';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { GroupsModule } from './groups/groups.module';
import { ExpensesModule } from './expenses/expenses.module';
import { SettlementsModule } from './settlements/settlements.module';
import { ImportModule } from './import/import.module';
import { AiModule } from './ai/ai.module';
import { Note, Goal, AuditLog } from '@finmate/data-models';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '.env.dev'],
    }),
    TypeOrmModule.forFeature([Note, Goal, AuditLog]),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        url: configService.get<string>('DATABASE_URL'),
        autoLoadEntities: true,
        synchronize: false, // never true in production
        migrations: [
          InitialSchema1717977600000,
          AddTwoFactorAuth1718000000000,
          AddGroupCurrencyAndExpenseSoftDelete1718100000000,
          AddGroupTypeAndSpectatorAndHousehold1718200000000,
          EncryptExpenseAmounts1718300000000,
          AddUserPhoneAndGroupInviteToken1718400000000,
        ],
        migrationsRun: true,
        namingStrategy: new SnakeNamingStrategy(),
      }),
      inject: [ConfigService],
    }),
    AuthModule,
    UsersModule,
    GroupsModule,
    ExpensesModule,
    SettlementsModule,
    ImportModule,
    AiModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
