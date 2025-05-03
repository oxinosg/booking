import {
  Controller,
  Post,
  Put,
  Delete,
  Body,
  Param,
  ParseIntPipe,
  HttpCode,
} from '@nestjs/common';
import { AppointmentService } from './appointment.service';
import {
  CreateAppointmentDto,
  CreateAppointmentSchema,
  UpdateAppointmentDto,
  UpdateAppointmentSchema,
} from './appointment.dto';
import { ZodValidationPipe } from '../common/param-validation.pipe';

@Controller('appointments')
export class AppointmentController {
  constructor(private appointmentService: AppointmentService) {}

  @Post()
  async createAppointment(
    @Body(new ZodValidationPipe(CreateAppointmentSchema))
    dto: CreateAppointmentDto,
  ) {
    return this.appointmentService.create(dto);
  }

  // TODO set modifiable state off if too close to appointment
  @Put(':id')
  async rescheduleAppointment(
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(UpdateAppointmentSchema))
    dto: UpdateAppointmentDto,
  ) {
    return this.appointmentService.reschedule(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  async cancelAppointment(@Param('id', ParseIntPipe) id: number) {
    await this.appointmentService.cancel(id);
  }
}
