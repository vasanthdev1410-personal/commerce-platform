'use client';
/* eslint-disable @next/next/no-img-element -- reviewer-upload hosts are dynamic provider URLs */

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useAuth } from '@/features/auth/auth-provider';
import { apiRequest } from '@/lib/api/client';

interface ReviewMedia { id: string; url: string; width: number | null; height: number | null }
interface Review {
  id: string;
  productId?: string;
  rating: number;
  title: string | null;
  body: string | null;
  status?: 'PENDING' | 'APPROVED' | 'REJECTED';
  moderationReason?: string | null;
  verifiedPurchase: boolean;
  createdAt: string;
  updatedAt: string;
  user?: { firstName: string; lastName: string };
  media: ReviewMedia[];
}
interface Page<T> { data: T[]; pagination: { page: number; limit: number; total: number; totalPages: number } }
interface Summary { averageRating: number; reviewCount: number; ratingDistribution: Record<'1' | '2' | '3' | '4' | '5', number> }
interface GalleryItem extends ReviewMedia { review: { id: string; title: string | null } }
interface SelectedFile { file: File; preview: string }
interface UploadAuth {
  token: string; expire: number; signature: string; publicKey: string; uploadUrl: string;
  fileName: string; folder: string; useUniqueFileName: false; mockFileId?: string;
}

const emptySummary: Summary = { averageRating: 0, reviewCount: 0, ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } };

