import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { test } from 'node:test';
import pg from 'pg';

const baseUrl = 'http://localhost:4000/api/v1';
const runId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const marker = `catalog-${runId}`;
const adminEmail = `${marker}-admin@example.com`;
const customerEmail = `${marker}-customer@example.com`;
const password = 'correct horse battery staple';
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
let api;
let adminToken;
let customerToken;
let categoryId;
let productId;
let variantId;

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

async function cleanup() {
  const users = await pool.query(
    'SELECT "id" FROM "User" WHERE "email" = ANY($1)',
    [[adminEmail, customerEmail]],
  );
  const userIds = users.rows.map((row) => row.id);
  if (userIds.length) {
    await pool.query('DELETE FROM "AdminAuditLog" WHERE "adminUserId" = ANY($1)', [
      userIds,
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

function productPayload(overrides = {}) {
  return {
    name: 'Catalog Test Product',
    slug: `${marker}-product`,
    description: 'Catalog integration test product',
    isActive: true,
    categoryIds: [categoryId],
    variants: [
      {
        sku: `${marker}-SKU-1`,
        name: 'Default',
        attributes: { color: 'Black', size: 'M' },
        retailPricePaise: 29900,
        wholesalePricePaise: 19900,
        wholesaleMinQty: 10,
        stockQuantity: 20,
        reorderLevel: 5,
        isActive: true,
      },
    ],
    ...overrides,
  };
}

test('catalog and inventory backend', async (suite) => {
  await cleanup();
  api = spawn(process.execPath, ['dist/main.js'], { stdio: 'ignore' });
  await waitForApi();
  try {
    await suite.test('create authenticated CUSTOMER and ADMIN actors', async () => {
      for (const [email, role] of [
        [customerEmail, 'CUSTOMER'],
        [adminEmail, 'ADMIN'],
      ]) {
        const registration = await request('/auth/register', {
          method: 'POST',
          body: { email, password, firstName: 'Catalog', lastName: role },
        });
        assert.equal(registration.status, 201);
        const token = (await json(registration)).accessToken;
        if (role === 'ADMIN') adminToken = token;
        else customerToken = token;
      }
      await pool.query('UPDATE "User" SET "role" = $1 WHERE "email" = $2', [
        'ADMIN',
        adminEmail,
      ]);
    });

    await suite.test('admin endpoints enforce authentication and ADMIN role', async () => {
      assert.equal(
        (await request('/admin/products', { method: 'POST', body: {} })).status,
        401,
      );
      assert.equal(
        (
          await request('/admin/products', {
            method: 'POST',
            token: customerToken,
            body: {},
          })
        ).status,
        403,
      );
      assert.equal(
        (
          await request(`/admin/inventory/${randomUUID()}`, {
            method: 'PATCH',
            token: customerToken,
            body: { stockQuantity: 1 },
          })
        ).status,
        403,
      );
    });

    await suite.test('ADMIN category create, update, public read, and duplicate protection', async () => {
      const created = await request('/admin/categories', {
        method: 'POST',
        token: adminToken,
        body: { name: `${marker} Category`, description: 'Test category' },
      });
      assert.equal(created.status, 201);
      const category = await json(created);
      categoryId = category.id;
      assert.equal(category.slug, `${marker}-category`);

      const updated = await request(`/admin/categories/${categoryId}`, {
        method: 'PATCH',
        token: adminToken,
        body: { description: 'Updated category' },
      });
      assert.equal(updated.status, 200);
      assert.equal((await json(updated)).description, 'Updated category');

      const publicList = await request('/categories');
      assert.equal(publicList.status, 200);
      assert.ok((await json(publicList)).some((item) => item.id === categoryId));
      assert.equal((await request(`/categories/${marker}-category`)).status, 200);

      const duplicate = await request('/admin/categories', {
        method: 'POST',
        token: adminToken,
        body: { name: 'Duplicate', slug: `${marker}-category` },
      });
      assert.equal(duplicate.status, 409);
    });

    await suite.test('validation rejects negative prices, stock, and invalid categories', async () => {
      const invalidCases = [
        productPayload({
          slug: `${marker}-negative-retail`,
          variants: [{ ...productPayload().variants[0], sku: `${marker}-NEG-R`, retailPricePaise: -1 }],
        }),
        productPayload({
          slug: `${marker}-negative-wholesale`,
          variants: [{ ...productPayload().variants[0], sku: `${marker}-NEG-W`, wholesalePricePaise: -1 }],
        }),
        productPayload({
          slug: `${marker}-negative-stock`,
          variants: [{ ...productPayload().variants[0], sku: `${marker}-NEG-S`, stockQuantity: -1 }],
        }),
      ];
      for (const body of invalidCases) {
        const response = await request('/admin/products', {
          method: 'POST',
          token: adminToken,
          body,
        });
        assert.equal(response.status, 400);
      }
      const invalidCategory = await request('/admin/products', {
        method: 'POST',
        token: adminToken,
        body: productPayload({
          slug: `${marker}-invalid-category`,
          categoryIds: [randomUUID()],
          variants: [{ ...productPayload().variants[0], sku: `${marker}-BAD-CAT` }],
        }),
      });
      assert.equal(invalidCategory.status, 400);
    });

    await suite.test('ADMIN product creation is transactional', async () => {
      const created = await request('/admin/products', {
        method: 'POST',
        token: adminToken,
        body: productPayload(),
      });
      assert.equal(created.status, 201);
      const product = await json(created);
      productId = product.id;
      variantId = product.variants[0].id;
      assert.equal(product.variants[0].inventory.stockQuantity, 20);

      const rollbackSlug = `${marker}-rollback`;
      const rollback = await request('/admin/products', {
        method: 'POST',
        token: adminToken,
        body: productPayload({
          slug: rollbackSlug,
          variants: [{ ...productPayload().variants[0], sku: `${marker}-SKU-1` }],
        }),
      });
      assert.equal(rollback.status, 409);
      const count = await pool.query('SELECT COUNT(*)::int AS count FROM "Product" WHERE "slug" = $1', [
        rollbackSlug,
      ]);
      assert.equal(count.rows[0].count, 0);
    });

    await suite.test('duplicate product slug and SKU return 409', async () => {
      const duplicateSlug = await request('/admin/products', {
        method: 'POST',
        token: adminToken,
        body: productPayload({
          variants: [{ ...productPayload().variants[0], sku: `${marker}-UNIQUE-SKU` }],
        }),
      });
      assert.equal(duplicateSlug.status, 409);

      const duplicateSku = await request('/admin/products', {
        method: 'POST',
        token: adminToken,
        body: productPayload({ slug: `${marker}-unique-product` }),
      });
      assert.equal(duplicateSku.status, 409);
    });

    await suite.test('public product APIs are safe, searchable, and paginated', async () => {
      const listing = await request(`/products?search=${encodeURIComponent(`${marker}-SKU-1`)}`);
      assert.equal(listing.status, 200);
      const body = await json(listing);
      assert.equal(body.pagination.page, 1);
      assert.equal(body.pagination.limit, 20);
      assert.ok(body.data.some((item) => item.id === productId));
      assert.equal('deletedAt' in body.data[0], false);
      assert.equal('reservedQuantity' in body.data[0].variants[0], false);

      assert.equal((await request('/products?limit=101')).status, 400);
      assert.equal((await request('/products?page=-1')).status, 400);
      assert.equal((await request('/products?sort=price_low')).status, 200);
      assert.equal((await request('/products?sort=price_high')).status, 200);
      assert.equal((await request(`/products/${marker}-product`)).status, 200);
    });

    await suite.test('ADMIN update, variant, and inventory APIs work safely', async () => {
      const updated = await request(`/admin/products/${productId}`, {
        method: 'PATCH',
        token: adminToken,
        body: { name: 'Updated Catalog Product' },
      });
      assert.equal(updated.status, 200);
      assert.equal((await json(updated)).name, 'Updated Catalog Product');

      const variant = await request(`/admin/products/${productId}/variants`, {
        method: 'POST',
        token: adminToken,
        body: {
          sku: `${marker}-SKU-2`,
          name: 'Second',
          attributes: { size: 'L' },
          retailPricePaise: 39900,
          wholesaleMinQty: 1,
          stockQuantity: 4,
          reorderLevel: 5,
        },
      });
      assert.equal(variant.status, 201);
      const secondVariant = await json(variant);

      const inventory = await request(`/admin/inventory/${secondVariant.id}`, {
        method: 'PATCH',
        token: adminToken,
        body: { stockQuantity: 8, reorderLevel: 2 },
      });
      assert.equal(inventory.status, 200);
      assert.equal((await json(inventory)).stockQuantity, 8);
      assert.equal(
        (
          await request(`/admin/inventory/${secondVariant.id}`, {
            method: 'PATCH',
            token: adminToken,
            body: { stockQuantity: -1 },
          })
        ).status,
        400,
      );
      assert.equal(
        (
          await request(`/admin/inventory/${secondVariant.id}`, {
            method: 'PATCH',
            token: adminToken,
            body: { reservedQuantity: 0 },
          })
        ).status,
        400,
      );

      const deactivated = await request(`/admin/variants/${secondVariant.id}`, {
        method: 'PATCH',
        token: adminToken,
        body: { isActive: false },
      });
      assert.equal(deactivated.status, 200);
      const publicProduct = await json(await request(`/products/${marker}-product`));
      assert.equal(publicProduct.variants.some((item) => item.id === secondVariant.id), false);

      const inventoryList = await request('/admin/inventory', { token: adminToken });
      assert.equal(inventoryList.status, 200);
      assert.ok((await json(inventoryList)).pagination);
    });

    await suite.test('soft-delete hides public product and restore preserves variant state', async () => {
      const removed = await request(`/admin/products/${productId}`, {
        method: 'DELETE',
        token: adminToken,
      });
      assert.equal(removed.status, 200);
      assert.equal((await request(`/products/${marker}-product`)).status, 404);

      const restored = await request(`/admin/products/${productId}/restore`, {
        method: 'POST',
        token: adminToken,
      });
      assert.equal(restored.status, 201);
      const restoredProduct = await json(restored);
      assert.equal(restoredProduct.deletedAt, null);
      assert.equal(restoredProduct.variants.every((variant) => !variant.isActive), true);
    });

    await suite.test('category deletion deactivates and audit logs are recorded', async () => {
      const deactivated = await request(`/admin/categories/${categoryId}`, {
        method: 'DELETE',
        token: adminToken,
      });
      assert.equal(deactivated.status, 200);
      assert.equal((await request(`/categories/${marker}-category`)).status, 404);

      const audit = await pool.query(
        'SELECT "action" FROM "AdminAuditLog" WHERE "adminUserId" = (SELECT "id" FROM "User" WHERE "email" = $1)',
        [adminEmail],
      );
      const actions = new Set(audit.rows.map((row) => row.action));
      for (const action of [
        'CATEGORY_CREATE',
        'CATEGORY_UPDATE',
        'CATEGORY_DEACTIVATE',
        'PRODUCT_CREATE',
        'PRODUCT_UPDATE',
        'PRODUCT_DELETE',
        'PRODUCT_RESTORE',
        'VARIANT_CREATE',
        'VARIANT_DEACTIVATE',
        'INVENTORY_UPDATE',
      ]) {
        assert.ok(actions.has(action), `Missing audit action ${action}`);
      }
    });
  } finally {
    api.kill();
    await cleanup();
    await pool.end();
  }
});
