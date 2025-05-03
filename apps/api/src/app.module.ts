import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { CacheModule } from '@nestjs/cache-manager';
import { redisStore } from 'cache-manager-redis-yet';

import { AppointmentModule } from './appointment/appointment.module';
import { AppController } from './app.controller';
import { ProviderModule } from './provider/provider.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  controllers: [AppController],
  imports: [
    CacheModule.registerAsync({
      isGlobal: true,
      useFactory: async () => ({
        store: await redisStore({
          url: 'redis://localhost:6379',
        }),
      }),
    }),
    EventEmitterModule.forRoot({
      wildcard: true,
    }),
    PrismaModule,
    ProviderModule,
    AppointmentModule,
  ],
})
export class AppModule {}
