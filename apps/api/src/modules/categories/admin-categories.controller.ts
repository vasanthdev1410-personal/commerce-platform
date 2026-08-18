import { Body, Controller, Delete, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@Controller('admin/categories')
@UseGuards(AccessTokenGuard, RolesGuard)
@Roles('ADMIN')
export class AdminCategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Post()
  create(@Body() dto: CreateCategoryDto, @CurrentUser() admin: AuthenticatedUser) {
    return this.categories.create(dto, admin.id);
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCategoryDto, @CurrentUser() admin: AuthenticatedUser) {
    return this.categories.update(id, dto, admin.id);
  }

  @Delete(':id')
  deactivate(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() admin: AuthenticatedUser) {
    return this.categories.deactivate(id, admin.id);
  }
}
