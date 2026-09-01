import { describe, it, expect } from 'vitest';
import fs from 'fs';
import https from 'https';
import selfsigned from 'selfsigned';

/**
 * Guards the local OAuth callback server's certificate.
 *
 * selfsigned 3.x -> 5.x turned generate() into an async function. authenticate.js
 * kept calling it synchronously, so `pems.private` and `pems.cert` were both
 * undefined. Node starts an HTTPS server with no certificate without
 * complaining, then fails every handshake with
 * ERR_SSL_VERSION_OR_CIPHER_MISMATCH — and the browser offers no "Advanced"
 * escape hatch, so authentication was impossible.
 *
 * A dependency bump broke the entire setup path and nothing caught it.
 */
describe('OAuth callback certificate', () => {
  it('exposes generate() as async — a sync call yields undefined key and cert', () => {
    expect(selfsigned.generate.constructor.name).toBe('AsyncFunction');

    // This is precisely the bug: the sync call returns a Promise, not PEMs.
    const notAwaited: any = selfsigned.generate([{ name: 'commonName', value: 'localhost' }], {});
    expect(notAwaited.private).toBeUndefined();
    expect(notAwaited.cert).toBeUndefined();
  });

  it('produces a usable key and certificate when awaited', async () => {
    const pems = await selfsigned.generate([{ name: 'commonName', value: 'localhost' }], {
      keySize: 2048,
      days: 365,
      algorithm: 'sha256',
      extensions: [{
        name: 'subjectAltName',
        altNames: [{ type: 2, value: 'localhost' }, { type: 7, ip: '127.0.0.1' }]
      }]
    });

    expect(pems.private).toMatch(/BEGIN (RSA )?PRIVATE KEY/);
    expect(pems.cert).toMatch(/BEGIN CERTIFICATE/);
  });

  it('completes a real TLS handshake with the generated certificate', async () => {
    const pems = await selfsigned.generate([{ name: 'commonName', value: 'localhost' }], {
      keySize: 2048,
      days: 365,
      algorithm: 'sha256',
      extensions: [{
        name: 'subjectAltName',
        altNames: [{ type: 2, value: 'localhost' }, { type: 7, ip: '127.0.0.1' }]
      }]
    });

    const server = https.createServer(
      { key: pems.private, cert: pems.cert },
      (_req, res) => { res.writeHead(200); res.end('ok'); }
    );

    const port: number = await new Promise(resolve => {
      server.listen(0, () => resolve((server.address() as any).port));
    });

    // Self-signed, so certificate validation is deliberately skipped here —
    // the point is that a cipher is offered at all.
    const previous = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

    try {
      const response = await fetch(`https://localhost:${port}/`);
      expect(response.status).toBe(200);
    } finally {
      if (previous === undefined) delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
      else process.env.NODE_TLS_REJECT_UNAUTHORIZED = previous;
      server.close();
    }
  });

  it('authenticate.js awaits the certificate', () => {
    const source = fs.readFileSync('authenticate.js', 'utf8');
    expect(source).toMatch(/await\s+selfsigned\.generate/);
  });
});
