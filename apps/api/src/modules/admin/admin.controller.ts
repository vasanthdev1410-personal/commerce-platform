import { Controller, Get, UseGuards } from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { RolesGuard } from '../auth/guards/roles.guard';

@Controller('admin')
@UseGuards(AccessTokenGuard, RolesGuard)
export class AdminController {
  @Get('health')
  @Roles('ADMIN')
  getHealth() {
    return { status: 'ok' as const, role: 'ADMIN' as const };
  }
}
