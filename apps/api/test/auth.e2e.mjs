import 'dotenv/config';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { test } from 'node:test';
import pg from 'pg';

const baseUrl = 'http://localhost:4000/api/v1';
const runId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const customerEmail = `auth-customer-${runId}@example.com`;
const adminEmail = `auth-admin-${runId}@example.com`;
const password = 'correct horse battery staple';
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
let api;

function cookieFrom(response) {
  const value = response.headers.get('set-cookie');
  assert.ok(value?.startsWith('commerce_refresh='));
  return value.split(';', 1)[0];
}

async function request(path, options = {}) {
  const headers = { ...(options.headers ?? {}) };
  if (options.body !== undefined) headers['content-type'] = 'application/json';
  if (options.token) headers.authorization = `Bearer ${options.token}`;
  if (options.cookie) headers.cookie = options.cookie;
  return fetch(`${baseUrl}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
}

async function waitForApi() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await request('/health');
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('API did not start');
}

async function cleanup() {
  await pool.query('DELETE FROM "User" WHERE "email" = ANY($1)', [
    [customerEmail, adminEmail],
  ]);
}

test('secure customer and admin authentication', async (suite) => {
  await cleanup();
  api = spawn(process.execPath, ['dist/main.js'], { stdio: 'ignore' });
  await waitForApi();

  try {
    let customerAccessToken;
    let customerCookie;

    await suite.test('registration is safe and fixed to CUSTOMER/RETAIL', async () => {
      const response = await request('/auth/register', {
        method: 'POST',
        body: {
          email: `  ${customerEmail.toUpperCase()}  `,
          password,
          firstName: 'Test',
          lastName: 'Customer',
        },
      });
      assert.equal(response.status, 201);
      const body = await response.json();
      assert.equal(body.user.email, customerEmail);
      assert.equal(body.user.role, 'CUSTOMER');
      assert.equal(body.user.accountType, 'RETAIL');
      assert.equal('passwordHash' in body.user, false);
      assert.equal('refreshToken' in body, false);
      customerAccessToken = body.accessToken;
      customerCookie = cookieFrom(response);

      const stored = await pool.query(
        'SELECT "passwordHash" FROM "User" WHERE "email" = $1',
        [customerEmail],
      );
      assert.match(stored.rows[0].passwordHash, /^\$argon2id\$/);

      const session = await pool.query(
        'SELECT "refreshTokenHash" FROM "AuthSession" WHERE "userId" = (SELECT "id" FROM "User" WHERE "email" = $1)',
        [customerEmail],
      );
      assert.match(session.rows[0].refreshTokenHash, /^[a-f0-9]{64}$/);
      assert.notEqual(
        session.rows[0].refreshTokenHash,
        customerCookie.split('=', 2)[1],
      );
    });

    await suite.test('unknown and privileged registration fields are rejected', async () => {
      const unknown = await request('/auth/register', {
        method: 'POST',
        body: {
          email: `unknown-${runId}@example.com`,
          password,
          firstName: 'Unknown',
          lastName: 'Field',
          unexpected: true,
        },
      });
      assert.equal(unknown.status, 400);

      const adminAttempt = await request('/auth/register', {
        method: 'POST',
        body: {
          email: `attempt-${runId}@example.com`,
          password,
          firstName: 'Admin',
          lastName: 'Attempt',
          role: 'ADMIN',
        },
      });
      assert.equal(adminAttempt.status, 400);
    });

    await suite.test('login succeeds and credential failures are generic', async () => {
      const success = await request('/auth/login', {
        method: 'POST',
        body: { email: customerEmail.toUpperCase(), password },
      });
      assert.equal(success.status, 200);
      assert.ok((await success.json()).accessToken);

      for (const credentials of [
        { email: customerEmail, password: 'incorrect-password' },
        { email: `missing-${runId}@example.com`, password: 'incorrect-password' },
      ]) {
        const failure = await request('/auth/login', {
          method: 'POST',
          body: credentials,
        });
        assert.equal(failure.status, 401);
        assert.equal((await failure.json()).message, 'Invalid email or password');
      }
    });

    await suite.test('/auth/me requires and accepts a session-backed token', async () => {
      assert.equal((await request('/auth/me')).status, 401);
      const response = await request('/auth/me', { token: customerAccessToken });
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.email, customerEmail);
      assert.equal(body.role, 'CUSTOMER');
      assert.equal('passwordHash' in body, false);
    });

    await suite.test('roles guard denies CUSTOMER and allows database ADMIN', async () => {
      assert.equal(
        (await request('/admin/health', { token: customerAccessToken })).status,
        403,
      );
      const registration = await request('/auth/register', {
        method: 'POST',
        body: {
          email: adminEmail,
          password,
          firstName: 'Test',
          lastName: 'Admin',
        },
      });
      assert.equal(registration.status, 201);
      const adminToken = (await registration.json()).accessToken;
      await pool.query('UPDATE "User" SET "role" = $1 WHERE "email" = $2', [
        'ADMIN',
        adminEmail,
      ]);
      const adminHealth = await request('/admin/health', { token: adminToken });
      assert.equal(adminHealth.status, 200);
      assert.deepEqual(await adminHealth.json(), { status: 'ok', role: 'ADMIN' });
    });

    await suite.test('refresh rotates and old token cannot be reused', async () => {
      const rotated = await request('/auth/refresh', {
        method: 'POST',
        cookie: customerCookie,
      });
      assert.equal(rotated.status, 200);
      const rotatedCookie = cookieFrom(rotated);
      assert.notEqual(rotatedCookie, customerCookie);
      assert.equal(
        (
          await request('/auth/refresh', {
            method: 'POST',
            cookie: customerCookie,
          })
        ).status,
        401,
      );
      customerCookie = rotatedCookie;
      customerAccessToken = (await rotated.json()).accessToken;
    });

    await suite.test('logout revokes the refresh and access-token session', async () => {
      const logout = await request('/auth/logout', {
        method: 'POST',
        cookie: customerCookie,
      });
      assert.equal(logout.status, 200);
      assert.deepEqual(await logout.json(), { status: 'ok' });
      assert.equal(
        (
          await request('/auth/refresh', {
            method: 'POST',
            cookie: customerCookie,
          })
        ).status,
        401,
      );
      assert.equal(
        (await request('/auth/me', { token: customerAccessToken })).status,
        401,
      );
    });

    await suite.test('logout-all revokes every current user session', async () => {
      const login = await request('/auth/login', {
        method: 'POST',
        body: { email: customerEmail, password },
      });
      assert.equal(login.status, 200);
      const loginBody = await login.json();
      const loginCookie = cookieFrom(login);
      const logoutAll = await request('/auth/logout-all', {
        method: 'POST',
        token: loginBody.accessToken,
        cookie: loginCookie,
      });
      assert.equal(logoutAll.status, 200);
      assert.deepEqual(await logoutAll.json(), { status: 'ok' });
      assert.equal(
        (await request('/auth/me', { token: loginBody.accessToken })).status,
        401,
      );
      assert.equal(
        (
          await request('/auth/refresh', {
            method: 'POST',
            cookie: loginCookie,
          })
        ).status,
        401,
      );
    });

    await suite.test('login rate limit returns 429', async () => {
      let limited = false;
      for (let attempt = 0; attempt < 6; attempt += 1) {
        const response = await request('/auth/login', {
          method: 'POST',
          body: { email: customerEmail, password: 'incorrect-password' },
        });
        if (response.status === 429) {
          limited = true;
          break;
        }
      }
      assert.equal(limited, true);
    });
  } finally {
    api.kill();
    await cleanup();
    await pool.end();
  }
});
