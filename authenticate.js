// OAuth Helper Script for Yahoo Fantasy
// Run this ONCE to get your access token
// Usage: node authenticate.js

import * as fs from 'fs';
import * as dotenv from 'dotenv';
import * as https from 'https';
import * as url from 'url';
import selfsigned from 'selfsigned';
import { isPlaceholder } from './scripts/placeholders.mjs';

dotenv.config();

const CLIENT_ID = process.env.YAHOO_CLIENT_ID;
const CLIENT_SECRET = process.env.YAHOO_CLIENT_SECRET;
const REDIRECT_URI = 'https://localhost:3000/callback';
const TOKEN_FILE = '.yahoo-oauth.json';

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('❌ Missing YAHOO_CLIENT_ID or YAHOO_CLIENT_SECRET in .env');
  console.error('📝 Please create a .env file with your Yahoo API credentials');
  console.error('   Get them from: https://developer.yahoo.com/apps/create/');
  process.exit(1);
}

// A .env copied from the template but never filled in fails much later, at
// Yahoo, with an opaque error. Catch it here instead, using the same list
// preflight uses so the two cannot disagree.
const unfilled = Object.entries({ YAHOO_CLIENT_ID: CLIENT_ID, YAHOO_CLIENT_SECRET: CLIENT_SECRET })
  .filter(([, value]) => isPlaceholder(value));

if (unfilled.length > 0) {
  console.error(`❌ Still a placeholder in .env: ${unfilled.map(([key]) => key).join(', ')}`);
  console.error('📝 Replace the placeholder(s) with the real values from your Yahoo app:');
  console.error('   https://developer.yahoo.com/apps/');
  process.exit(1);
}

// Generate self-signed certificate for local HTTPS
//
// selfsigned 5.x made generate() async. Calling it synchronously returned a
// Promise, so pems.private and pems.cert were both undefined — Node starts an
// HTTPS server with no certificate without complaining, then fails every
// handshake with ERR_SSL_VERSION_OR_CIPHER_MISMATCH and no "Advanced" escape
// hatch in the browser. It must be awaited.
console.log('🔐 Generating self-signed certificate for HTTPS...');
const attrs = [{ name: 'commonName', value: 'localhost' }];
const pems = await selfsigned.generate(attrs, {
  keySize: 2048,
  days: 365,
  algorithm: 'sha256',
  extensions: [
    {
      name: 'subjectAltName',
      altNames: [
        { type: 2, value: 'localhost' },
        { type: 7, ip: '127.0.0.1' }
      ]
    }
  ]
});

if (!pems?.private || !pems?.cert) {
  console.error('❌ Certificate generation produced no key/cert.');
  console.error('   Without this the browser fails with ERR_SSL_VERSION_OR_CIPHER_MISMATCH.');
  console.error('   Check the installed `selfsigned` version and its generate() API.');
  process.exit(1);
}

console.log('🔐 Starting Yahoo OAuth flow...\n');

// HTTPS server options with self-signed certificate
const serverOptions = {
  key: pems.private,
  cert: pems.cert,
};

