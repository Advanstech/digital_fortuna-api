import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@ApiTags('Admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin', 'super_admin')
@ApiBearerAuth('JWT-auth')
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('metrics')
  @ApiOperation({ summary: 'Platform overview metrics (real data)' })
  getPlatformMetrics() {
    return this.adminService.getPlatformMetrics();
  }

  @Get('pending-listings')
  @ApiOperation({ summary: 'Listings awaiting moderation' })
  getPendingListings() {
    return this.adminService.getPendingListings();
  }

  @Get('deals')
  @ApiOperation({ summary: 'All deals with buyer/seller info (admin oversight)' })
  getAllDeals() {
    return this.adminService.getAllDeals();
  }
}
