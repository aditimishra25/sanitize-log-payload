import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { describe, it } from 'node:test';

import {
    isBase64LogFieldKey,
    sanitizeForLog,
    sanitizeResponseForLog,
    truncateBase64ForLog,
} from '../dist/index.js';

describe('isBase64LogFieldKey', () => {
    it('matches keys containing base64 case-insensitively', () => {
        assert.equal(isBase64LogFieldKey('imageBase64'), true);
        assert.equal(isBase64LogFieldKey('BASE64_DATA'), true);
        assert.equal(isBase64LogFieldKey('thumbnail_base64'), true);
    });

    it('does not match unrelated keys', () => {
        assert.equal(isBase64LogFieldKey('data'), false);
        assert.equal(isBase64LogFieldKey('fileName'), false);
    });
});

describe('truncateBase64ForLog', () => {
    it('preserves short base64 strings', () => {
        const short = 'SGVsbG8gV29ybGQ=';
        assert.equal(truncateBase64ForLog(short), short);
    });

    it('truncates long base64 with two 80-character preview lines', () => {
        const payload = 'A'.repeat(400);
        const result = truncateBase64ForLog(payload);
        const lines = result.split('\n');
        assert.equal(lines.length, 2);
        assert.equal(lines[0].length, 80);
        assert.equal(lines[1].length, 83);
        assert.ok(lines[1].endsWith('...'));
    });

    it('preserves original string when whitespace-normalized length is at threshold', () => {
        const withSpaces = `  ${'C'.repeat(200)}  `;
        assert.equal(truncateBase64ForLog(withSpaces), withSpaces);
    });

    it('preserves data URL wrapper and truncates only the payload', () => {
        const payload = 'D'.repeat(300);
        const dataUrl = `data:image/png;base64,${payload}`;
        const result = truncateBase64ForLog(dataUrl);
        assert.ok(result.startsWith('data:image/png;base64,'));
        assert.ok(result.length < dataUrl.length);
        assert.ok(result.includes('...'));
    });

    it('leaves short data URLs unchanged', () => {
        const dataUrl = 'data:image/png;base64,SGVsbG8=';
        assert.equal(truncateBase64ForLog(dataUrl), dataUrl);
    });

    it('truncates by normalized length when invoked directly on long strings', () => {
        const prose = 'Hello world! '.repeat(30);
        const result = truncateBase64ForLog(prose);
        assert.ok(result.length < prose.length);
        assert.ok(result.endsWith('...'));
    });
});

describe('sanitizeForLog', () => {
    it('truncates inline-preview data field in request bodies', () => {
        const payload = 'A'.repeat(400);
        const sanitized = sanitizeForLog({ data: payload, fileName: 'doc.pdf' });

        assert.equal(typeof (sanitized as { data: string }).data, 'string');
        assert.ok((sanitized as { data: string }).data.length < payload.length);
        assert.equal((sanitized as { fileName: string }).fileName, 'doc.pdf');
    });

    it('truncates long base64 strings in nested data fields', () => {
        const payload = `  ${'B'.repeat(300)}  `;
        const sanitized = sanitizeForLog({
            samples: [{ id: '1', ok: true, data: payload }],
        });

        const entry = (sanitized as { samples: Array<{ data: string }> }).samples[0];
        assert.ok(entry.data.length < payload.length);
        assert.ok(entry.data.includes('...'));
    });

    it('does not truncate large base64-like strings under arbitrary keys', () => {
        const payload = 'E'.repeat(400);
        const sanitized = sanitizeForLog({ content: payload });
        assert.equal((sanitized as { content: string }).content, payload);
    });

    it('truncates strings under base64 field names regardless of content shape', () => {
        const payload = 'short';
        const sanitized = sanitizeForLog({ fileBase64: payload });
        assert.equal((sanitized as { fileBase64: string }).fileBase64, payload);
    });

    it('truncates long values under base64 field keys', () => {
        const payload = 'F'.repeat(250);
        const sanitized = sanitizeForLog({ imageBase64: payload });
        assert.ok((sanitized as { imageBase64: string }).imageBase64.length < payload.length);
    });

    it('handles nested objects and arrays', () => {
        const sanitized = sanitizeForLog({
            level1: { level2: [{ data: 'G'.repeat(250) }] },
        });
        const inner = (sanitized as { level1: { level2: Array<{ data: string }> } }).level1.level2[0];
        assert.ok(inner.data.includes('...'));
    });

    it('replaces binary types with size metadata', () => {
        const buf = Buffer.from([1, 2, 3]);
        const u8 = new Uint8Array([4, 5]);
        const ab = new ArrayBuffer(8);
        const sanitized = sanitizeForLog({ buf, u8, ab }) as Record<string, unknown>;
        assert.deepEqual(sanitized.buf, { type: 'Buffer', byteLength: 3 });
        assert.deepEqual(sanitized.u8, { type: 'Uint8Array', byteLength: 2 });
        assert.deepEqual(sanitized.ab, { type: 'ArrayBuffer', byteLength: 8 });
    });

    it('stops recursing past max depth', () => {
        let nested: Record<string, unknown> = { value: 'leaf' };
        for (let i = 0; i < 8; i += 1) {
            nested = { child: nested };
        }
        const sanitized = sanitizeForLog(nested) as Record<string, unknown>;
        let cursor: unknown = sanitized;
        for (let i = 0; i < 6; i += 1) {
            cursor = (cursor as { child: unknown }).child;
        }
        assert.equal((cursor as { child: unknown }).child, '[max depth]');
    });

    it('preserves null, undefined, numbers, and booleans', () => {
        assert.deepEqual(sanitizeForLog(null), null);
        assert.deepEqual(sanitizeForLog(undefined), undefined);
        assert.deepEqual(sanitizeForLog({ count: 42, ok: true }), { count: 42, ok: true });
    });
});

describe('sanitizeResponseForLog', () => {
    it('applies request rules and additionally truncates arbitrary large base64', () => {
        const payload = 'H'.repeat(400);
        const requestSanitized = sanitizeForLog({ body: payload }) as { body: string };
        const responseSanitized = sanitizeResponseForLog({ body: payload }) as { body: string };
        assert.equal(requestSanitized.body, payload);
        assert.ok(responseSanitized.body.length < payload.length);
    });

    it('truncates top-level large base64 strings', () => {
        const payload = 'I'.repeat(400);
        const result = sanitizeResponseForLog(payload) as string;
        assert.ok(result.length < payload.length);
        assert.ok(result.includes('...'));
    });

    it('still truncates data fields like sanitizeForLog', () => {
        const payload = 'J'.repeat(400);
        const sanitized = sanitizeResponseForLog({ data: payload }) as { data: string };
        assert.ok(sanitized.data.length < payload.length);
    });
});
