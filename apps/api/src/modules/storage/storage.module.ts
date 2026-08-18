import { Module } from '@nestjs/common';
import { ImageKitStorageService } from './imagekit-storage.service';

@Module({
  providers: [ImageKitStorageService],
  exports: [ImageKitStorageService],
})
export class StorageModule {}
