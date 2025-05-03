import {
  PipeTransform,
  Injectable,
  BadRequestException,
  ArgumentMetadata,
} from '@nestjs/common';
import { parseISO, isValid } from 'date-fns';

// This pipe is used to parse a date string in the format YYYY-MM-DD
@Injectable()
export class ParseDatePipe implements PipeTransform<string, Date> {
  transform(value: string, metadata: ArgumentMetadata): Date {
    const date = parseISO(value);
    if (!isValid(date)) {
      throw new BadRequestException(
        `Invalid ${metadata.data} "${value}". Expected format YYYY-MM-DD`,
      );
    }
    return date;
  }
}