export default function ProductReviews({ productId }: { productId: string }) {
  const { isAuthenticated, isLoading: authLoading, authenticatedRequest } = useAuth();
  const [summary, setSummary] = useState<Summary>(emptySummary);
  const [reviews, setReviews] = useState<Page<Review> | null>(null);
  const [gallery, setGallery] = useState<GalleryItem[]>([]);
  const [mine, setMine] = useState<Review | null>(null);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState('newest');
  const [ratingFilter, setRatingFilter] = useState('');
  const [rating, setRating] = useState(5);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [files, setFiles] = useState<SelectedFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [publicLoading, setPublicLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadPublic = useCallback(async () => {
    const params = new URLSearchParams({ page: String(page), limit: '10', sort });
    if (ratingFilter) params.set('rating', ratingFilter);
    const [nextSummary, nextReviews, nextGallery] = await Promise.all([
      apiRequest<Summary>(`/products/${productId}/reviews/summary`),
      apiRequest<Page<Review>>(`/products/${productId}/reviews?${params}`),
      apiRequest<GalleryItem[]>(`/products/${productId}/reviews/gallery?page=1&limit=12`),
    ]);
    setSummary(nextSummary);
    setReviews(nextReviews);
    setGallery(nextGallery);
    setPublicLoading(false);
  }, [page, productId, ratingFilter, sort]);

  const loadMine = useCallback(async () => {
    if (!isAuthenticated) { setMine(null); return; }
    const result = await authenticatedRequest<Page<Review>>('/me/reviews?page=1&limit=100');
    const own = result.data.find((review) => review.productId === productId) ?? null;
    setMine(own);
    if (own) { setRating(own.rating); setTitle(own.title ?? ''); setBody(own.body ?? ''); }
  }, [authenticatedRequest, isAuthenticated, productId]);

  useEffect(() => { void Promise.resolve().then(loadPublic).catch(() => { setPublicLoading(false); setError('Reviews could not be loaded.'); }); }, [loadPublic]);
  useEffect(() => { if (!authLoading) void Promise.resolve().then(loadMine).catch(() => setError('Your review could not be loaded.')); }, [authLoading, loadMine]);
  useEffect(() => () => { for (const selected of files) URL.revokeObjectURL(selected.preview); }, [files]);

  const upload = async (reviewId: string, file: File, sortOrder: number) => {
    const auth = await authenticatedRequest<UploadAuth>(`/reviews/${reviewId}/media/upload-auth`, {
      method: 'POST', body: JSON.stringify({ contentType: file.type, fileSize: file.size }),
    });
    let uploaded: { fileId: string; width?: number; height?: number };
    if (auth.mockFileId) {
      uploaded = { fileId: auth.mockFileId };
    } else {
      const form = new FormData();
      form.set('file', file);
      form.set('fileName', auth.fileName);
      form.set('publicKey', auth.publicKey);
      form.set('signature', auth.signature);
      form.set('expire', String(auth.expire));
      form.set('token', auth.token);
      form.set('folder', auth.folder);
      form.set('useUniqueFileName', String(auth.useUniqueFileName));
      const response = await fetch(auth.uploadUrl, { method: 'POST', body: form });
      if (!response.ok) throw new Error('An image upload failed.');
      uploaded = await response.json() as { fileId: string; width?: number; height?: number };
    }
    await authenticatedRequest(`/reviews/${reviewId}/media/confirm`, {
      method: 'POST',
      body: JSON.stringify({ fileId: uploaded.fileId, sortOrder, width: uploaded.width, height: uploaded.height }),
    });
  };

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true); setError(null); setMessage(null);
    try {
      const payload = { rating, ...(title.trim() && { title: title.trim() }), ...(body.trim() && { body: body.trim() }) };
      const saved = mine
        ? await authenticatedRequest<Review>(`/reviews/${mine.id}`, { method: 'PATCH', body: JSON.stringify(payload) })
        : await authenticatedRequest<Review>('/reviews', { method: 'POST', body: JSON.stringify({ productId, ...payload }) });
      for (const [index, selected] of files.entries()) await upload(saved.id, selected.file, Math.min((mine?.media.length ?? 0) + index, 4));
      setFiles([]);
      setMessage('Your review was submitted for moderation.');
      await Promise.all([loadMine(), loadPublic()]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Review could not be saved.');
    } finally { setBusy(false); }
  };

  const remove = async () => {
    if (!mine || !window.confirm('Delete your review?')) return;
    setBusy(true); setError(null);
    try {
      await authenticatedRequest(`/reviews/${mine.id}`, { method: 'DELETE' });
      setMine(null); setTitle(''); setBody(''); setFiles([]);
      setMessage('Your review was deleted.');
      await loadPublic();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Review could not be deleted.'); }
    finally { setBusy(false); }
  };

  const removeMedia = async (mediaId: string) => {
    if (!mine || !window.confirm('Delete this review image?')) return;
    setBusy(true); setError(null);
    try {
      await authenticatedRequest(`/reviews/${mine.id}/media/${mediaId}`, { method: 'DELETE' });
      await Promise.all([loadMine(), loadPublic()]);
      setMessage('Review image deleted.');
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Image could not be deleted.'); }
    finally { setBusy(false); }
  };

  return (
    <section aria-labelledby={`product-reviews-${productId}`} className="mt-16 border-t pt-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 id={`product-reviews-${productId}`} className="text-3xl font-bold">Customer reviews</h2>
          <p className="mt-2 text-lg"><span aria-label={`${summary.averageRating} out of 5 stars`}>{'★'.repeat(Math.round(summary.averageRating))}{'☆'.repeat(5 - Math.round(summary.averageRating))}</span> {summary.averageRating.toFixed(1)} from {summary.reviewCount} review{summary.reviewCount === 1 ? '' : 's'}</p>
        </div>
        <div className="flex gap-3">
          <select aria-label="Filter by rating" className="form-input" value={ratingFilter} onChange={(event) => { setPage(1); setRatingFilter(event.target.value); }}>
            <option value="">All ratings</option>{[5, 4, 3, 2, 1].map((star) => <option key={star} value={star}>{star} stars ({summary.ratingDistribution[String(star) as keyof Summary['ratingDistribution']]})</option>)}
          </select>
          <select aria-label="Sort reviews" className="form-input" value={sort} onChange={(event) => { setPage(1); setSort(event.target.value); }}>
            <option value="newest">Newest</option><option value="oldest">Oldest</option><option value="highest-rating">Highest rating</option><option value="lowest-rating">Lowest rating</option>
          </select>
        </div>
      </div>

      {gallery.length > 0 && <div className="mt-6 flex gap-3 overflow-x-auto pb-2" aria-label="Customer photo gallery">{gallery.map((image) => <a key={image.id} href={image.url} target="_blank" rel="noreferrer" className="shrink-0"><img src={image.url} alt={image.review.title ?? 'Customer review photo'} className="h-24 w-24 rounded-lg object-cover" /></a>)}</div>}

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-4">
          {publicLoading ? <p role="status" className="rounded-xl border bg-white p-6">Loading reviews…</p> : reviews?.data.length ? reviews.data.map((review) => (
            <article key={review.id} className="rounded-xl border bg-white p-5">
              <div className="flex flex-wrap justify-between gap-2"><strong>{'★'.repeat(review.rating)}{'☆'.repeat(5 - review.rating)}</strong><time className="text-sm text-slate-500" dateTime={review.createdAt}>{new Date(review.createdAt).toLocaleDateString()}</time></div>
              {review.title && <h3 className="mt-2 text-lg font-semibold">{review.title}</h3>}
              {review.body && <p className="mt-2 whitespace-pre-line text-slate-700">{review.body}</p>}
              <p className="mt-3 text-sm text-slate-600">{review.user ? `${review.user.firstName} ${review.user.lastName.slice(0, 1)}.` : 'Customer'} {review.verifiedPurchase && <span className="ml-2 rounded-full bg-emerald-100 px-2 py-1 font-semibold text-emerald-800">Verified purchase</span>}</p>
              {review.media.length > 0 && <div className="mt-4 flex flex-wrap gap-2">{review.media.map((image) => <a key={image.id} href={image.url} target="_blank" rel="noreferrer"><img src={image.url} alt="Customer review attachment" className="h-24 w-24 rounded-lg object-cover" /></a>)}</div>}
            </article>
          )) : <p className="rounded-xl border bg-white p-6">No approved reviews yet.</p>}
          {(reviews?.pagination.totalPages ?? 0) > 1 && <div className="flex items-center justify-between"><button type="button" className="rounded-lg border px-4 py-2" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Previous</button><span>Page {page} of {reviews?.pagination.totalPages}</span><button type="button" className="rounded-lg border px-4 py-2" disabled={page >= (reviews?.pagination.totalPages ?? 1)} onClick={() => setPage((value) => value + 1)}>Next</button></div>}
        </div>

        <aside className="h-fit rounded-xl border bg-white p-5">
          <h3 className="text-xl font-semibold">{mine ? 'Edit your review' : 'Write a review'}</h3>
          {!authLoading && !isAuthenticated ? <p className="mt-3"><Link href="/login" className="font-semibold text-blue-700 underline">Sign in</Link> to review a delivered purchase.</p> : (
            <form onSubmit={save} className="mt-4 space-y-4">
              {mine?.status && <p className="rounded-lg bg-slate-100 p-3 text-sm">Status: <strong>{mine.status}</strong>{mine.moderationReason ? ` — ${mine.moderationReason}` : ''}</p>}
              <label className="block">Rating<select className="form-input mt-1" value={rating} onChange={(event) => setRating(Number(event.target.value))}>{[5, 4, 3, 2, 1].map((star) => <option key={star} value={star}>{star} stars</option>)}</select></label>
              <label className="block">Title <span className="text-slate-500">(optional)</span><input className="form-input mt-1" maxLength={150} value={title} onChange={(event) => setTitle(event.target.value)} /></label>
              <label className="block">Review <span className="text-slate-500">(optional)</span><textarea className="form-input mt-1 min-h-28" maxLength={5000} value={body} onChange={(event) => setBody(event.target.value)} /></label>
              {mine?.media.length ? <div className="flex flex-wrap gap-2">{mine.media.map((image) => <div key={image.id} className="relative"><img src={image.url} alt="Your review attachment" className="h-20 w-20 rounded-lg object-cover" /><button type="button" aria-label="Delete review image" className="absolute -right-2 -top-2 rounded-full bg-red-700 px-2 py-1 text-xs text-white" onClick={() => void removeMedia(image.id)}>×</button></div>)}</div> : null}
              <label className="block">Add photos <span className="text-slate-500">(up to 5 JPEG, PNG, or WebP)</span><input className="mt-1 block w-full text-sm" type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(event) => setFiles(Array.from(event.target.files ?? []).slice(0, Math.max(0, 5 - (mine?.media.length ?? 0))).map((file) => ({ file, preview: URL.createObjectURL(file) })))} /></label>
              {files.length > 0 && <div className="flex flex-wrap gap-2" aria-label="Selected image previews">{files.map((selected) => <img key={`${selected.file.name}-${selected.file.lastModified}`} src={selected.preview} alt={`Preview of ${selected.file.name}`} className="h-20 w-20 rounded-lg object-cover" />)}</div>}
              <button className="primary-button w-full" disabled={busy || authLoading}>{busy ? 'Saving…' : mine ? 'Update review' : 'Submit review'}</button>
              {mine && <button type="button" className="w-full rounded-lg border border-red-300 px-4 py-2 font-semibold text-red-700" disabled={busy} onClick={() => void remove()}>Delete review</button>}
            </form>
          )}
          {message && <p role="status" className="mt-3 text-sm text-emerald-700">{message}</p>}
          {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
        </aside>
      </div>
    </section>
  );
}
