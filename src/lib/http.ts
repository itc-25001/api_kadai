import type { Response } from 'express'

export type FieldError = { name: string; reason: string }

export function sendErrors(res: Response, status: number, errors: FieldError[]) {
  return res.status(status).json({ errors })
}

export function error(name: string, reason: string): FieldError {
  return { name, reason }
}

export function notFound(res: Response) {
  return sendErrors(res, 404, [error('id', '対象のデータが存在しません')])
}

export function forbidden(res: Response) {
  return sendErrors(res, 403, [error('perm', '変更できませんでした')])
}

export function validateText(
  value: unknown,
  name: string,
  maxLength: number,
  label: string,
): { value: string | null; errors: FieldError[] } {
  if (typeof value !== 'string' || value.trim() === '') {
    return { value: null, errors: [error(name, `${label}は必須項目です`)] }
  }
  const cleaned = value.trim()
  if (cleaned.length > maxLength) {
    return { value: null, errors: [error(name, `${label}は${maxLength}文字以内で入力してください`)] }
  }
  return { value: cleaned, errors: [] }
}

export function parsePage(value: unknown): number | null {
  if (value === undefined) return 1
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) return null
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) ? parsed : null
}

// 不正なIDは500ではなく404にする。バージョンに関わらずUUID形式を確認する。
export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
