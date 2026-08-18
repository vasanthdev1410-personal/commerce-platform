# Backend API inventory

All paths are relative to `/api/v1`. `Customer` means a valid, active database-backed session; `Admin` additionally requires the database role `ADMIN`.

| Area | Method | Path | Access |
|---|---|---|---|
| Auth | POST | `/auth/register` | Public |
| Auth | POST | `/auth/login` | Public |
| Auth | POST | `/auth/refresh` | Refresh cookie |
| Auth | POST | `/auth/logout` | Refresh cookie (idempotent) |
| Auth | POST | `/auth/logout-all` | Customer |
| Auth | GET | `/auth/me` | Customer |
| Users | GET, PATCH | `/users/me` | Customer |
| Addresses | GET, POST | `/addresses` | Customer |
| Addresses | GET, PATCH, DELETE | `/addresses/:id` | Owner |
| Addresses | POST | `/addresses/:id/default` | Owner |
| Wholesale | POST | `/wholesale/applications` | Customer |
| Wholesale | GET | `/wholesale/application` | Customer/owner |
| Categories | GET | `/categories` | Public |
| Categories | GET | `/categories/:slug` | Public |
| Categories | POST | `/admin/categories` | Admin |
| Categories | PATCH, DELETE | `/admin/categories/:id` | Admin |
| Products | GET | `/products` | Public |
| Products | GET | `/products/:slug` | Public |
| Products | GET, POST | `/admin/products` | Admin |
| Products | GET, PATCH, DELETE | `/admin/products/:id` | Admin |
| Products | POST | `/admin/products/:id/restore` | Admin |
| Variants | POST | `/admin/products/:productId/variants` | Admin |
| Variants | PATCH | `/admin/variants/:variantId` | Admin |
| Inventory | GET | `/admin/inventory` | Admin |
| Inventory | PATCH | `/admin/inventory/:variantId` | Admin |
| Images | GET, POST | `/admin/products/:productId/images` | Admin |
| Images | POST | `/admin/products/:productId/images/presign` | Admin |
| Images | PATCH, DELETE | `/admin/products/:productId/images/:imageId` | Admin |
| Cart | GET, DELETE | `/cart` | Customer |
| Cart | PATCH | `/cart/pricing-mode` | Customer |
| Cart | POST | `/cart/items` | Customer |
| Cart | PATCH, DELETE | `/cart/items/:id` | Owner |
| Checkout | GET | `/checkout/addresses` | Customer |
| Checkout | POST | `/checkout/preview` | Customer |
| Checkout | POST | `/checkout/order` | Customer + idempotency key |
| Orders | GET | `/orders` | Customer |
| Orders | GET | `/orders/:id` | Owner |
| Orders | POST | `/orders/:id/cancel` | Owner |
| Payments | POST | `/payments/razorpay/create` | Customer/order owner |
| Payments | POST | `/payments/razorpay/verify` | Customer/order owner |
| Payments | GET | `/orders/:orderId/payment` | Owner |
| Payments | POST | `/webhooks/razorpay` | Valid provider signature |
| Admin customers | GET | `/admin/customers` | Admin |
| Admin customers | GET | `/admin/customers/:id` | Admin |
| Admin customers | PATCH | `/admin/customers/:id/status` | Admin |
| Admin customers | GET | `/admin/wholesale/applications` | Admin |
| Admin customers | GET | `/admin/wholesale/applications/:id` | Admin |
| Admin customers | POST | `/admin/wholesale/applications/:id/approve` | Admin |
| Admin customers | POST | `/admin/wholesale/applications/:id/reject` | Admin |
| Admin orders | GET | `/admin/orders` | Admin |
| Admin orders | GET | `/admin/orders/:id` | Admin |
| Admin orders | PATCH | `/admin/orders/:id/status` | Admin |
| Admin orders | POST | `/admin/orders/:id/refund` | Admin + idempotency key |
| Admin payments | GET | `/admin/payments` | Admin |
| Admin payments | GET | `/admin/payments/:id` | Admin |
| Admin payments | POST | `/admin/payments/:id/reconcile` | Admin |
| Shipping | GET, POST | `/admin/shipping/rules` | Admin |
| Shipping | PATCH, DELETE | `/admin/shipping/rules/:id` | Admin |
| Shipping | POST | `/admin/orders/:orderId/shipment` | Admin |
| Shipping | PATCH | `/admin/shipments/:id` | Admin |
| Shipping | GET | `/orders/:orderId/shipment` | Owner |
| Returns | POST | `/orders/:orderId/returns` | Owner |
| Returns | GET | `/returns` | Customer |
| Returns | GET | `/returns/:id` | Owner |
| Returns | POST | `/returns/:id/cancel` | Owner |
| Returns | GET | `/admin/returns` | Admin |
| Returns | GET | `/admin/returns/:id` | Admin |
| Returns | POST | `/admin/returns/:id/approve` | Admin |
| Returns | POST | `/admin/returns/:id/reject` | Admin |
| Returns | POST | `/admin/returns/:id/received` | Admin |
| Returns | POST | `/admin/returns/:id/restock` | Admin |
| Returns | POST | `/admin/returns/:id/complete` | Admin |
| Tax | GET, POST | `/admin/tax-profiles` | Admin |
| Tax | PATCH, DELETE | `/admin/tax-profiles/:id` | Admin |
| Coupons | GET, POST | `/admin/coupons` | Admin |
| Coupons | GET, PATCH, DELETE | `/admin/coupons/:id` | Admin |
| Invoices | GET | `/orders/:orderId/invoice` | Owner |
| Invoices | GET | `/admin/orders/:orderId/invoice` | Admin |
| Health | GET | `/health` | Public |
| Health | GET | `/health/database` | Public |
| Admin health | GET | `/admin/health` | Admin |
