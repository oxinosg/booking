import { Controller, Param, Body, Query, Post, Get } from '@nestjs/common';
import { endOfDay, startOfDay } from 'date-fns';

import { ProviderService } from './provider.service';
import { ParseDatePipe } from '../common/parse-date.pipe';
import { SetScheduleDto } from './provider.dto';

@Controller('providers')
export class ProviderController {
  constructor(private providerService: ProviderService) {}

  @Post(':id/schedule')
  async setSchedule(
    @Param('id') id: string,
    @Body() dto: SetScheduleDto,
  ): Promise<{ message: string }> {
    await this.providerService.setSchedule(id, dto);

    return { message: 'Schedule updated successfully' };
  }

  @Get(':id/availability')
  async getAvailability(
    @Param('id') id: string,
    @Query('date', ParseDatePipe) date: Date,
  ) {
    const startDate = startOfDay(date);
    const endDate = endOfDay(date);

    return this.providerService.listAvailableSlots(id, startDate, endDate);
  }
}
