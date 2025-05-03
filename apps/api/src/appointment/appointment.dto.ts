import { z } from 'zod';

export const CreateAppointmentSchema = z.object({
  patientId: z.string(),
  providerId: z.string(),
  startTime: z.string().datetime({ offset: true }),
});

export const UpdateAppointmentSchema = z.object({
  startTime: z.string().datetime({ offset: true }),
});

export type CreateAppointmentDto = z.infer<typeof CreateAppointmentSchema>;
export type UpdateAppointmentDto = z.infer<typeof UpdateAppointmentSchema>;
