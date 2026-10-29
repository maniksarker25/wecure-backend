import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RtcTokenBuilder, RtcRole, ChatTokenBuilder } from 'agora-token';
import axios from 'axios';

@Injectable()
export class AgoraService {
  private readonly logger = new Logger(AgoraService.name);
  private appId: string;
  private appCertificate: string;
  private chatAppKey: string;

  constructor(private configService: ConfigService) {
    this.appId = this.configService.get<string>('AGORA_APP_ID') || '';
    this.appCertificate =
      this.configService.get<string>('AGORA_APP_CERTIFICATE') || '';

    const appKey = this.configService.get<string>('AGORA_APP_KEY') || '';
    const appName = this.configService.get<string>('APP_NAME') || '';

    // If APP_NAME is provided, combine it with appKey (OrgName#AppName).
    // Otherwise, assume appKey is already the full key or the correctly formatted value.
    this.chatAppKey = appName ? `${appKey}#${appName}` : appKey;

    if (!this.appId || !this.appCertificate) {
      this.logger.warn('Agora credentials not found in environment variables');
    }
  }

  generateToken(channelName: string, uid: string | number) {
    if (!this.appId || !this.appCertificate) {
      throw new InternalServerErrorException('Agora configuration missing');
    }

    const role = RtcRole.PUBLISHER;
    const expirationTimeInSeconds = 300; // 5 minutes

    try {
      let token: string;
      if (typeof uid === 'number') {
        token = RtcTokenBuilder.buildTokenWithUid(
          this.appId,
          this.appCertificate,
          channelName,
          uid,
          role,
          expirationTimeInSeconds,
          expirationTimeInSeconds,
        );
      } else {
        token = RtcTokenBuilder.buildTokenWithUserAccount(
          this.appId,
          this.appCertificate,
          channelName,
          uid,
          role,
          expirationTimeInSeconds,
          expirationTimeInSeconds,
        );
      }

      return {
        appId: this.appId,
        channel: channelName,
        token,
      };
    } catch (error) {
      this.logger.error('Agora token generation error:', error);
      throw new InternalServerErrorException('Failed to generate Agora token');
    }
  }

  async generateChatToken(userUuid: string) {
    if (!this.appId || !this.appCertificate) {
      throw new InternalServerErrorException('Agora configuration missing');
    }

    const expirationInSeconds = 3600; // 1 hour for chat

    try {
      // 1. Ensure user is registered in Agora Chat
      await this.registerChatUser(userUuid);

      // 2. Build the user token
      const token = ChatTokenBuilder.buildUserToken(
        this.appId,
        this.appCertificate,
        userUuid,
        expirationInSeconds,
      );

      return {
        appId: this.appId,
        token,
        userId: userUuid,
        chatAppKey: this.chatAppKey,
        expirationInSeconds,
      };
    } catch (error) {
      this.logger.error('Agora chat token generation error:', error);
      throw new InternalServerErrorException(
        'Failed to generate Agora chat token: ' + (error.message || ''),
      );
    }
  }

  private async registerChatUser(username: string) {
    const appToken = ChatTokenBuilder.buildAppToken(
      this.appId,
      this.appCertificate,
      3600,
    );

    const [orgName, appName] = this.chatAppKey.split('#');
    // Using a61 for orgs starting with 61, otherwise default to a1
    const host = orgName.startsWith('61')
      ? 'a61.chat.agora.io'
      : 'a1.chat.agora.io';
    const url = `https://${host}/${orgName}/${appName}/users`;

    try {
      await axios.post(
        url,
        {
          username: username,
          password: 'password123', // Dummy password, we use token auth anyway
          nickname: username,
        },
        {
          headers: {
            Authorization: `Bearer ${appToken}`,
            'Content-Type': 'application/json',
          },
        },
      );
    } catch (error) {
      // If user already exists, it might return 400 or 409 depending on the API version/state
      if (error.response?.status === 400 || error.response?.status === 409) {
        return; // User already registered, silently skip
      }
      this.logger.error(
        'Error registering Agora Chat user:',
        error.response?.data || error.message,
      );
      // We don't throw here to allow token generation to proceed if the error is non-critical
    }
  }
}
