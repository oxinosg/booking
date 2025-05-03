import { Injectable, NotFoundException } from '@nestjs/common';
import {
  startOfDay,
  set,
  endOfDay,
  eachDayOfInterval,
  isBefore,
  addMinutes,
  isAfter,
  format,
  getDay,
} from 'date-fns';

import { PrismaService } from '../prisma/prisma.service';
import { SetScheduleDto } from './provider.dto';

const DAY_NAME_TO_NUMBER: Record<string, number> = {
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
  sunday: 7,
};

@Injectable()
export class ProviderService {
  constructor(private prisma: PrismaService) {}

  async setSchedule(providerId: string, dto: SetScheduleDto): Promise<void> {
    // 1. Fetch provider data
    const provider = await this.prisma.provider.findUnique({
      where: { id: providerId },
    });

    if (!provider) {
      // NOTE for now we just create the provider instead of throwing an error
      await this.prisma.provider.create({
        data: {
          id: providerId,
        },
      });
    }

    // 2. Transform new weekly schedule to daily entries
    const daily_schedule_list = Object.entries(dto.weeklySchedule).map(
      ([dayName, { start, end }]) => {
        const dayOfWeek = DAY_NAME_TO_NUMBER[dayName];

        if (!dayOfWeek) {
          throw new Error(`Invalid day name "${dayName}"`);
        }

        return {
          providerId,
          dayOfWeek,
          startTime: start,
          endTime: end,
        };
      },
    );

    // 3. Build the transaction operations to disable existing schedule entries
    const disableAll = this.prisma.schedule.updateMany({
      where: { providerId },
      data: { status: 'INACTIVE' },
    });

    // Build the transaction operations to add new schedule days
    // or update existing ones
    const upserts = daily_schedule_list.map((e) =>
      this.prisma.schedule.upsert({
        where: {
          providerId_dayOfWeek: {
            providerId,
            dayOfWeek: e.dayOfWeek,
          },
        },
        update: {
          startTime: e.startTime,
          endTime: e.endTime,
          status: 'ACTIVE',
        },
        create: {
          providerId: e.providerId,
          dayOfWeek: e.dayOfWeek,
          startTime: e.startTime,
          endTime: e.endTime,
          status: 'ACTIVE',
        },
      }),
    );

    // 4. Execute everything atomically
    await this.prisma.$transaction([disableAll, ...upserts]);
  }

  async listAvailableSlots(
    providerId: string,
    from: Date,
    to: Date,
  ): Promise<{ date: string; slots: string[] }[]> {
    // 1. Fetch provider data
    const provider = await this.prisma.provider.findUnique({
      where: { id: providerId },
    });

    if (!provider) {
      throw new NotFoundException(`Provider ${providerId} not found`);
    }

    const duration = provider.appointmentDuration;
    const startDate = startOfDay(from);
    const endDate = endOfDay(to);

    // 2. Load all active schedule entries for this provider
    const schedules = await this.prisma.schedule.findMany({
      where: { providerId, status: 'ACTIVE' },
      select: { dayOfWeek: true, startTime: true, endTime: true },
    });

    // 3. Fetch existing confirmed appointments in that span
    const existingAppts = await this.prisma.appointment.findMany({
      where: {
        providerId,
        status: 'CONFIRMED',
        startTime: { gte: startDate, lte: endDate },
      },
      select: { startTime: true, endTime: true },
    });

    // 4. Compile per day the available time slots
    const results: { date: string; slots: string[] }[] = [];

    for (const day of eachDayOfInterval({ start: startDate, end: endDate })) {
      const jsDay = getDay(day); // 0 = Sunday ... 6 = Saturday
      const dayOfWeek = jsDay === 0 ? 7 : jsDay; // 1 = Monday ... 7 = Sunday

      // 4.1. Get active schedule segments for this weekday
      const segments = schedules.filter((s) => s.dayOfWeek === dayOfWeek);
      if (segments.length === 0) {
        continue; // no working hours this day
      }

      const daySlots: string[] = [];

      // 4.2. For each segment, carve out free slots
      for (const seg of segments) {
        const [sh, sm] = seg.startTime.split(':').map(Number);
        const [eh, em] = seg.endTime.split(':').map(Number);

        // segment start/end on this day
        const segStart = set(day, {
          hours: sh,
          minutes: sm,
          seconds: 0,
          milliseconds: 0,
        });
        const segEnd = set(day, {
          hours: eh,
          minutes: em,
          seconds: 0,
          milliseconds: 0,
        });

        // step through in duration chunks
        for (
          let slotStart = segStart;
          isBefore(slotStart, segEnd);
          slotStart = addMinutes(slotStart, duration)
        ) {
          const slotEnd = addMinutes(slotStart, duration);

          // skip if overlapping an existing appt
          const overlap = existingAppts.some(
            ({ startTime, endTime }) =>
              isBefore(startTime, slotEnd) && isAfter(endTime, slotStart),
          );

          if (!overlap) {
            daySlots.push(format(slotStart, 'HH:mm'));
          }
        }
      }

      // push only days with time slots
      if (daySlots.length > 0) {
        results.push({
          date: format(day, 'yyyy-MM-dd'),
          slots: daySlots,
        });
      }
    }

    return results;
  }
}
