import { STATUS_CODES } from 'node:http';
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Prisma } from '../../generated/prisma/client';

interface ErrorResponse {
  statusCode: number;
  message: string | string[];
  error: string;
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const request = context.getRequest<Request>();
    const body = this.toSafeResponse(exception);

    if (body.statusCode >= 500) {
      const errorName =
        exception instanceof Error ? exception.name : typeof exception;
      const prismaCode =
        exception instanceof Prisma.PrismaClientKnownRequestError
          ? exception.code
          : undefined;
      this.logger.error({
        event: 'unhandled_request_error',
        method: request.method,
        path: request.originalUrl || request.url,
        errorName,
        prismaCode,
      });
    }

    response.status(body.statusCode).json(body);
  }

  private toSafeResponse(exception: unknown): ErrorResponse {
    if (exception instanceof HttpException) {
      const statusCode = exception.getStatus();
      const source = exception.getResponse();
      if (typeof source === 'string') {
        return {
          statusCode,
          message: source,
          error: this.statusLabel(statusCode),
        };
      }
      const value = source as {
        message?: string | string[];
        error?: string;
      };
      return {
        statusCode,
        message: value.message ?? this.statusLabel(statusCode),
        error: value.error ?? this.statusLabel(statusCode),
      };
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') {
        return this.response(HttpStatus.CONFLICT, 'Resource already exists');
      }
      if (exception.code === 'P2025') {
        return this.response(HttpStatus.NOT_FOUND, 'Resource not found');
      }
      if (['P2003', 'P2014', 'P2034'].includes(exception.code)) {
        return this.response(
          HttpStatus.CONFLICT,
          'Request conflicts with current data',
        );
      }
      if (
        ['P2000', 'P2005', 'P2006', 'P2007', 'P2011', 'P2012', 'P2013', 'P2019', 'P2023'].includes(
          exception.code,
        )
      ) {
        return this.response(HttpStatus.BAD_REQUEST, 'Request data is invalid');
      }
    }

    if (exception instanceof Prisma.PrismaClientValidationError) {
      return this.response(HttpStatus.BAD_REQUEST, 'Request data is invalid');
    }

    return this.response(
      HttpStatus.INTERNAL_SERVER_ERROR,
      'Internal server error',
    );
  }

  private response(statusCode: number, message: string): ErrorResponse {
    return { statusCode, message, error: this.statusLabel(statusCode) };
  }

  private statusLabel(statusCode: number): string {
    return STATUS_CODES[statusCode] ?? 'Error';
  }
}
