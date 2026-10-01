import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { AdminShopLocationsController } from './shop-locations.controller';
import { ShopLocationsService } from './shop-locations.service';

@Module({
  controllers: [AdminShopLocationsController],
  providers: [PrismaService, ShopLocationsService],
  exports: [ShopLocationsService],
})
export class ShopsModule {}
