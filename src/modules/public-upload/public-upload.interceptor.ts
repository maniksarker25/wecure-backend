import {
  FileFieldsInterceptor,
  FileInterceptor,
  FilesInterceptor,
} from '@nestjs/platform-express';
import * as multer from 'multer';

export interface FileInterceptorOptions {
  fieldName?: string | string[]; // Accept either a single field or an array of fields
  maxCount?: number;
  any?: boolean;
  allowedMimes?: RegExp;
  maxFileSizeBytes?: number;
}

export function GlobalPublicUploadInterceptor(
  options: FileInterceptorOptions = {},
) {
  const fieldNames = options.fieldName || ['file']; // Default field name is 'file'
  const maxCount = options.maxCount ?? 1;
  const isMultiple = maxCount > 1;
  const isAny = options.any === true;

  // Always use memoryStorage - the service will handle local vs S3
  const storage = multer.memoryStorage();

  const allowed = options.allowedMimes ?? /\/(jpg|jpeg|png|gif|webp|pdf)$/i;
  const fileFilter: multer.Options['fileFilter'] = (req, file, cb) => {
    if (allowed.test(file.mimetype)) return cb(null, true);
    return cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', file.fieldname));
  };

  const defaultMaxFileSize = process.env.PUBLIC_MAX_FILE_SIZE
    ? parseInt(process.env.PUBLIC_MAX_FILE_SIZE)
    : 10 * 1024 * 1024; // 10MB default

  const limits: multer.Options['limits'] = {
    fileSize: options.maxFileSizeBytes ?? defaultMaxFileSize,
    files: isAny
      ? undefined
      : Array.isArray(fieldNames)
        ? fieldNames.length * maxCount
        : maxCount,
  };

  if (Array.isArray(fieldNames)) {
    // Use FileFieldsInterceptor for multiple fields
    const fields = fieldNames.map((name) => ({ name, maxCount }));
    return FileFieldsInterceptor(fields, {
      storage,
      limits,
      fileFilter,
    });
  }

  if (isMultiple)
    return FilesInterceptor(fieldNames, maxCount, {
      storage,
      limits,
      fileFilter,
    });

  return FileInterceptor(fieldNames, { storage, limits, fileFilter });
}
