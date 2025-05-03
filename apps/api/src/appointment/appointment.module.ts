import { Module } from '@nestjs/common';

import { AppointmentService } from './appointment.service';
import { AppointmentController } from './appointment.controller';
import { AppointmentEventsListener } from './appointment.events';

@Module({
  controllers: [AppointmentController],
  providers: [AppointmentService, AppointmentEventsListener],
})
export class AppointmentModule {}
