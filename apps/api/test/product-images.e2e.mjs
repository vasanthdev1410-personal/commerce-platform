import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { test } from 'node:test';
import pg from 'pg';

const baseUrl = 'http://localhost:4000/api/v1';
const runId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const marker = `images-${runId}`;
const adminEmail = `${marker}-admin@example.com`;
const customerEmail = `${marker}-customer@example.com`;
const password = 'correct horse battery staple';
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
let api;
let adminToken;
let customerToken;
let categoryId;
let productId;
let firstImageId;
let secondImageId;

async function request(path, options = {}) {
  const headers = { ...(options.headers ?? {}) };
  if (options.body !== undefined) headers['content-type'] = 'application/json';
  if (options.token) headers.authorization = `Bearer ${options.token}`;
  return fetch(`${baseUrl}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
}

async function json(response) {
  return response.json();
}

async function waitForApi() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      if ((await request('/health')).ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('API did not start');
}

async function stopApi() {
  if (!api || api.exitCode !== null) return;
  const exited = new Promise((resolve) => api.once('exit', resolve));
  api.kill();
  const stopped = await Promise.race([
    exited.then(() => true),
    new Promise((resolve) => setTimeout(() => resolve(false), 2000)),
  ]);
  if (!stopped && api.exitCode === null) {
    api.kill('SIGKILL');
    await exited;
  }
}

async function cleanup() {
  const users = await pool.query(
    'SELECT "id" FROM "User" WHERE "email" = ANY($1)',
    [[adminEmail, customerEmail]],
  );
  const ids = users.rows.map((row) => row.id);
  if (ids.length) {
    await pool.query('DELETE FROM "AdminAuditLog" WHERE "adminUserId" = ANY($1)', [
      ids,
    ]);
  }
  await pool.query(
    'DELETE FROM "Inventory" WHERE "variantId" IN (SELECT pv."id" FROM "ProductVariant" pv JOIN "Product" p ON p."id" = pv."productId" WHERE p."slug" LIKE $1)',
    [`${marker}%`],
  );
  await pool.query(
    'DELETE FROM "ProductVariant" WHERE "productId" IN (SELECT "id" FROM "Product" WHERE "slug" LIKE $1)',
    [`${marker}%`],
  );
  await pool.query(
    'DELETE FROM "ProductCategory" WHERE "productId" IN (SELECT "id" FROM "Product" WHERE "slug" LIKE $1)',
    [`${marker}%`],
  );
  await pool.query('DELETE FROM "Product" WHERE "slug" LIKE $1', [`${marker}%`]);
  await pool.query('DELETE FROM "Category" WHERE "slug" LIKE $1', [`${marker}%`]);
  await pool.query('DELETE FROM "User" WHERE "email" = ANY($1)', [
    [adminEmail, customerEmail],
  ]);
}

async function presign(contentType = 'image/webp', fileSize = 1024) {
  const response = await request(`/admin/products/${productId}/images/presign`, {
    method: 'POST',
    token: adminToken,
    body: { contentType, fileSize },
  });
  return { response, body: response.ok ? await json(response) : null };
}

async function confirm(fileId, position, isPrimary = false) {
  return request(`/admin/products/${productId}/images`, {
    method: 'POST',
    token: adminToken,
    body: { fileId, altText: ` ${marker} image ${position} `, position, isPrimary },
  });
}

test('secure product image storage workflow', async (suite) => {
  await cleanup();
  api = spawn(process.execPath, ['dist/main.js'], {
    stdio: 'ignore',
    env: { ...process.env, NODE_ENV: 'test', IMAGEKIT_MOCK_MODE: 'true' },
  });
  await waitForApi();

  try {
    await suite.test('create CUSTOMER, ADMIN, category, and product fixtures', async () => {
      for (const [email, role] of [
        [customerEmail, 'CUSTOMER'],
        [adminEmail, 'ADMIN'],
      ]) {
        const response = await request('/auth/register', {
          method: 'POST',
          body: { email, password, firstName: 'Image', lastName: role },
        });
        assert.equal(response.status, 201);
        const token = (await json(response)).accessToken;
        if (role === 'ADMIN') adminToken = token;
        else customerToken = token;
      }
      await pool.query('UPDATE "User" SET "role" = $1 WHERE "email" = $2', [
        'ADMIN',
        adminEmail,
      ]);
      const categoryResponse = await request('/admin/categories', {
        method: 'POST',
        token: adminToken,
        body: { name: `${marker} category` },
      });
      assert.equal(categoryResponse.status, 201);
      categoryId = (await json(categoryResponse)).id;
      const productResponse = await request('/admin/products', {
        method: 'POST',
        token: adminToken,
        body: {
          name: `${marker} product`,
          categoryIds: [categoryId],
          variants: [
            {
              sku: `${marker}-SKU`,
              name: 'Default',
              attributes: { color: 'Black' },
              retailPricePaise: 1000,
              wholesaleMinQty: 1,
              stockQuantity: 5,
              reorderLevel: 1,
            },
          ],
        },
      });
      assert.equal(productResponse.status, 201);
      productId = (await json(productResponse)).id;
    });

    await suite.test('presign requires ADMIN authorization', async () => {
      const path = `/admin/products/${productId}/images/presign`;
      assert.equal(
        (
          await request(path, {
            method: 'POST',
            body: { contentType: 'image/webp', fileSize: 1024 },
          })
        ).status,
        401,
      );
      assert.equal(
        (
          await request(path, {
            method: 'POST',
            token: customerToken,
            body: { contentType: 'image/webp', fileSize: 1024 },
          })
        ).status,
        403,
      );
    });

    await suite.test('upload auth validates product, MIME, size, and destination', async () => {
      assert.equal((await presign('image/svg+xml', 1024)).response.status, 400);
      assert.equal((await presign('image/webp', 8 * 1024 * 1024 + 1)).response.status, 400);
      const invalidProduct = await request(
        `/admin/products/${randomUUID()}/images/presign`,
        {
          method: 'POST',
          token: adminToken,
          body: { contentType: 'image/webp', fileSize: 1024 },
        },
      );
      assert.equal(invalidProduct.status, 404);

      const signed = await presign();
      assert.equal(signed.response.status, 201);
      assert.equal(signed.body.expiresIn, 300);
      assert.equal(signed.body.folder, `/products/${productId}`);
      assert.match(signed.body.fileName, /^[0-9a-f-]+\.webp$/);
      assert.equal(signed.body.uploadUrl, 'https://upload.imagekit.io/api/v1/files/upload');
      assert.equal('IMAGEKIT_PRIVATE_KEY' in signed.body, false);
    });

    await suite.test('confirmation rejects foreign and nonexistent keys', async () => {
      const foreign = await confirm(randomUUID(), 0);
      assert.equal(foreign.status, 400);
      const missing = await confirm(randomUUID(), 0);
      assert.equal(missing.status, 400);
    });

    await suite.test('confirmation stores verified metadata and first image is primary', async () => {
      const signed = await presign('image/webp', 2048);
      const confirmed = await confirm(signed.body.mockFileId, 0, false);
      assert.equal(confirmed.status, 201);
      const image = await json(confirmed);
      firstImageId = image.id;
      assert.equal(image.isPrimary, true);
      assert.equal(image.contentType, 'image/webp');
      assert.equal(image.fileSize, 2048);
      assert.equal(image.altText, `${marker} image 0`);

      const duplicate = await confirm(signed.body.mockFileId, 0, true);
      assert.equal(duplicate.status, 409);
    });

    await suite.test('primary selection is transactional and metadata updates are controlled', async () => {
      const signed = await presign('image/png', 4096);
      const confirmed = await confirm(signed.body.mockFileId, 1, false);
      assert.equal(confirmed.status, 201);
      secondImageId = (await json(confirmed)).id;

      const updated = await request(
        `/admin/products/${productId}/images/${secondImageId}`,
        {
          method: 'PATCH',
          token: adminToken,
          body: { altText: ' New primary ', position: 2, isPrimary: true },
        },
      );
      assert.equal(updated.status, 200);
      assert.equal((await json(updated)).altText, 'New primary');

      const images = await json(
        await request(`/admin/products/${productId}/images`, {
          token: adminToken,
        }),
      );
      assert.equal(images.filter((image) => image.isPrimary).length, 1);
      assert.equal(images.find((image) => image.id === secondImageId).isPrimary, true);
      assert.equal(
        (
          await request(`/admin/products/${productId}/images/${secondImageId}`, {
            method: 'PATCH',
            token: adminToken,
            body: { fileId: 'not-allowed' },
          })
        ).status,
        400,
      );
    });

    await suite.test('public product responses expose only safe ordered image data', async () => {
      const listing = await json(await request(`/products?search=${marker}`));
      const listedProduct = listing.data.find((product) => product.id === productId);
      assert.equal(listedProduct.primaryImage.id, secondImageId);
      assert.equal('objectKey' in listedProduct.primaryImage, false);

      const product = await json(await request(`/products/${marker}-product`));
      assert.deepEqual(
        product.images.map((image) => image.id),
        [firstImageId, secondImageId],
      );
      assert.equal(product.images.every((image) => !('objectKey' in image)), true);
    });

    await suite.test('delete requires ADMIN and promotes the next image', async () => {
      const path = `/admin/products/${productId}/images/${secondImageId}`;
      assert.equal(
        (
          await request(path, {
            method: 'DELETE',
            token: customerToken,
          })
        ).status,
        403,
      );
      const removed = await request(path, {
        method: 'DELETE',
        token: adminToken,
      });
      assert.equal(removed.status, 200);
      const remaining = await json(
        await request(`/admin/products/${productId}/images`, {
          token: adminToken,
        }),
      );
      assert.equal(remaining.length, 1);
      assert.equal(remaining[0].id, firstImageId);
      assert.equal(remaining[0].isPrimary, true);
    });

    await suite.test('image actions are audited without storage secrets', async () => {
      const rows = await pool.query(
        'SELECT "action", "metadata" FROM "AdminAuditLog" WHERE "adminUserId" = (SELECT "id" FROM "User" WHERE "email" = $1)',
        [adminEmail],
      );
      const actions = new Set(rows.rows.map((row) => row.action));
      for (const action of [
        'PRODUCT_IMAGE_CREATE',
        'PRODUCT_IMAGE_UPDATE',
        'PRODUCT_IMAGE_DELETE',
        'PRODUCT_IMAGE_PRIMARY_CHANGE',
      ]) {
        assert.ok(actions.has(action), `Missing audit action ${action}`);
      }
      assert.equal(
        rows.rows.some((row) =>
          JSON.stringify(row.metadata).includes('mock-signature'),
        ),
        false,
      );
    });
  } finally {
    await stopApi();
    await cleanup();
    await pool.end();
  }
});
