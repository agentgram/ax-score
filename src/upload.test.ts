import { describe, it, expect, vi, beforeEach } from 'vitest';
import { uploadReport } from './upload.js';
import type { AXReport } from './types.js';

function makeReport(overrides: Partial<AXReport> = {}): AXReport {
  return {
    url: 'https://example.com',
    timestamp: '2026-02-20T00:00:00.000Z',
    version: '0.3.0',
    score: 75,
    categories: [],
    audits: {},
    recommendations: [],
    ...overrides,
  };
}

describe('uploadReport', () => {
  const defaultOptions = {
    apiUrl: 'https://agentgram.co/api/v1/ax-score/scan',
    apiKey: 'test-api-key-123',
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should upload successfully and return the response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ success: true, data: { id: 'scan-abc' } }),
    } as unknown as Response);

    const result = await uploadReport(makeReport(), defaultOptions);

    expect(result.success).toBe(true);
    expect(result.data.id).toBe('scan-abc');
  });

  it('should send the report as JSON with correct headers', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ success: true, data: { id: 'scan-abc' } }),
    } as unknown as Response);

    const report = makeReport();
    await uploadReport(report, defaultOptions);

    expect(fetchSpy).toHaveBeenCalledWith(
      defaultOptions.apiUrl,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(report),
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-api-key-123',
        }),
      })
    );
  });

  it('should throw on 401 unauthorized', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ success: false, error: { code: 'UNAUTHORIZED', message: 'Bad key' } }),
    } as unknown as Response);

    await expect(
      uploadReport(makeReport(), defaultOptions)
    ).rejects.toThrow('Invalid or expired API key');
  });

  it('should throw on 403 forbidden', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 403,
      json: () => Promise.resolve({ success: false, error: { code: 'FORBIDDEN', message: 'No access' } }),
    } as unknown as Response);

    await expect(
      uploadReport(makeReport(), defaultOptions)
    ).rejects.toThrow('Invalid or expired API key');
  });

  it('should throw on server error with message', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ success: false, error: { code: 'INTERNAL', message: 'Server broke' } }),
    } as unknown as Response);

    await expect(
      uploadReport(makeReport(), defaultOptions)
    ).rejects.toThrow('status 500: Server broke');
  });

  it('should throw on network error', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'));

    await expect(
      uploadReport(makeReport(), defaultOptions)
    ).rejects.toThrow('Upload failed: Network error');
  });

  it('should throw when server returns success: false', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({ success: false, error: { code: 'INVALID', message: 'Bad report' } }),
    } as unknown as Response);

    await expect(
      uploadReport(makeReport(), defaultOptions)
    ).rejects.toThrow('Upload rejected: Bad report');
  });
});
