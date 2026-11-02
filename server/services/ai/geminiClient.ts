import { GoogleGenAI } from "@google/genai";
import { config } from '../../config';

let aiClient: GoogleGenAI | null = null;

// Cache of models that have exhausted daily quota to prevent wasteful attempts
const quotaExhaustedUntil = new Map<string, number>();

export function isDailyQuotaError(error: any): boolean {
  const str = String(error?.message || error || '').toLowerCase();
  return (
    str.includes('generaterequestsperday') ||
    str.includes('limit: 20') ||
    str.includes('resource_exhausted') ||
    str.includes('daily_limit') ||
    str.includes('free_tier_requests')
  );
}

export function getCandidateModels(preferredModel: string = 'gemini-3.1-flash-lite'): string[] {
  const now = Date.now();
  // gemini-3.1-flash-lite is the designated high-quota workhorse model for text and vision
  const allCandidates = [
    'gemini-3.1-flash-lite',
    preferredModel,
    'gemini-flash-latest'
  ];
  const unique = Array.from(new Set(allCandidates.filter(Boolean)));
  
  // Exclude models currently marked as quota-exhausted
  const available = unique.filter(m => {
    const expiry = quotaExhaustedUntil.get(m);
    return !expiry || expiry < now;
  });

  return available.length > 0 ? available : ['gemini-3.1-flash-lite'];
}

export async function generateContentWithFallback(
  client: GoogleGenAI,
  req: { contents: any; config?: any },
  preferredModel: string = 'gemini-3.1-flash-lite'
): Promise<any> {
  const candidates = getCandidateModels(preferredModel);
  let lastError: any = null;

  for (let i = 0; i < candidates.length; i++) {
    const currentModel = candidates[i];
    try {
      const response = await retryWithBackoff(async () => {
        return await client.models.generateContent({
          model: currentModel,
          contents: req.contents,
          config: req.config
        });
      }, 2, 600);

      return response;
    } catch (err: any) {
      lastError = err;
      if (isDailyQuotaError(err)) {
        quotaExhaustedUntil.set(currentModel, Date.now() + 3600_000);
      }
      if (i < candidates.length - 1) {
        console.warn(`[GEMINI API] Attempt with ${currentModel} returned notice (${err?.message?.substring(0, 120) || err}). Switching to next candidate ${candidates[i + 1]}...`);
      }
    }
  }

  throw lastError || new Error('All candidate models failed');
}

export async function getGeminiContent(
  prompt: string,
  modelName: string = 'gemini-3.1-flash-lite',
  imageAttachment?: { mimeType: string; data: string },
  customConfig?: any
) {
  const client = getAiClient();
  if (!client) {
    throw new Error('Gemini API key is not configured');
  }

  const parts: any[] = [];
  if (imageAttachment) {
    parts.push({
      inlineData: {
        data: imageAttachment.data,
        mimeType: imageAttachment.mimeType
      }
    });
  }
  parts.push({ text: prompt });

  const response = await generateContentWithFallback(
    client,
    {
      contents: { parts },
      config: customConfig
    },
    modelName
  );
  return response.text || '';
}

export function getAiClient(): GoogleGenAI | null {
  if (!aiClient) {
    const key = config.geminiApiKey;
    if (!key || key === "MY_GEMINI_API_KEY" || key.trim() === "") {
      console.warn("[GEMINI API] GEMINI_API_KEY is not defined. Falling back to structured professional mock insights.");
      return null;
    }
    aiClient = new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
  return aiClient;
}

/**
 * Retries an API function with exponential backoff on transient errors like 503 or temporary 429
 */
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  retries = 2,
  delay = 700
): Promise<T> {
  try {
    return await fn();
  } catch (error: any) {
    // If it's a daily quota exhaustion, retrying won't help; bail immediately so caller can switch models
    if (isDailyQuotaError(error)) {
      throw error;
    }

    const errorStr = String(error?.message || error || '').toLowerCase();
    const isTransient = 
      error?.status === 503 || 
      (error?.status === 429 && !isDailyQuotaError(error)) || 
      errorStr.includes("503") || 
      errorStr.includes("demand") ||
      errorStr.includes("serviceunavailable") ||
      errorStr.includes("overloaded") ||
      errorStr.includes("unavailable");

    if (retries > 0 && isTransient) {
      console.log(`[GEMINI API] Temporary service status limits. Retrying in ${delay}ms... (${retries} attempts left)`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return retryWithBackoff(fn, retries - 1, delay * 2);
    }
    throw error;
  }
}
