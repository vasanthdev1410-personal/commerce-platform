import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { PrismaService } from '../../database/prisma.service';

interface HealthResponse {
  status: 'ok';
}

interface DatabaseHealthResponse extends HealthResponse {
  database: 'connected';
}

@Controller('health')
@SkipThrottle()
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  getHealth(): HealthResponse {
    return { status: 'ok' };
  }

  @Get('database')
  async getDatabaseHealth(): Promise<DatabaseHealthResponse> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new ServiceUnavailableException('Database is unavailable');
    }

    return { status: 'ok', database: 'connected' };
  }
}
