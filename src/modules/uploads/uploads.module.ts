import { DynamicModule, Global, Module, Provider, Type } from '@nestjs/common';
import { UploadsService } from './uploads.service';
import { UploadsController } from './uploads.controller';
import { PrivateUploadService } from './private-upload.service';
import {
  UploadsModuleOptions,
  UPLOADS_OPTIONS_TOKEN,
  UPLOAD_LOGGER_TOKEN,
  IUploadAuditLogger,
} from './interfaces/uploads-options.interface';

export interface UploadsModuleAsyncOptions {
  imports?: any[];
  useFactory?: (
    ...args: any[]
  ) => Promise<UploadsModuleOptions> | UploadsModuleOptions;
  inject?: any[];
  logger?: {
    useExisting?: Type<IUploadAuditLogger>;
    useClass?: Type<IUploadAuditLogger>;
  };
}

@Global()
@Module({
  controllers: [UploadsController],
  providers: [UploadsService, PrivateUploadService],
  exports: [UploadsService, PrivateUploadService],
})
export class UploadsModule {
  static registerAsync(options: UploadsModuleAsyncOptions): DynamicModule {
    const asyncOptionsProvider: Provider = {
      provide: UPLOADS_OPTIONS_TOKEN,
      useFactory: options.useFactory as (...args: any[]) => any,
      inject: options.inject || [],
    };

    const providers: Provider[] = [asyncOptionsProvider];

    if (options.logger) {
      if (options.logger.useExisting) {
        providers.push({
          provide: UPLOAD_LOGGER_TOKEN,
          useExisting: options.logger.useExisting,
        });
      } else if (options.logger.useClass) {
        providers.push({
          provide: UPLOAD_LOGGER_TOKEN,
          useClass: options.logger.useClass,
        });
      }
    }

    return {
      module: UploadsModule,
      imports: options.imports || [],
      providers: providers,
      exports: [UPLOADS_OPTIONS_TOKEN, UPLOAD_LOGGER_TOKEN],
    };
  }
}
