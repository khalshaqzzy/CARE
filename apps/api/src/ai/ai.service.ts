import { Injectable, Logger } from '@nestjs/common';
import { LocationCompleteness, RoutingCategory, Severity, VoiceVisibility } from '@prisma/client';
import OpenAI from 'openai';
import { z } from 'zod';
import { loadConfig } from '../config';
import { sanitizedErrorDetail } from './error-detail';
import {
  CLASSIFICATION_PROMPT_VERSION,
  CLASSIFICATION_SCHEMA,
  CLASSIFICATION_SYSTEM_PROMPT,
  LOCATION_PROMPT_VERSION,
  LOCATION_SCHEMA,
  LOCATION_SYSTEM_PROMPT,
} from './prompt';

const classificationOutput = z
  .object({
    category: z.nativeEnum(RoutingCategory).nullable(),
    severity: z.nativeEnum(Severity),
    confidence: z.number().min(0).max(1),
    rationaleCode: z.enum([
      'SAFETY_HAZARD',
      'ENVIRONMENTAL_RISK',
      'FACILITY_ISSUE',
      'WORK_PROCESS',
      'PEOPLE_ISSUE',
      'QUALITY_RISK',
      'APPRECIATION_IDEA',
      'AMBIGUOUS',
    ]),
  })
  .strict();
const locationOutput = z
  .object({
    completeness: z.nativeEnum(LocationCompleteness),
    warning: z.string().max(500).nullable(),
    questions: z.array(z.string().min(1).max(250)).max(3),
  })
  .strict();

