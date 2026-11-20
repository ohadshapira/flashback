import { z } from 'zod';
import { LIMITS } from './config';
import { isValidMonthYear } from './date';
import { PARTNERS_LIMITS, PLACE_ICONS } from './partners';

export const lat = z.number().min(-90).max(90);
export const lng = z.number().min(-180).max(180);
export const month = z.number().int().min(1).max(12);
export const year = z.number().int().min(LIMITS.minYear).max(3000);

export const partnersSchema = z.object({
  childName: z.string().trim().min(1).max(PARTNERS_LIMITS.nameMax),
  parentName: z.string().trim().min(1).max(PARTNERS_LIMITS.nameMax),
  birth: z
    .object({ month, year })
    .refine((b) => isValidMonthYear(b), 'invalid birth month')
    .nullish()
    .transform((b) => b ?? null),
  places: z
    .array(z.object({ icon: z.enum(PLACE_ICONS), label: z.string().trim().min(1).max(PARTNERS_LIMITS.labelMax), lat, lng }))
    .max(PARTNERS_LIMITS.maxPlaces)
    .default([]),
});

export const createGameSchema = z.object({
  mode: z.enum(['couple', 'family_shared', 'party']),
  title: z.string().trim().max(LIMITS.titleMax).optional(),
  targetCount: z.number().int().min(LIMITS.minPhotos).max(LIMITS.maxPhotos).optional(),
  /** Party only. */
  style: z.enum(['classic', 'scratch']).optional(),
  /** Family & Friends only: the parent-and-child profile (see lib/partners). */
  partners: partnersSchema.optional(),
});

export const scratchSchema = z.object({ cells: z.array(z.number().int().min(0).max(1000)).min(1).max(300) });

export const guessSchema = z.object({ lat, lng, month, year });

export const photoPatchSchema = z
  .object({
    answer: z.object({ lat, lng, month, year }).optional(),
    title: z.string().trim().max(LIMITS.titleMax).nullable().optional(),
    story: z.string().trim().max(LIMITS.storyMax).nullable().optional(),
    cropCenterX: z.number().min(0).max(1).optional(),
    cropCenterY: z.number().min(0).max(1).optional(),
  })
  .strict();

export const reorderSchema = z.object({ ids: z.array(z.string().min(1)).min(1).max(LIMITS.maxPhotos) });

export const joinSchema = z.object({ name: z.string().trim().min(1).max(LIMITS.nameMax) });

export const patchGameSchema = z.object({ title: z.string().trim().max(LIMITS.titleMax).nullable() });
