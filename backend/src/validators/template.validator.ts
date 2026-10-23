import { z } from "zod";

export const TemplateCategoryEnum = z.enum(["MARKETING", "UTILITY", "AUTHENTICATION"]);

export const HeaderFormatEnum = z.enum(["TEXT", "IMAGE", "DOCUMENT", "VIDEO", "LOCATION"]);

export const ButtonTypeEnum = z.enum(["URL", "PHONE_NUMBER", "QUICK_REPLY"]);

const phoneRegex = /^\+?[1-9]\d{1,14}$/;
const templateNameRegex = /^[a-z0-9_]{1,512}$/;
const urlRegex = /^https?:\/\/.+/i;

export const templateHeaderComponentSchema = z.object({
  type: z.literal("HEADER"),
  format: HeaderFormatEnum.default("TEXT"),
  text: z.string().trim().max(60, "Header text cannot exceed 60 characters").optional(),
  example: z
    .object({
      header_text: z.array(z.string().min(1)).optional(),
      header_handle: z.array(z.string().min(1)).optional(),
    })
    .optional(),
});

export const templateBodyComponentSchema = z.object({
  type: z.literal("BODY"),
  text: z
    .string({ required_error: "Template body text is required" })
    .min(1, "Template body cannot be empty")
    .max(1024, "Template body text cannot exceed 1024 characters"),
  example: z
    .object({
      body_text: z.array(z.array(z.string().min(1, "Variable sample value cannot be empty"))).optional(),
    })
    .optional(),
});

export const templateFooterComponentSchema = z.object({
  type: z.literal("FOOTER"),
  text: z
    .string({ required_error: "Footer text is required when footer component is provided" })
    .trim()
    .min(1, "Footer text cannot be empty")
    .max(60, "Footer text cannot exceed 60 characters"),
});

export const templateButtonSchema = z.object({
  type: ButtonTypeEnum,
  text: z
    .string({ required_error: "Button text is required" })
    .trim()
    .min(1, "Button text cannot be empty")
    .max(25, "Button text cannot exceed 25 characters"),
  url: z.string().trim().max(2000, "URL cannot exceed 2000 characters").optional(),
  phone_number: z.string().trim().optional(),
  example: z.array(z.string().min(1)).optional(),
});

export const templateButtonsComponentSchema = z.object({
  type: z.literal("BUTTONS"),
  buttons: z
    .array(templateButtonSchema)
    .min(1, "At least one button is required in BUTTONS component")
    .max(10, "Cannot exceed 10 buttons"),
});

export const templateComponentSchema = z.discriminatedUnion("type", [
  templateHeaderComponentSchema,
  templateBodyComponentSchema,
  templateFooterComponentSchema,
  templateButtonsComponentSchema,
]);

/**
 * Zod schema for submitting a new WhatsApp template to Meta Cloud API
 */
