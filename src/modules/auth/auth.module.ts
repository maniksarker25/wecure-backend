import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from 'src/modules/auth/auth.controller';
import { AuthService } from 'src/modules/auth/auth.service';
import { JwtRefreshStrategy } from 'src/modules/auth/strategy/jwt-refresh.strategy';
import { JwtStrategy } from 'src/modules/auth/strategy/jwt.strategy';
import { MailModule } from 'src/modules/mail/mail.module';
import { UsersModule } from 'src/modules/users/users.module';
import { DoctorsModule } from '../doctors/doctors.module';

@Module({
  imports: [
    UsersModule,
    PassportModule,
    MailModule,
    DoctorsModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
        expiresIn: config.get<string>('JWT_ACC_EXPIRATION'),
      }),
    }),
  ],
  providers: [AuthService, JwtStrategy, JwtRefreshStrategy],
  controllers: [AuthController],
})
export class AuthModule {}
