import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Query, UseGuards } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { InventoryQueryDto } from './dto/inventory-query.dto';
import { UpdateInventoryDto } from './dto/update-inventory.dto';
import { InventoryService } from './inventory.service';

@Controller('admin/inventory')
@UseGuards(AccessTokenGuard, RolesGuard)
@Roles('ADMIN')
export class AdminInventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @Get()
  list(@Query() query: InventoryQueryDto) {
    return this.inventory.list(query);
  }

  @Patch(':variantId')
  update(
    @Param('variantId', ParseUUIDPipe) variantId: string,
    @Body() dto: UpdateInventoryDto,
    @CurrentUser() admin: AuthenticatedUser,
  ) {
    return this.inventory.update(variantId, dto, admin.id);
  }
}