export const createTemplateSchema = z
  .object({
    name: z
      .string({ required_error: "Template name is required" })
      .trim()
      .min(1, "Template name cannot be empty")
      .max(512, "Template name cannot exceed 512 characters")
      .regex(
        templateNameRegex,
        "Template name must contain only lowercase alphanumeric characters and underscores (a-z, 0-9, _)"
      ),
    category: TemplateCategoryEnum.default("MARKETING"),
    language: z
      .string({ required_error: "Template language is required" })
      .trim()
      .min(2, "Language code must be at least 2 characters")
      .max(10, "Language code cannot exceed 10 characters")
      .default("en_US"),
    components: z
      .array(templateComponentSchema)
      .min(1, "Template must include at least one component (BODY is required)"),
  })
  .superRefine((data, ctx) => {
    // 1. Exactly one BODY component is required
    const bodyComponents = data.components.filter((c) => c.type === "BODY") as Array<
      z.infer<typeof templateBodyComponentSchema>
    >;
    if (bodyComponents.length !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Template must contain exactly one BODY component",
        path: ["components"],
      });
      return;
    }

    const bodyComp = bodyComponents[0];

    // 2. Validate body variables sequentiality and sample data
    const bodyMatches = Array.from(bodyComp.text.matchAll(/\{\{(\d+)\}\}/g));
    const extractedNumbers = bodyMatches.map((m) => parseInt(m[1], 10));

    if (extractedNumbers.length > 0) {
      // Check sequential starting from 1
      for (let i = 0; i < extractedNumbers.length; i++) {
        const expected = i + 1;
        if (extractedNumbers[i] !== expected) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Body variables must be sequential starting at {{1}} without skipping (expected {{${expected}}}, found {{${extractedNumbers[i]}}})`,
            path: ["components"],
          });
          break;
        }
      }

      // Check sample values in example.body_text
      const samples = bodyComp.example?.body_text?.[0];
      if (!samples || samples.length !== extractedNumbers.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Body has ${extractedNumbers.length} variable(s) but provided ${samples?.length || 0} sample value(s) in example.body_text`,
          path: ["components"],
        });
      } else {
        samples.forEach((val, idx) => {
          if (!val || typeof val !== "string" || val.trim().length === 0) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `Sample value for variable {{${idx + 1}}} cannot be empty`,
              path: ["components"],
            });
          }
        });
      }
    }

    // 3. At most one HEADER component
    const headerComponents = data.components.filter((c) => c.type === "HEADER") as Array<
      z.infer<typeof templateHeaderComponentSchema>
    >;
    if (headerComponents.length > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Template can have at most one HEADER component",
        path: ["components"],
      });
    } else if (headerComponents.length === 1) {
      const header = headerComponents[0];
      if (header.format === "TEXT") {
        if (!header.text || header.text.trim().length === 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Text header must include non-empty text",
            path: ["components"],
          });
        } else {
          const headerMatches = Array.from(header.text.matchAll(/\{\{(\d+)\}\}/g));
          if (headerMatches.length > 1) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: "Text header can contain at most one variable ({{1}})",
              path: ["components"],
            });
          } else if (headerMatches.length === 1) {
            if (headerMatches[0][1] !== "1") {
              ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "Header variable must be {{1}}",
                path: ["components"],
              });
            }
            if (!header.example?.header_text?.[0]) {
              ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "Header variable {{1}} requires a sample value in example.header_text",
                path: ["components"],
              });
            }
          }
        }
      }
    }

    // 4. At most one FOOTER component and NO variables allowed
    const footerComponents = data.components.filter((c) => c.type === "FOOTER") as Array<
      z.infer<typeof templateFooterComponentSchema>
    >;
    if (footerComponents.length > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Template can have at most one FOOTER component",
        path: ["components"],
      });
    } else if (footerComponents.length === 1) {
      const footer = footerComponents[0];
      if (/\{\{\d+\}\}/.test(footer.text)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Footer text cannot contain variables",
          path: ["components"],
        });
      }
    }

    // 5. At most one BUTTONS component and valid combinations
    const buttonsComponents = data.components.filter((c) => c.type === "BUTTONS") as Array<
      z.infer<typeof templateButtonsComponentSchema>
    >;
    if (buttonsComponents.length > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Template can have at most one BUTTONS component",
        path: ["components"],
      });
    } else if (buttonsComponents.length === 1) {
      const btns = buttonsComponents[0].buttons;
      const urlBtns = btns.filter((b) => b.type === "URL");
      const phoneBtns = btns.filter((b) => b.type === "PHONE_NUMBER");
      const quickReplyBtns = btns.filter((b) => b.type === "QUICK_REPLY");

      if (quickReplyBtns.length > 0 && (urlBtns.length > 0 || phoneBtns.length > 0)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "QUICK_REPLY buttons cannot be mixed with URL or PHONE_NUMBER buttons",
          path: ["components"],
        });
      }

      if (urlBtns.length > 2) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Template can have at most 2 URL buttons",
          path: ["components"],
        });
      }

      if (phoneBtns.length > 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Template can have at most 1 Phone Number button",
          path: ["components"],
        });
      }

      for (const btn of urlBtns) {
        if (!btn.url || !urlRegex.test(btn.url)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `URL button "${btn.text}" must have a valid URL starting with http:// or https://`,
            path: ["components"],
          });
        }
      }

      for (const btn of phoneBtns) {
        if (!btn.phone_number || !phoneRegex.test(btn.phone_number)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Phone number button "${btn.text}" must have a valid E.164 phone number`,
            path: ["components"],
          });
        }
      }
    }
  });

export type CreateTemplateInput = z.infer<typeof createTemplateSchema>;
