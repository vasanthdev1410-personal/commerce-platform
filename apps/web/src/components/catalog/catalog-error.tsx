export function CatalogError({ message = 'We could not load the catalog right now. Please try again shortly.' }: { message?: string }) {
  return <div role="alert" className="mx-auto max-w-2xl rounded-2xl border border-red-200 bg-red-50 px-6 py-10 text-center"><h1 className="text-xl font-semibold text-red-900">Something went wrong</h1><p className="mt-2 text-red-800">{message}</p></div>;
}
