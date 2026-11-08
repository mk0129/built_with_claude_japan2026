import { z } from "zod";

/** 体調記録の入力（作成・編集で共通）。値の範囲・欠測の扱いはサービス側でも検証する */
const vital = z.number().nullable().optional();
export const HealthBody = z.object({
  measuredAt: z.string().min(10).max(40),
  vitals: z.object({ temperature: vital, systolic: vital, diastolic: vital, pulse: vital, spo2: vital, oxygenFlow: vital }).default({}),
  symptoms: z
    .array(
      z.object({
        key: z.string().min(1).max(80),
        severity: z.number().int().min(0).max(4),
        count: z.number().int().min(0).max(99).nullable().optional(),
        location: z.string().max(100).nullable().optional(),
        interference: z.string().max(200).nullable().optional(),
      }),
    )
    .max(60)
    .default([]),
});

