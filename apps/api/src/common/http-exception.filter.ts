import { Catch, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';
import type { ApiErrorResponse } from '@outsaid/contracts';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const body: ApiErrorResponse = {
      error: {
        code: status >= 500 ? 'INTERNAL_ERROR' : `HTTP_${status}`,
        message: status >= 500 ? 'An unexpected error occurred.' : 'Request failed.',
      },
    };
    if (exception instanceof HttpException && status < 500) {
      const payload = exception.getResponse();
      if (typeof payload === 'string') body.error.message = payload;
      else if ('message' in payload) {
        const message: unknown = payload.message;
        if (typeof message === 'string') body.error.message = message;
        else if (Array.isArray(message) && message.every((item: unknown) => typeof item === 'string')) {
          body.error.message = 'Request validation failed.';
          body.error.details = message as string[];
        }
      }
    }
    if (status >= 500) {
      // Do not log raw exceptions, request bodies, URLs or database credentials.
      this.logger.error({ event: 'request_failed', status });
    }
    response.status(status).json(body);
  }
}
