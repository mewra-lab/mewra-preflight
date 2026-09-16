import { z } from "zod";
import { PreFlightSnapshotSchema, CheckFindingSchema } from "./types.js";

export const ExtensionMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("snapshot"),
    payload: PreFlightSnapshotSchema,
  }),
  z.object({
    type: z.literal("running"),
    checkId: z.string(),
  }),
  z.object({
    type: z.literal("error"),
    message: z.string(),
  }),
  z.object({
    type: z.literal("findings"),
    checkId: z.string(),
    findings: z.array(CheckFindingSchema),
  }),
  z.object({
    type: z.literal("quickFixFailed"),
    checkId: z.string(),
    file: z.string().optional(),
  }),
  z.object({
    type: z.literal("quickFixDone"),
    checkId: z.string(),
    file: z.string().optional(),
  }),
]);

export type ExtensionMessage = z.infer<typeof ExtensionMessageSchema>;

export const WebviewMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("runPipeline"),
    scope: z.enum(["branch", "staged", "working"]).optional(),
  }),
  z.object({
    type: z.literal("changeDiffScope"),
    scope: z.enum(["branch", "staged", "working"]),
  }),
  z.object({
    type: z.literal("quickFix"),
    checkId: z.string(),
    file: z.string().optional(),
  }),
  z.object({
    type: z.literal("selectTargetBranch"),
  }),
  z.object({
    type: z.literal("launchPR"),
  }),
  z.object({
    type: z.literal("openFile"),
    path: z.string(),
    line: z.number().int().nonnegative(),
  }),
  z.object({
    type: z.literal("openExternal"),
    url: z.string().url(),
  }),
  z.object({
    type: z.literal("markManualCheck"),
    checkId: z.string(),
    done: z.boolean(),
  }),
  z.object({
    type: z.literal("installTool"),
    checkId: z.string(),
  }),
  z.object({
    type: z.literal("configureCheck"),
    checkId: z.string(),
  }),
  z
    .object({
      type: z.literal("openCheckResults"),
      checkId: z.string().min(1).max(256),
    })
    .strict(),
  z.object({
    type: z.literal("openConfig"),
  }),
  z.object({
    type: z.literal("ready"),
  }),
]);

export type WebviewMessage = z.infer<typeof WebviewMessageSchema>;
