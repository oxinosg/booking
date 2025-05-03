import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

@Injectable()
export class AppointmentEventsListener {
  private readonly logger = new Logger(AppointmentEventsListener.name);

  @OnEvent('*', { async: true })
  handleAllAppointmentEvents(event: AppointmentEvent) {
    this.logger.log(
      `[AppointmentEvent] ${event.eventType} – payload: ${JSON.stringify(
        event.payload,
      )}`,
    );
  }
}

// Utility to generate the base data to be used for EventEmitter
export function appointmentEvent<T extends AppointmentEventType>(
  eventType: T,
  payload: Extract<AppointmentEvent, { eventType: T }>['payload'],
): [T, Extract<AppointmentEvent, { eventType: T }>] {
  const e = {
    eventId: `evt_${Math.random().toString(36).substr(2, 9)}`,
    eventType,
    timestamp: new Date().toISOString(),
    payload,
  } as Extract<AppointmentEvent, { eventType: T }>;

  return [eventType, e];
}

export type AppointmentEventType =
  | 'APPOINTMENT_CONFIRMED'
  | 'APPOINTMENT_CANCELLED'
  | 'APPOINTMENT_RESCHEDULED';

interface BaseEvent<T extends AppointmentEventType, P> {
  eventId: string;
  eventType: T;
  timestamp: string;
  payload: P;
}

export interface AppointmentConfirmedPayload {
  appointmentId: number;
  patientId: string;
  providerId: string;
  appointmentTime: string;
}

export type AppointmentConfirmedEvent = BaseEvent<
  'APPOINTMENT_CONFIRMED',
  AppointmentConfirmedPayload
>;

export interface AppointmentCancelledPayload {
  appointmentId: number;
  reason: string;
}

export type AppointmentCancelledEvent = BaseEvent<
  'APPOINTMENT_CANCELLED',
  AppointmentCancelledPayload
>;

export interface AppointmentRescheduledPayload {
  appointmentId: number;
  patientId: string;
  providerId: string;
  previousAppointmentTime: string;
  newAppointmentTime: string;
}

export type AppointmentRescheduledEvent = BaseEvent<
  'APPOINTMENT_RESCHEDULED',
  AppointmentRescheduledPayload
>;

export type AppointmentEvent =
  | AppointmentConfirmedEvent
  | AppointmentCancelledEvent
  | AppointmentRescheduledEvent;
