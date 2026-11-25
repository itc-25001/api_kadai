import { Router } from 'express'
import argon2 from 'argon2'
import { prisma } from '../lib/db'
import { error, isRecord, sendErrors, type FieldError } from '../lib/http'
import { requireAuth } from '../lib/auth'

const router = Router()
const hashOptions = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const

function getEmail(value: unknown): { email: string; errors: FieldError[] } {
  const email = typeof value === 'string' ? value.trim().toLowerCase() : ''
  if (email.length > 256 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { email, errors: [error('email', 'メールアドレス形式で入力してください')] }
  }
  return { email, errors: [] }
}

function validatePassword(value: unknown): FieldError[] {
  if (typeof value !== 'string' || value.length < 8) {
    return [error('password', 'パスワードは8文字以上で入力してください')]
  }
  if (value.length > 1024) {
    return [error('password', 'パスワードが長すぎます')]
  }
  return []
}

function validateName(value: unknown): { name: string | null; errors: FieldError[] } {
  if (typeof value !== 'string') {
    return { name: null, errors: [error('name', '名前は文字列で入力してください')] }
  }
  const name = value.trim()
  if (name.length > 128) {
    return { name: null, errors: [error('name', '名前は128文字以内で入力してください')] }
  }
  return { name: name || null, errors: [] }
}

// POST /api/user/register  新規登録
router.post('/register', async (req, res) => {
  const body = isRecord(req.body) ? req.body : {}
  const { email, errors: emailErrors } = getEmail(body.email)
  const passwordErrors = validatePassword(body.password)
  const { name, errors: nameErrors } = body.name === undefined
    ? { name: null, errors: [] as FieldError[] }
    : validateName(body.name)
  const errors = [...emailErrors, ...passwordErrors, ...nameErrors]
  if (errors.length) {
    sendErrors(res, 400, errors)
    return
  }

  try {
    const password = await argon2.hash(body.password as string, hashOptions)
    await prisma.user.create({ data: { email, password, name } })
    res.status(200).json({ message: 'OK' })
  } catch (e: unknown) {
    // Prisma unique制約違反（メールアドレスの重複）
    if (isRecord(e) && e.code === 'P2002') {
      sendErrors(res, 400, [error('email', 'このメールアドレスは登録済みです')])
      return
    }
    throw e
  }
})

// POST /api/user/login  ログイン
router.post('/login', async (req, res) => {
  const body = isRecord(req.body) ? req.body : {}
  const { email } = getEmail(body.email)
  const password = body.password
  const loginError = () => sendErrors(res, 401, [error('auth', 'ログインに失敗しました')])

  if (typeof password !== 'string') {
    loginError()
    return
  }

  const user = await prisma.user.findFirst({ where: { email, deletedAt: null } })
  if (!user || !await argon2.verify(user.password, password)) {
    loginError()
    return
  }

  // セッション固定攻撃を避けるため、ログイン時にセッションを再生成
  await new Promise<void>((resolve, reject) => {
    req.session.regenerate(err => err ? reject(err) : resolve())
  })
  req.session.userId = user.id
  await new Promise<void>((resolve, reject) => {
    req.session.save(err => err ? reject(err) : resolve())
  })
  res.status(200).json({ message: 'OK' })
})

// PUT /api/user/change  名前・パスワード変更

router.put('/change', requireAuth, async (req, res) => {
  const body = isRecord(req.body) ? req.body : {}

  const hasEmail = Object.prototype.hasOwnProperty.call(body, 'email')
  const hasName = Object.prototype.hasOwnProperty.call(body, 'name')
  const hasPassword = Object.prototype.hasOwnProperty.call(body, 'password')

  if (!hasEmail && !hasName && !hasPassword) {
    sendErrors(res, 400, [error('name', '変更する項目を指定してください')])
    return
  }

  const emailResult = hasEmail ? getEmail(body.email) : null
  const nameResult = hasName ? validateName(body.name) : null
  const passwordErrors = hasPassword ? validatePassword(body.password) : []

  const errors = [
    ...(emailResult?.errors ?? []),
    ...(nameResult?.errors ?? []),
    ...passwordErrors
  ]

  if (errors.length) {
    sendErrors(res, 400, errors)
    return
  }

  const data: {
    email?: string
    name?: string | null
    password?: string
  } = {}

  if (hasEmail) data.email = emailResult!.email
  if (hasName) data.name = nameResult!.name
  if (hasPassword) {
    data.password = await argon2.hash(body.password as string, hashOptions)
  }

  try {
    await prisma.user.update({
      where: { id: req.session.userId! },
      data
    })
  } catch (e: unknown) {
    if (isRecord(e) && e.code === 'P2002') {
      sendErrors(res, 400, [
        error('email', 'このメールアドレスは既に使用されています')
      ])
      return
    }
    throw e
  }

  res.status(200).json({ message: 'Changed!' })
})


// おまけのAPI：POST /api/user/logout  セッション破棄
router.post('/logout', requireAuth, async (req, res) => {
  await new Promise<void>((resolve, reject) => {
    req.session.destroy(err => err ? reject(err) : resolve())
  })
  res.clearCookie('forum.sid', { path: '/' })
  res.status(200).json({ message: 'OK' })
})

export default router