export type ClassificationInput = {
  visibility: VoiceVisibility;
  area?: string;
  title: string;
  detail: string;
};

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  async classify(input: ClassificationInput) {
    const response = await this.request(
      'care_classification',
      CLASSIFICATION_SCHEMA,
      CLASSIFICATION_SYSTEM_PROMPT,
      input,
    );
    if (!response.ok)
      return {
        source: 'MANUAL_FALLBACK' as const,
        fallbackCode: response.fallbackCode,
        latencyMs: response.latencyMs,
        errorDetail: response.errorDetail ?? null,
      };
    const parsed = classificationOutput.safeParse(response.value);
    const categoryMismatch =
      input.visibility === 'PRIVATE'
        ? parsed.success && parsed.data.category !== null
        : parsed.success && parsed.data.category === null;
    if (!parsed.success || categoryMismatch) {
      this.logger.warn(
        `care_ai_classify invalid_schema schemaFailed=${!parsed.success} categoryMismatch=${categoryMismatch || false} latencyMs=${response.latencyMs}`,
      );
      return {
        source: 'MANUAL_FALLBACK' as const,
        fallbackCode: 'INVALID_SCHEMA',
        latencyMs: response.latencyMs,
        errorDetail: null,
      };
    }
    if (parsed.data.confidence < loadConfig().OPENAI_CONFIDENCE_THRESHOLD)
      return {
        source: 'MANUAL_FALLBACK' as const,
        fallbackCode: 'LOW_CONFIDENCE',
        candidate: parsed.data,
        latencyMs: response.latencyMs,
        errorDetail: null,
      };
    return {
      source: 'AI' as const,
      result: parsed.data,
      model: response.model,
      promptVersion: CLASSIFICATION_PROMPT_VERSION,
      responseId: response.responseId,
      latencyMs: response.latencyMs,
    };
  }

  async reviewLocation(input: { area: string; locationDetail: string }) {
    const response = await this.request(
      'care_location_review',
      LOCATION_SCHEMA,
      LOCATION_SYSTEM_PROMPT,
      input,
    );
    if (!response.ok)
      return {
        completeness: LocationCompleteness.UNKNOWN,
        warning: null,
        questions: [],
        model: null,
        promptVersion: LOCATION_PROMPT_VERSION,
        responseId: null,
        latencyMs: response.latencyMs,
        fallbackCode: response.fallbackCode,
      };
    const parsed = locationOutput.safeParse(response.value);
    if (!parsed.success) {
      this.logger.warn(`care_ai_location invalid_schema latencyMs=${response.latencyMs}`);
      return {
        completeness: LocationCompleteness.UNKNOWN,
        warning: null,
        questions: [],
        model: response.model,
        promptVersion: LOCATION_PROMPT_VERSION,
        responseId: response.responseId,
        latencyMs: response.latencyMs,
        fallbackCode: 'INVALID_SCHEMA',
      };
    }
    return {
      ...parsed.data,
      model: response.model,
      promptVersion: LOCATION_PROMPT_VERSION,
      responseId: response.responseId,
      latencyMs: response.latencyMs,
      fallbackCode: null,
    };
  }

  private async request(
    name: string,
    schema: Record<string, unknown>,
    instructions: string,
    input: unknown,
  ) {
    const config = loadConfig();
    const started = Date.now();
    if (!config.OPENAI_API_KEY || !config.OPENAI_MODEL || !config.OPENAI_BASE_URL) {
      this.logger.warn(
        `care_ai_request provider_not_configured name=${name} latencyMs=0 keySet=${Boolean(config.OPENAI_API_KEY)} modelSet=${Boolean(config.OPENAI_MODEL)} baseUrlSet=${Boolean(config.OPENAI_BASE_URL)}`,
      );
      return {
        ok: false as const,
        fallbackCode: 'PROVIDER_NOT_CONFIGURED',
        errorDetail: null,
        latencyMs: 0,
      };
    }
    const client = new OpenAI({
      apiKey: config.OPENAI_API_KEY,
      baseURL: config.OPENAI_BASE_URL,
      timeout: config.OPENAI_TIMEOUT_MS,
      maxRetries: 0,
    });
    let fallbackCode = 'PROVIDER_ERROR';
    let errorDetail: string | null = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const result = await client.responses.create({
          model: config.OPENAI_MODEL,
          reasoning: { effort: config.OPENAI_REASONING_EFFORT },
          store: false,
          instructions,
          input: JSON.stringify(input),
          text: { format: { type: 'json_schema', name, strict: true, schema } },
        });
        if (result.status === 'incomplete') {
          this.logger.warn(
            `care_ai_request incomplete name=${name} latencyMs=${Date.now() - started}`,
          );
          return {
            ok: false as const,
            fallbackCode: 'INCOMPLETE',
            errorDetail: `status=${result.status}`,
            latencyMs: Date.now() - started,
          };
        }
        if (!result.output_text) {
          this.logger.warn(
            `care_ai_request empty_output name=${name} latencyMs=${Date.now() - started}`,
          );
          return {
            ok: false as const,
            fallbackCode: 'EMPTY_OUTPUT',
            errorDetail: null,
            latencyMs: Date.now() - started,
          };
        }
        return {
          ok: true as const,
          value: JSON.parse(result.output_text) as unknown,
          responseId: result.id,
          model: config.OPENAI_MODEL,
          latencyMs: Date.now() - started,
        };
      } catch (error) {
        if (error instanceof SyntaxError) {
          this.logger.warn(
            `care_ai_request invalid_json name=${name} latencyMs=${Date.now() - started}`,
          );
          return {
            ok: false as const,
            fallbackCode: 'INVALID_SCHEMA',
            errorDetail: null,
            latencyMs: Date.now() - started,
          };
        }
        fallbackCode = this.safeErrorCode(error);
        errorDetail = sanitizedErrorDetail(error);
        this.logger.warn(
          `care_ai_request failure name=${name} fallbackCode=${fallbackCode} attempt=${attempt + 1} latencyMs=${Date.now() - started} detail=${errorDetail ?? 'none'}`,
        );
        if (attempt === 0 && ['RATE_LIMITED', 'TIMEOUT', 'TRANSIENT'].includes(fallbackCode))
          continue;
      }
    }
    return { ok: false as const, fallbackCode, errorDetail, latencyMs: Date.now() - started };
  }

  private safeErrorCode(error: unknown) {
    if (error instanceof OpenAI.APIConnectionTimeoutError) return 'TIMEOUT';
    if (error instanceof OpenAI.APIConnectionError) return 'TRANSIENT';
    if (error instanceof OpenAI.APIError) {
      if (error.status === 429) return 'RATE_LIMITED';
      if (error.status && error.status >= 500) return 'TRANSIENT';
    }
    const name = error instanceof Error ? error.name.toLowerCase() : '';
    return name.includes('timeout') || name.includes('abort') ? 'TIMEOUT' : 'PROVIDER_ERROR';
  }
}
