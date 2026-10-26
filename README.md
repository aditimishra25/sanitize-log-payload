# sanitize-log-payload

Lightweight utilities for sanitizing structured log payloads by truncating large base64 and file-related strings. **Zero runtime dependencies.**

This package helps keep logs readable and bounded in size. It is **not** a comprehensive security redactor: it does not remove credentials, secrets, or personally identifiable information (PII).

## Installation

```bash
npm install sanitize-log-payload
```

Requires Node.js 18 or later.

## Usage

```javascript
import {
  sanitizeForLog,
  sanitizeResponseForLog,
  truncateBase64ForLog,
  isBase64LogFieldKey,
} from 'sanitize-log-payload';

const requestBody = {
  fileName: 'report.pdf',
  data: 'A'.repeat(500), // large inline payload
};

console.log(sanitizeForLog(requestBody));
// data field truncated; fileName unchanged

const apiResponse = {
  result: 'B'.repeat(500), // large base64-like string at an arbitrary key
};

console.log(sanitizeResponseForLog(apiResponse));
// large base64-like strings truncated anywhere in the tree
```

### `sanitizeForLog(value)`

Use for request bodies and general metadata. Strings are truncated when:

- The property name contains `base64` (case-insensitive), or
- The property name is exactly `data` and the value matches the large-base64 heuristic.

Large base64-like strings at **other** property names are left unchanged.

### `sanitizeResponseForLog(value)`

Same rules as `sanitizeForLog`, plus truncation of large base64-like strings **anywhere** in the value (including top-level strings and arbitrary nested keys).

### `truncateBase64ForLog(value)`

Truncates a single string:

- Normalized payload length above **200** characters may be shortened to a two-line preview (80 characters per line) followed by `...`.
- `data:<mime>;base64,<payload>` URLs keep their prefix; only the payload portion is processed.
- Shorter values and non-base64 long text are returned unchanged.

### `isBase64LogFieldKey(key)`

Returns `true` when `key` contains `base64`, case-insensitively.

## Behavior notes

- Objects are shallow-cloned during sanitization; the input is not mutated.
- `Buffer`, `Uint8Array`, and `ArrayBuffer` values are replaced with `{ type, byteLength }` placeholders (raw bytes are not logged).
- Nesting deeper than **6** levels is replaced with `"[max depth]"`.
- `null`, `undefined`, numbers, and booleans pass through unchanged.

## License

MIT
