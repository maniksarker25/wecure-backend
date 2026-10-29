import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { MailService } from '../mail/mail.service';

@Injectable()
export class UsersListener {
  private readonly logger = new Logger(UsersListener.name);

  constructor(private readonly mailService: MailService) {}

  @OnEvent('admin.created')
  async handleAdminCreated(payload: any) {
    this.logger.log(`Handling admin.created event for ${payload.email}`);
    try {
      await this.mailService.sendAdminCredentials(
        payload.email,
        payload.name,
        payload.password,
      );
    } catch (error) {
      this.logger.error(
        `Failed to send admin credentials email to ${payload.email}`,
        error,
      );
    }
  }
}