// Create an HTTPS server to handle the callback
const server = https.createServer(serverOptions, async (req, res) => {
  const parsedUrl = url.parse(req.url, true);

  if (parsedUrl.pathname === '/') {
    // Build Yahoo OAuth authorization URL
    // Request the Fantasy Sports scope explicitly.
    //
    // Yahoo will otherwise fall back to whatever the app happens to be
    // configured with, and a token issued without a Fantasy scope is accepted
    // at the token endpoint but 403s on every Fantasy endpoint afterwards -
    // including /game/nhl, which needs no user data at all. Asking for it by
    // name makes a misconfigured app fail at consent, where the cause is
    // visible.
    //
    // fspt-r  = Fantasy Sports read
    // fspt-w  = Fantasy Sports read/write
    //
    // This server only ever issues GET requests, so read is all it needs.
    // Yahoo apps registered as Read-only are widely reported to mint tokens
    // that 403 regardless, and switching the app to Read/Write is the known
    // workaround — set YAHOO_OAUTH_SCOPE=fspt-w to match such an app.
    const scope = process.env.YAHOO_OAUTH_SCOPE || 'fspt-r';
    console.log(`🔑 Requesting OAuth scope: ${scope}`);
    const authUrl = `https://api.login.yahoo.com/oauth2/request_auth?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=${scope}&language=en-us`;

    res.writeHead(302, { 'Location': authUrl });
    res.end();
    console.log('🔐 Redirecting to Yahoo for authorization...');
    return;
  }

  if (parsedUrl.pathname === '/callback') {
    const authCode = parsedUrl.query.code;

    if (!authCode) {
      // Yahoo redirects back with error / error_description when it refuses.
      // Reporting only "no authorization code" discards the one thing that
      // says why — invalid_scope, access_denied, invalid_client and so on.
      const { error, error_description } = parsedUrl.query;

      console.error('\n❌ Yahoo did not return an authorization code.');
      if (error) {
        console.error(`   error:       ${error}`);
        if (error_description) console.error(`   description: ${error_description}`);

        if (String(error) === 'invalid_scope') {
          console.error(`\n   You asked Yahoo for scope: ${process.env.YAHOO_OAUTH_SCOPE || 'fspt-r'}`);
          console.error('');
          console.error('   The most common cause is NOT a read/write mismatch — it is that the');
          console.error('   app has no Fantasy Sports permission at all. Yahoo\'s permission list');
          console.error('   opens on other APIs (TW Auction, Profiles), so it is easy to create an');
          console.error('   app with the right name and the wrong permission. Such an app rejects');
          console.error('   every fspt-* scope, and any token it does mint 403s on every Fantasy');
          console.error('   endpoint — including /game/nhl, which needs no user data.');
          console.error('');
          console.error('   At https://developer.yahoo.com/apps/ open the app for THIS Client ID');
          console.error('   and confirm, in API Permissions:');
          console.error('     • "Fantasy Sports" is listed and ticked (not TW Auction, not Profiles)');
          console.error('     • Read is enough; use fspt-w only if the app is registered Read/Write');
          console.error('   If you have several apps with similar names, check the App ID matches');
          console.error('   the one whose credentials are in .env.');
        }
        if (String(error) === 'access_denied') {
          console.error('\n   Consent was declined, or the app lacks the permission it asked for.');
        }
      } else {
        console.error('   Yahoo returned no error parameter either.');
        console.error(`   Full callback query: ${JSON.stringify(parsedUrl.query)}`);
      }
      console.error('');

      res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`
        <html><head><meta charset="utf-8"><title>Authentication failed</title></head>
        <body style="font-family: system-ui, sans-serif; padding: 40px; max-width: 640px; margin: 0 auto;">
          <h1>❌ Authentication failed</h1>
          <p>Yahoo did not return an authorization code.</p>
          ${error ? `<p><strong>error:</strong> <code>${error}</code></p>` : ''}
          ${error_description ? `<p><strong>description:</strong> ${error_description}</p>` : ''}
          <p>See your terminal for what to change.</p>
        </body></html>
      `);

      setTimeout(() => {
        server.close();
        process.exit(1);
      }, 1000);
      return;
    }

    try {
      console.log('📝 Exchanging authorization code for access token...');

      // Exchange the code for a token
      const tokenResponse = await fetch('https://api.login.yahoo.com/oauth2/get_token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': 'Basic ' + Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          redirect_uri: REDIRECT_URI,
          code: authCode
        })
      });

      if (!tokenResponse.ok) {
        throw new Error(`Token exchange failed: ${tokenResponse.status} ${tokenResponse.statusText}`);
      }

      const token = await tokenResponse.json();
      console.log('📝 Token retrieved successfully');

      // Report what the token actually carries. A token issued without the
      // Fantasy scope is accepted here and then 403s on every Fantasy
      // endpoint, so surface the tell now rather than three commands later.
      console.log(`   fields returned: ${Object.keys(token).sort().join(', ')}`);
      if (token.xoauth_yahoo_guid) {
        console.log('   ✅ xoauth_yahoo_guid present — token is Fantasy-scoped');
      } else {
        console.log('   ⚠️  xoauth_yahoo_guid MISSING — Yahoo issued a token with no Fantasy scope.');
        console.log('      Every Fantasy endpoint will return 403, including /game/nhl.');
        console.log('      Confirm "Fantasy Sports" is actually TICKED (not just listed)');
        console.log('      at https://developer.yahoo.com/apps/ for this Client ID.');
        console.log('      A newly created or edited app can take 15-60 minutes to propagate.');
      }

      // Save the token with timestamp
      const tokenWithTimestamp = {
        access_token: token.access_token,
        refresh_token: token.refresh_token,
        expires_in: token.expires_in,
        token_type: token.token_type,
        xoauth_yahoo_guid: token.xoauth_yahoo_guid,
        timestamp: Date.now(),
      };

      fs.writeFileSync(TOKEN_FILE, JSON.stringify(tokenWithTimestamp, null, 2));
      console.log(`✅ Token saved to ${TOKEN_FILE}`);

      // Success page
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`
        <html>
          <head>
            <title>🏒 Authentication Successful - ICE Activated</title>
            <style>
              body {
                font-family: Arial, sans-serif;
                padding: 50px;
                text-align: center;
                background: linear-gradient(135deg, #0891b2 0%, #06b6d4 100%);
                color: white;
              }
              .container {
                background: white;
                color: #333;
                padding: 40px;
                border-radius: 10px;
                max-width: 500px;
                margin: 0 auto;
                box-shadow: 0 10px 40px rgba(0,0,0,0.2);
              }
              h1 { color: #0891b2; }
              .emoji { font-size: 48px; margin: 20px 0; }
              code {
                background: #f5f5f5;
                padding: 2px 6px;
                border-radius: 3px;
                color: #0891b2;
              }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="emoji">🏒✅❄️</div>
              <h1>ICE Activated!</h1>
              <p>Yahoo authentication successful. Intent Chirp Engine is ready to dominate.</p>
              <p>You can close this window and return to your terminal.</p>
              <hr>
              <p><strong>Next steps:</strong></p>
              <ol style="text-align: left; display: inline-block;">
                <li>Server is built and ready</li>
                <li>Test with: <code>npm start</code></li>
                <li>Add to Claude Desktop config</li>
                <li>Start getting chirped with winning insights</li>
              </ol>
            </div>
          </body>
        </html>
      `);

      // Close server after success
      setTimeout(() => {
        server.close();
        console.log('\n🏒 ICE is ready! Next steps:');
        console.log('   1. Test the server: npm start');
        console.log('   2. Add to Claude Desktop config (see ACTIVATION_STEPS.md)');
        console.log('   3. Start dominating your fantasy league with semantic chirps');
        process.exit(0);
      }, 1000);
    } catch (error) {
      console.error('❌ Error during callback:', error);
      res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`
        <html>
          <head><title>Authentication Failed</title></head>
          <body style="font-family: Arial; padding: 50px; text-align: center;">
            <h1 style="color: #f44336;">❌ Authentication Failed</h1>
            <p>Check the terminal for error details.</p>
          </body>
        </html>
      `);
      setTimeout(() => {
        server.close();
        process.exit(1);
      }, 1000);
    }
  }
});

server.listen(3000, () => {
  console.log('🌐 HTTPS Server started on https://localhost:3000');
  console.log('\n👉 Open this URL in your browser to start authentication:');
  console.log('   https://localhost:3000/\n');
  console.log('⏳ Waiting for authentication...\n');

  // Helpful reminders
  console.log('💡 Make sure your Yahoo app has this redirect URI configured:');
  console.log('   https://localhost:3000/callback\n');
  console.log('⚠️  Your browser will show a security warning (self-signed cert)');
  console.log('   Click "Advanced" → "Proceed to localhost" to continue\n');
});
