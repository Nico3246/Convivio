import { z } from 'zod';

export const membershipSchema = z.object({
  member_id: z.uuid(),
  household_id: z.uuid(),
  role: z.enum(['ADMIN', 'RESIDENT', 'CONTROLLER']),
  display_name: z.string(),
});
export type Membership = z.infer<typeof membershipSchema>;
export const membershipListSchema = z.array(membershipSchema).max(1);
