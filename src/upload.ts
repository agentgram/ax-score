import type { AXReport } from './types.js';

export interface UploadOptions {
  apiUrl: string;
  apiKey: string;
  timeout?: number;
}

interface UploadSuccessResponse {
  success: true;
  data: { id: string };
}

interface UploadErrorResponse {
  success: false;
  error: { code: string; message: string };
}

type UploadResponse = UploadSuccessResponse | UploadErrorResponse;

const DEFAULT_UPLOAD_TIMEOUT = 15_000;

/**
 * Upload an AX report to the AgentGram hosted API.
 *
 * Sends a POST request with the full report JSON. Throws on network
 * errors, authentication failures, or unexpected server responses.
 */
export async function uploadReport(
  report: AXReport,
  options: UploadOptions
): Promise<UploadSuccessResponse> {
  const { apiUrl, apiKey, timeout = DEFAULT_UPLOAD_TIMEOUT } = options;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  let res: Response;
  try {
    res = await fetch(apiUrl, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'User-Agent': `AX-Score/${report.version}`,
      },
      body: JSON.stringify(report),
    });
  } catch (err) {
    clearTimeout(timer);
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error(`Upload timed out after ${timeout}ms.`);
    }
    throw new Error(
      `Upload failed: ${err instanceof Error ? err.message : 'Unknown network error'}`
    );
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 401 || res.status === 403) {
    throw new Error(
      'Upload failed: Invalid or expired API key. Check your AGENTGRAM_API_KEY.'
    );
  }

  if (!res.ok) {
    let errorMessage = `Upload failed with status ${res.status}`;
    try {
      const body = (await res.json()) as UploadErrorResponse;
      if (body.error?.message) {
        errorMessage += `: ${body.error.message}`;
      }
    } catch {
      // Could not parse error body
    }
    throw new Error(errorMessage);
  }

  const body = (await res.json()) as UploadResponse;

  if (!body.success) {
    throw new Error(
      `Upload rejected: ${body.error?.message ?? 'Unknown error from server'}`
    );
  }

  return body;
}
