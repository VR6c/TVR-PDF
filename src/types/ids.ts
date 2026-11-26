/** Branded string IDs so a DocumentId can't be passed where an AnnotationId is expected. */
type Brand<T, B extends string> = T & { readonly __brand: B }

export type DocumentId = Brand<string, 'DocumentId'>
export type AnnotationId = Brand<string, 'AnnotationId'>
export type SignatureId = Brand<string, 'SignatureId'>
export type SessionId = Brand<string, 'SessionId'>

/**
 * Stable identity of a page within a document, independent of its position.
 * Annotations reference this, never a page index, so reordering and deleting
 * pages cannot orphan or mis-attach them.
 */
export type PageId = Brand<string, 'PageId'>

export const newId = <T extends string>(): T => crypto.randomUUID() as T
