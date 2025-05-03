import {
  Injectable,
  ConflictException,
  NotFoundException,
  InternalServerErrorException,
  Inject,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { addMinutes, getDay, isAfter, isBefore, parseISO, set } from 'date-fns';

import { CreateAppointmentDto, UpdateAppointmentDto } from './appointment.dto';
import { PrismaService } from '../prisma/prisma.service';
import { appointmentEvent } from './appointment.events';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';

@Injectable()
export class AppointmentService {
  constructor(
    @Inject(CACHE_MANAGER) private cacheManager: Cache,

    private prisma: PrismaService,
    private eventEmitter: EventEmitter2,
  ) {}

  async create(dto: CreateAppointmentDto) {
    const { patientId, providerId, startTime: startTimeStr } = dto;
    const start = parseISO(startTimeStr);

    // 1. Fetch provider data and prepare date date
    const provider = await this.prisma.provider.findUnique({
      where: { id: providerId },
    });

    if (!provider) {
      throw new NotFoundException(`Provider ${providerId} not found`);
    }

    // 2. Acquiring distributed lock through redis that this service
    // is trying to book a specific appointment time slot
    const lockKey = this.makeLockKey(dto.providerId, start);

    if (!(await this.acquireLock(lockKey))) {
      throw new ConflictException('Slot is being booked by someone else');
    }

    const end = addMinutes(start, provider.appointmentDuration);
    const jsDay = getDay(start); // 0 = Sun ... 6 = Sat
    const dayOfWeek = jsDay === 0 ? 7 : jsDay; // 1 = Mon ... 7 = Sun

    // 3. Fetch schedule data and verify start time is within schedule
    const schedule = await this.prisma.schedule.findMany({
      where: { providerId, dayOfWeek },
    });

    const withinSchedule = schedule.some((slot) => {
      const [sh, sm] = slot.startTime.split(':').map(Number);
      const [eh, em] = slot.endTime.split(':').map(Number);

      const slotStart = set(start, {
        hours: sh,
        minutes: sm,
        seconds: 0,
        milliseconds: 0,
      });

      const slotEnd = set(start, {
        hours: eh,
        minutes: em,
        seconds: 0,
        milliseconds: 0,
      });

      return !isBefore(start, slotStart) && !isAfter(end, slotEnd);
    });

    if (!withinSchedule) {
      await this.releaseLock(lockKey);

      throw new ConflictException(
        'Requested time is outside provider working hours',
      );
    }

    // 4. verify confilicts don't exist and create appointment
    try {
      // Use a transaction to ensure atomicity and apply lock for concurrency control
      const appointment = await this.prisma.$transaction(async (tx) => {
        // Check availability inside the transaction ensuring no conflict appeared
        const overlap = await tx.appointment.findFirst({
          where: {
            providerId,
            status: { not: 'CANCELLED' },
            OR: [{ startTime: { lt: end }, endTime: { gt: start } }],
          },
        });

        if (overlap) {
          throw new ConflictException(
            'Provider is not available at the requested time',
          );
        }

        return tx.appointment.create({
          data: {
            patientId,
            providerId,
            startTime: start,
            endTime: end,
          },
        });
      });

      // Emit event for the creation of the appointment
      await this.eventEmitter.emitAsync(
        ...appointmentEvent('APPOINTMENT_CONFIRMED', {
          appointmentId: appointment.id,
          patientId: appointment.patientId,
          providerId: appointment.providerId,
          appointmentTime: appointment.startTime.toISOString(),
        }),
      );

      return {
        appointmentId: appointment.id,
        status: appointment.status,
        patientId: appointment.patientId,
        providerId: appointment.providerId,
        startTime: appointment.startTime.toISOString(),
        endTime: appointment.endTime.toISOString(),
      };
    } catch (error) {
      if (error instanceof ConflictException) {
        // Propagate conflict so the controller can return 409 status
        throw error;
      }

      // Handle any other errors
      throw new InternalServerErrorException('Failed to book appointment');
    } finally {
      await this.releaseLock(lockKey);
    }
  }

  async reschedule(id: number, dto: UpdateAppointmentDto) {
    const { startTime: startTimeStr } = dto;

    const start = parseISO(startTimeStr);

    // 1. Fetch existing appointment
    const existing = await this.prisma.appointment.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException(`Appointment ${id} not found`);
    }

    // 2. Fetch provider's duration and prepare date data
    const provider = await this.prisma.provider.findUnique({
      where: { id: existing.providerId },
      select: { appointmentDuration: true },
    });

    if (!provider) {
      throw new NotFoundException(`Provider ${existing.providerId} not found`);
    }

    // 2. Acquiring distributed lock through redis that this service
    // is trying to book a specific appointment time slot
    const lockKey = this.makeLockKey(existing.providerId, start);
    if (!(await this.acquireLock(lockKey))) {
      throw new ConflictException('Slot is being booked by someone else');
    }

    const end = addMinutes(start, provider.appointmentDuration);
    const jsDay = getDay(start); // 0 = Sun ... 6 = Sat
    const dayOfWeek = jsDay === 0 ? 7 : jsDay; // 1 = Mon ... 7 = Sun

    // 3. Fetch schedule data and verify start time is within schedule
    const schedule = await this.prisma.schedule.findMany({
      where: { providerId: existing.providerId, dayOfWeek },
    });

    const withinSchedule = schedule.some((schedule) => {
      const { startTime: sTime, endTime: eTime } = schedule;
      const [sh, sm] = sTime.split(':').map(Number);
      const [eh, em] = eTime.split(':').map(Number);

      const scheduleStart = set(start, {
        hours: sh,
        minutes: sm,
        seconds: 0,
        milliseconds: 0,
      });

      const scheduleEnd = set(start, {
        hours: eh,
        minutes: em,
        seconds: 0,
        milliseconds: 0,
      });

      return !isBefore(start, scheduleStart) && !isAfter(end, scheduleEnd);
    });

    if (!withinSchedule) {
      throw new ConflictException(
        'Requested time is outside provider working hours',
      );
    }

    // 4. verify confilicts don't exist and update appointment
    try {
      const updated = await this.prisma.$transaction(async (tx) => {
        const overlap = await tx.appointment.findFirst({
          where: {
            providerId: existing.providerId,
            id: { not: id },
            status: { not: 'CANCELLED' },
            OR: [{ startTime: { lt: end }, endTime: { gt: start } }],
          },
        });

        if (overlap) {
          throw new ConflictException(
            'Provider has another appointment at the new time',
          );
        }

        return tx.appointment.update({
          where: { id },
          data: { startTime: start, endTime: end },
        });
      });

      // Emit event for the reschedule of the appointment
      await this.eventEmitter.emitAsync(
        ...appointmentEvent('APPOINTMENT_RESCHEDULED', {
          appointmentId: updated.id,
          patientId: updated.patientId,
          providerId: updated.providerId,
          newAppointmentTime: updated.startTime.toISOString(),
          previousAppointmentTime: existing.startTime.toISOString(),
        }),
      );

      return updated;
    } catch (error) {
      if (error instanceof ConflictException) {
        // Propagate conflict so the controller can return 409 status
        throw error;
      }

      // Handle any other errors
      throw new InternalServerErrorException('Failed to book appointment');
    } finally {
      await this.releaseLock(lockKey);
    }
  }

  // Emit events for downstream
  async cancel(id: number): Promise<void> {
    // 1. Fetch existing appointment
    const appointment = await this.prisma.appointment.findUnique({
      where: { id },
    });

    if (!appointment) {
      throw new NotFoundException(`Appointment ${id} not found`);
    }

    // 2. Mark it as cancelled
    await this.prisma.appointment.update({
      where: { id },
      data: { status: 'CANCELLED' },
    });

    // Emit event for the cancellation of the appointment
    await this.eventEmitter.emitAsync(
      ...appointmentEvent('APPOINTMENT_CANCELLED', {
        appointmentId: appointment.id,
        reason: 'PATIENT_REQUEST',
      }),
    );
  }

  private makeLockKey(providerId: string, slotTime: Date) {
    const datePart = slotTime.toISOString().slice(0, 16); // "2025-05-20T14:30"
    return `lock:${providerId}:${datePart}`;
  }

  // Creating distributed lock through redis to use in a microservice context
  // in order to coordinate across multiple instances of appointment services
  // that this service is trying to book a specific appointment time slot
  private async acquireLock(key: string): Promise<boolean> {
    const existing = await this.cacheManager.get(key);

    if (existing) return false;

    await this.cacheManager.set(key, true);

    return true;
  }

  private async releaseLock(key: string): Promise<void> {
    await this.cacheManager.del(key);
  }
}
