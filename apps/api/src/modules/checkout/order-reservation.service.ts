import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { ConfigService } from '@nestjs/config';
@Injectable()
export class OrderReservationService implements OnModuleInit,OnModuleDestroy {
  private timer?:ReturnType<typeof setInterval>;
  constructor(private readonly prisma:PrismaService,private readonly config:ConfigService){}
  onModuleInit(){this.timer=setInterval(()=>void this.releaseExpired(),this.config.get<number>('ORDER_RESERVATION_CLEANUP_INTERVAL_MS',60_000));this.timer.unref();}
  onModuleDestroy(){if(this.timer)clearInterval(this.timer);}
  async release(orderId:string){return this.prisma.$transaction(async tx=>{const order=await tx.order.findUnique({where:{id:orderId},include:{inventoryReservations:{where:{releasedAt:null}}}});if(!order||order.status!=='PENDING')return false;for(const reservation of order.inventoryReservations){await tx.$executeRaw`UPDATE "Inventory" SET "reservedQuantity" = GREATEST(0, "reservedQuantity" - ${reservation.quantity}) WHERE "variantId" = ${reservation.variantId}::uuid`;await tx.inventoryReservation.updateMany({where:{id:reservation.id,releasedAt:null},data:{releasedAt:new Date()}});}await tx.order.update({where:{id:order.id},data:{status:'CANCELLED'}});return true;},{isolationLevel:'Serializable'});}
  async releaseExpired(){const orders=await this.prisma.order.findMany({where:{status:'PENDING',reservationExpiresAt:{lte:new Date()},inventoryReservations:{some:{releasedAt:null}}},select:{id:true},take:100});for(const order of orders){try{await this.release(order.id);}catch{/* retried next cycle */}}}
}
