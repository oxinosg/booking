import {
  PipeTransform,
  Injectable,
  ArgumentMetadata,
  BadRequestException,
  HttpStatus,
} from '@nestjs/common';
import { ZodError, ZodSchema } from 'zod';

// This pipe is used to validate and transform incoming data using Zod schemas
@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodSchema) {} // Accept any Zod schema

  transform(value: unknown, metadata: ArgumentMetadata) {
    // Only validate body content
    if (metadata.type !== 'body') {
      return value;
    }

    const result = this.schema.safeParse(value);

    if (!result.success) {
      // Extract Zod validation issues
      const error: ZodError = result.error;
      const formattedErrors = error.issues.map((issue) => {
        const path = issue.path.length ? issue.path.join('.') : 'body';
        return `${path} - ${issue.message}`;
      });

      throw new BadRequestException({
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'Validation failed',
        errors: formattedErrors,
      });
    }

    // Validation passed: return the parsed data with correct types
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return result.data;
  }
}
