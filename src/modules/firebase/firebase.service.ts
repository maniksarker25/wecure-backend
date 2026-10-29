import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';

@Injectable()
export class FirebaseService implements OnModuleInit {
  private readonly logger = new Logger(FirebaseService.name);
  private firebaseApp?: admin.app.App;

  constructor(private configService: ConfigService) {}

  onModuleInit() {
    this.logger.log('Initializing Firebase Admin SDK...');
    const projectId = this.configService.get<string>('FIREBASE_PROJECT_ID');
    const privateKey = this.configService.get<string>('FIREBASE_PRIVATE_KEY');
    const clientEmail = this.configService.get<string>('FIREBASE_CLIENT_EMAIL');

    if (!projectId || !privateKey || !clientEmail) {
      this.logger.warn(
        'Firebase configuration is missing in environment variables. Push notifications may not work.',
      );
      return;
    }

    try {
      const existingApp = admin.apps.find((app) => app?.name === '[DEFAULT]');
      this.firebaseApp =
        existingApp ??
        admin.initializeApp({
          credential: admin.credential.cert({
            projectId,
            privateKey: this.normalizePrivateKey(privateKey),
            clientEmail,
          }),
        });
      this.logger.log('Firebase Admin SDK initialized successfully.');
    } catch (error) {
      this.logger.error('Error initializing Firebase Admin SDK', error);
    }
  }

  isConfigured(): boolean {
    return Boolean(this.firebaseApp);
  }

  get messaging(): admin.messaging.Messaging {
    if (!this.firebaseApp) {
      throw new Error('Firebase app not initialized');
    }
    return this.firebaseApp.messaging();
  }

  private normalizePrivateKey(privateKey: string): string {
    return privateKey
      .trim()
      .replace(/^['"]|['"]$/g, '')
      .replace(/\\n/g, '\n');
  }
}
