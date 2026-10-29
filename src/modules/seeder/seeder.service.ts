import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../users/users.service';
import { Role } from 'src/common/enum/role.enum';

@Injectable()
export class SeederService implements OnModuleInit {
  private readonly logger = new Logger(SeederService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
  ) {}

  async onModuleInit() {
    await this.seedSuperAdmin();
  }

  async seedSuperAdmin() {
    const email = this.configService.get<string>('SUPER_ADMIN_EMAIL');
    const password = this.configService.get<string>('SUPER_ADMIN_PASSWORD');

    if (!email || !password) {
      this.logger.warn(
        'SUPER_ADMIN_EMAIL or SUPER_ADMIN_PASSWORD not set in .env',
      );
      return;
    }

    const existingUser = await this.usersService.findByEmail(email);

    if (existingUser) {
      if (existingUser.role !== Role.SUPER_ADMIN) {
        this.logger.warn(
          `User with email ${email} already exists but is not SUPER_ADMIN. Current role: ${existingUser.role}`,
        );
      } else {
        this.logger.log('Super Admin already exists');
      }
      return;
    }

    try {
      await this.usersService.createUser({
        name: 'Super Admin',
        email,
        password,
        role: Role.SUPER_ADMIN,
      });
      this.logger.log('Super Admin seeded successfully');
    } catch (error) {
      if (error instanceof Error) {
        this.logger.error(`Failed to seed Super Admin: ${error.message}`);
      } else {
        this.logger.error('Failed to seed Super Admin: Unknown error', error);
      }
    }
  }
}
