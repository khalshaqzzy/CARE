import { Injectable } from '@nestjs/common';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import { RoutingCategory, Severity } from '@prisma/client';
import { z } from 'zod';
import { loadConfig } from '../config';
import {
  CLASSIFICATION_PROMPT_VERSION,
  CLASSIFICATION_SCHEMA,
  CLASSIFICATION_SYSTEM_PROMPT,
} from './prompt';

const outputSchema = z
  .object({
    category: z.nativeEnum(RoutingCategory),
    severity: z.nativeEnum(Severity),
    confidence: z.number().min(0).max(1),
    rationaleCode: z.enum([
      'SAFETY_HAZARD',
      'FACILITY_ISSUE',
      'WORK_PROCESS',
      'PEOPLE_ISSUE',
      'QUALITY_RISK',
      'APPRECIATION_IDEA',
      'AMBIGUOUS',
    ]),
  })
  .strict();
export type ClassificationInput = {
  area: string;
  department: string;
  title: string;
  detail: string;
};

@Injectable()
export class AiService {
  async classify(input: ClassificationInput) {
    const config = loadConfig();
    const started = Date.now();
    if (!config.VERTEX_API_KEY)
      return {
        source: 'MANUAL_FALLBACK' as const,
        fallbackCode: 'PROVIDER_NOT_CONFIGURED',
        latencyMs: 0,
      };
    const client = new GoogleGenAI({
      vertexai: true,
      apiKey: config.VERTEX_API_KEY,
      apiVersion: 'v1',
      httpOptions: { timeout: config.VERTEX_TIMEOUT_MS },
    });
    let lastCode = 'PROVIDER_ERROR';
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await client.models.generateContent({
          model: config.VERTEX_MODEL,
          contents: JSON.stringify(input),
          config: {
            systemInstruction: CLASSIFICATION_SYSTEM_PROMPT,
            temperature: 0,
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW, includeThoughts: false },
            responseMimeType: 'application/json',
            responseJsonSchema: CLASSIFICATION_SCHEMA,
          },
        });
        const parsed = outputSchema.safeParse(JSON.parse(response.text ?? ''));
        if (!parsed.success) {
          lastCode = 'INVALID_SCHEMA';
          break;
        }
        if (parsed.data.confidence < config.VERTEX_CONFIDENCE_THRESHOLD)
          return {
            source: 'MANUAL_FALLBACK' as const,
            fallbackCode: 'LOW_CONFIDENCE',
            candidate: parsed.data,
            latencyMs: Date.now() - started,
          };
        return {
          source: 'AI' as const,
          result: parsed.data,
          latencyMs: Date.now() - started,
          responseId: response.responseId,
          inputTokens: response.usageMetadata?.promptTokenCount,
          outputTokens: response.usageMetadata?.candidatesTokenCount,
          model: config.VERTEX_MODEL,
          location: config.VERTEX_LOCATION,
          promptVersion: CLASSIFICATION_PROMPT_VERSION,
        };
      } catch (error) {
        lastCode = this.safeErrorCode(error);
        if (attempt === 0 && ['RATE_LIMITED', 'TIMEOUT', 'TRANSIENT'].includes(lastCode)) continue;
      }
    }
    return {
      source: 'MANUAL_FALLBACK' as const,
      fallbackCode: lastCode,
      latencyMs: Date.now() - started,
    };
  }
  private safeErrorCode(error: unknown) {
    const text = error instanceof Error ? error.name.toLowerCase() : '';
    if (text.includes('timeout') || text.includes('abort')) return 'TIMEOUT';
    return 'PROVIDER_ERROR';
  }
}
