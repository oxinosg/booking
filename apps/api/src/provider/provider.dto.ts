import { z } from 'zod';

// Accepts a "HH:MM" string, prepends ":00" to turn it into "HH:MM:SS",
// validates, then strips off the ":00" again so your output stays "HH:MM"
const TimeHHMM = z
  .preprocess(
    (val) => {
      // only transform if it’s a string in the form "DD:DD"
      if (typeof val === 'string' && val.length === 5 && val[2] === ':') {
        // turns "HH:MM" to "HH:MM:00"
        return `${val}:00`;
      }
      return val;
    },
    z.string().time({ precision: 0 }),
  )
  .transform((full) => full.slice(0, 5)); // back to "HH:MM"

// schema for a single day’s window
const WeeklyDaySchema = z.object({
  start: TimeHHMM,
  end: TimeHHMM,
});

const WeeklySlotSchema = z.object({
  monday: WeeklyDaySchema,
  tuesday: WeeklyDaySchema,
  wednesday: WeeklyDaySchema,
  thursday: WeeklyDaySchema,
  friday: WeeklyDaySchema,
  // saturday: WeeklyDaySchema.optional(),
  // sunday: WeeklyDaySchema.optional(),
});

export const SetScheduleSchema = z.object({
  appointmentDuration: z
    .number()
    .int({ message: 'Duration must be an integer' })
    .min(1, { message: 'Duration must be at least 1 minute' }),
  weeklySchedule: WeeklySlotSchema,
  // TODO add timezone string validation utility
  // timezone:
});

export type WeeklyDay = z.infer<typeof WeeklyDaySchema>;
export type WeeklySlot = z.infer<typeof WeeklyDaySchema>;
export type SetScheduleDto = z.infer<typeof SetScheduleSchema>;
