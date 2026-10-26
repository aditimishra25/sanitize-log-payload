const BASE64_LOG_FIELD_PATTERN = /base64/i;
const BASE64_LOG_MAX_LINES = 2;
const BASE64_LOG_LINE_CHARS = 80;
/** Values at or below this length are left unchanged in logs. */
const BASE64_LOG_KEEP_FULL_MAX = 200;
const MAX_LOG_SANITIZE_DEPTH = 6;

export function isBase64LogFieldKey(key: string): boolean {
    return BASE64_LOG_FIELD_PATTERN.test(key);
}

function looksLikeLargeBase64Payload(value: string): boolean {
    const trimmed = value.trim();
    if (trimmed.length <= BASE64_LOG_KEEP_FULL_MAX) {
        return false;
    }

    const dataUrlMatch = /^data:[^;,]+;base64,(.*)$/i.exec(trimmed);
    const payload = (dataUrlMatch?.[1] ?? trimmed).replace(/\s+/g, '');
    if (payload.length <= BASE64_LOG_KEEP_FULL_MAX) {
        return false;
    }

    const sample = payload.slice(0, 512);
    return /^[A-Za-z0-9+/=]+$/.test(sample);
}

function shouldTruncateStringForLog(
    value: string,
    key: string | undefined,
    responseOnly: boolean,
): boolean {
    if (key && isBase64LogFieldKey(key)) {
        return true;
    }

    if (key?.toLowerCase() === 'data' && looksLikeLargeBase64Payload(value)) {
        return true;
    }

    return responseOnly && looksLikeLargeBase64Payload(value);
}

export function truncateBase64ForLog(value: string): string {
    const dataUrlMatch = /^data:([^;,]+);base64,(.*)$/i.exec(value.trim());
    if (dataUrlMatch) {
        const [, mimeType, payload] = dataUrlMatch;
        const truncatedPayload = truncateBase64ForLog(payload);
        return `data:${mimeType};base64,${truncatedPayload}`;
    }

    const normalized = value.replace(/\s+/g, '');
    if (normalized.length <= BASE64_LOG_KEEP_FULL_MAX) {
        return value;
    }

    const lines: string[] = [];
    let offset = 0;
    for (let line = 0; line < BASE64_LOG_MAX_LINES && offset < normalized.length; line += 1) {
        lines.push(normalized.slice(offset, offset + BASE64_LOG_LINE_CHARS));
        offset += BASE64_LOG_LINE_CHARS;
    }

    if (offset < normalized.length) {
        return `${lines.join('\n')}...`;
    }

    return lines.join('\n');
}

function sanitizeValueForLogInternal(
    value: unknown,
    depth = 0,
    key?: string,
    responseOnly = false,
): unknown {
    if (depth > MAX_LOG_SANITIZE_DEPTH) {
        return '[max depth]';
    }

    if (value === null || value === undefined) {
        return value;
    }

    if (typeof value === 'string') {
        if (shouldTruncateStringForLog(value, key, responseOnly)) {
            return truncateBase64ForLog(value);
        }
        return value;
    }

    if (Array.isArray(value)) {
        if (key && isBase64LogFieldKey(key)) {
            return value.map((item) =>
                typeof item === 'string'
                    ? truncateBase64ForLog(item)
                    : sanitizeValueForLogInternal(item, depth + 1, undefined, responseOnly),
            );
        }

        return value.map((item) =>
            sanitizeValueForLogInternal(item, depth + 1, undefined, responseOnly),
        );
    }

    if (Buffer.isBuffer(value)) {
        return { type: 'Buffer', byteLength: value.length };
    }

    if (value instanceof Uint8Array) {
        return { type: 'Uint8Array', byteLength: value.byteLength };
    }

    if (value instanceof ArrayBuffer) {
        return { type: 'ArrayBuffer', byteLength: value.byteLength };
    }

    if (typeof value === 'object') {
        return Object.fromEntries(
            Object.entries(value as Record<string, unknown>).map(([entryKey, nested]) => [
                entryKey,
                sanitizeValueForLogInternal(nested, depth + 1, entryKey, responseOnly),
            ]),
        );
    }

    return value;
}

export function sanitizeForLog(value: unknown): unknown {
    return sanitizeValueForLogInternal(value, 0, undefined, false);
}

export function sanitizeResponseForLog(value: unknown): unknown {
    return sanitizeValueForLogInternal(value, 0, undefined, true);
}
