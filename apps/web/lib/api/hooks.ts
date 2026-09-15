'use client'

/**
 * SWR foundation wired to the typed API client (B10-C).
 *
 * Provides typed SWR hooks, fetchers, and configuration built directly on top of
 * the ADR-006 envelope-aware `apiRequest` and `apiGet` from `lib/api/client.ts`.
 *
 * ## Principles
 *
 * 1. Single source of truth: `apiFetcher` delegates directly to `apiGet`, which preserves
 *    correlation headers (B9-B `x-request-id`), `errorId`, normalized `ApiFailureKind`,
 *    and HTTP statuses.
 * 2. Discriminated Error Handling: When an API call fails, `apiFetcher` throws an
 *    `ApiRequestError` (an `Error` subclass implementing `ApiError`), ensuring SWR
 *    error boundaries receive rich, typed error context without losing `requestId`.
 * 3. Safe retry semantics: Auth (401), permission (403), not-found (404), and validation
 *    (422) errors are never retried automatically to prevent alert storms and auth loops.
 * 4. Zero client/server boundary leaks: Keeps zero server or data-layer dependencies.
 */

import React from 'react'
import useSWR, {
  SWRConfig,
  type Key,
  type SWRConfiguration,
  type SWRResponse,
  useSWRConfig,
  mutate,
} from 'swr'

import {
  apiGet,
  ApiRequestError,
  type ApiEndpoint,
  type ApiError,
} from '@/lib/api/client'

export { ApiRequestError, type ApiError }

/**
 * SWR fetcher backed by the B10-B typed client.
 *
 * Returns typed `data` on success (2xx); throws `ApiRequestError` on HTTP,
 * network, parse, or contract failures.
 */
export async function apiFetcher<T = unknown>(path: string): Promise<T> {
  const result = await apiGet<T>(path)
  if (!result.ok) {
    throw new ApiRequestError(result.error)
  }
  return result.data
}

/**
 * Default retry decision for SWR: retry transient network/server hiccups, but never
 * retry deterministic client or auth rejections (401, 403, 404, 422).
 */
export function defaultShouldRetryOnError(err: unknown): boolean {
  if (err && typeof err === 'object' && 'status' in err) {
    const status = Number((err as { status?: unknown }).status)
    if (status === 401 || status === 403 || status === 404 || status === 422) {
      return false
    }
  }
  return true
}

/**
 * SWR Hook wired to the typed API client.
 *
 * Automatically provides `apiFetcher` and types the returned error as `ApiRequestError`.
 */
export function useApiQuery<TData = unknown>(
  key: Key,
  config?: SWRConfiguration<TData, ApiRequestError>
): SWRResponse<TData, ApiRequestError> {
  return useSWR<TData, ApiRequestError>(
    key,
    typeof key === 'string' ? () => apiFetcher<TData>(key) : (key ? () => apiFetcher<TData>(String(key)) : null),
    {
      shouldRetryOnError: defaultShouldRetryOnError,
      ...config,
    }
  )
}

/**
 * Calls a declared `ApiEndpoint` descriptor using SWR.
 */
export function useApiEndpoint<TResponse = unknown>(
  endpoint: ApiEndpoint<unknown, TResponse> | null,
  config?: SWRConfiguration<TResponse, ApiRequestError>
): SWRResponse<TResponse, ApiRequestError> {
  const key = endpoint ? endpoint.path : null
  return useApiQuery<TResponse>(key, config)
}

export interface ApiClientProviderProps {
  children: React.ReactNode
  value?: SWRConfiguration
}

/**
 * SWR configuration provider for the Prodily application.
 *
 * Establishes global deduplication, focus revalidation, and failure retry boundaries.
 */
export function ApiClientProvider({ children, value }: ApiClientProviderProps) {
  return React.createElement(
    SWRConfig,
    {
      value: {
        fetcher: apiFetcher,
        revalidateOnFocus: true,
        dedupingInterval: 2000,
        shouldRetryOnError: defaultShouldRetryOnError,
        ...value,
      },
    },
    children
  )
}

export { useSWR, useSWRConfig, mutate }
