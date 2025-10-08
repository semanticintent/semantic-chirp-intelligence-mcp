// OAuth Helper Script for Yahoo Fantasy
// Run this ONCE to get your access token
// Usage: node authenticate.js

import YahooFantasy from 'yahoo-fantasy';
import * as fs from 'fs';
import * as dotenv from 'dotenv';
import * as https from 'https';
import * as url from 'url';
import selfsigned from 'selfsigned';
import http from 'http';

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

// Token callback function (called when token is refreshed)
function tokenCallback(err, token) {
  if (err) {
    console.error('Token refresh error:', err);
    return;
  }
  const tokenWithTimestamp = {
    ...token,
    timestamp: Date.now(),
  };
  fs.writeFileSync(TOKEN_FILE, JSON.stringify(tokenWithTimestamp, null, 2));
  console.log('✅ Token refreshed and saved');
}

const yf = new YahooFantasy(CLIENT_ID, CLIENT_SECRET, tokenCallback, REDIRECT_URI);

// Generate self-signed certificate for local HTTPS
console.log('🔐 Generating self-signed certificate for HTTPS...');
const attrs = [{ name: 'commonName', value: 'localhost' }];
const pems = selfsigned.generate(attrs, {
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
    // Manual redirect to Yahoo OAuth - the library's auth() expects Express res object
    // So we'll build the auth URL ourselves
    const authUrl = `https://api.login.yahoo.com/oauth2/request_auth?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&language=en-us`;

    res.writeHead(302, { 'Location': authUrl });
    res.end();
    console.log('🔐 Redirecting to Yahoo for authorization...');
    return;
  }

  if (parsedUrl.pathname === '/callback') {
    const authCode = parsedUrl.query.code;

    if (!authCode) {
      res.writeHead(400, { 'Content-Type': 'text/html' });
      res.end('<h1>❌ Error: No authorization code received</h1>');
      setTimeout(() => {
        server.close();
        process.exit(1);
      }, 1000);
      return;
    }

    try {
      console.log('📝 Exchanging authorization code for access token...');

      // Manually exchange the code for a token using fetch
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
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`
        <html>
          <head>
            <title>Authentication Successful</title>
            <style>
              body {
                font-family: Arial, sans-serif;
                padding: 50px;
                text-align: center;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
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
              h1 { color: #4CAF50; }
              .emoji { font-size: 48px; margin: 20px 0; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="emoji">✅</div>
              <h1>Authentication Successful!</h1>
              <p>You can close this window and return to your terminal.</p>
              <p>Your token has been saved and the MCP server is ready to use.</p>
              <hr>
              <p><strong>Next steps:</strong></p>
              <ol style="text-align: left; display: inline-block;">
                <li>The server is already built</li>
                <li>Test with: <code>npm start</code></li>
                <li>Add to Claude Desktop config</li>
              </ol>
            </div>
          </body>
        </html>
      `);

      // Close server after success
      setTimeout(() => {
        server.close();
        console.log('\n🏒 All set! Next steps:');
        console.log('   1. Test the server: npm start');
        console.log('   2. Add to Claude Desktop config (see README.md)');
        process.exit(0);
      }, 1000);
    } catch (error) {
      console.error('❌ Error during callback:', error);
      res.writeHead(500, { 'Content-Type': 'text/html' });
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
