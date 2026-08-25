import { Injectable } from '@nestjs/common';
import { LocationCompleteness, RoutingCategory, Severity, VoiceVisibility } from '@prisma/client';
import OpenAI from 'openai';
import { z } from 'zod';
import { loadConfig } from '../config';
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
      };
    const parsed = classificationOutput.safeParse(response.value);
    if (
      !parsed.success ||
      (input.visibility === 'PRIVATE'
        ? parsed.data.category !== null
        : parsed.data.category === null)
    )
      return {
        source: 'MANUAL_FALLBACK' as const,
        fallbackCode: 'INVALID_SCHEMA',
        latencyMs: response.latencyMs,
      };
    if (parsed.data.confidence < loadConfig().OPENAI_CONFIDENCE_THRESHOLD)
      return {
        source: 'MANUAL_FALLBACK' as const,
        fallbackCode: 'LOW_CONFIDENCE',
        candidate: parsed.data,
        latencyMs: response.latencyMs,
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
    if (!parsed.success)
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
    if (!config.OPENAI_API_KEY || !config.OPENAI_MODEL || !config.OPENAI_BASE_URL)
      return { ok: false as const, fallbackCode: 'PROVIDER_NOT_CONFIGURED', latencyMs: 0 };
    const client = new OpenAI({
      apiKey: config.OPENAI_API_KEY,
      baseURL: config.OPENAI_BASE_URL,
      timeout: config.OPENAI_TIMEOUT_MS,
      maxRetries: 0,
    });
    let fallbackCode = 'PROVIDER_ERROR';
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const result = await client.responses.create({
          model: config.OPENAI_MODEL,
          store: false,
          instructions,
          input: JSON.stringify(input),
          text: { format: { type: 'json_schema', name, strict: true, schema } },
        });
        if (result.status === 'incomplete')
          return {
            ok: false as const,
            fallbackCode: 'INCOMPLETE',
            latencyMs: Date.now() - started,
          };
        if (!result.output_text)
          return {
            ok: false as const,
            fallbackCode: 'EMPTY_OUTPUT',
            latencyMs: Date.now() - started,
          };
        return {
          ok: true as const,
          value: JSON.parse(result.output_text) as unknown,
          responseId: result.id,
          model: config.OPENAI_MODEL,
          latencyMs: Date.now() - started,
        };
      } catch (error) {
        if (error instanceof SyntaxError)
          return {
            ok: false as const,
            fallbackCode: 'INVALID_SCHEMA',
            latencyMs: Date.now() - started,
          };
        fallbackCode = this.safeErrorCode(error);
        if (attempt === 0 && ['RATE_LIMITED', 'TIMEOUT', 'TRANSIENT'].includes(fallbackCode))
          continue;
      }
    }
    return { ok: false as const, fallbackCode, latencyMs: Date.now() - started };
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
