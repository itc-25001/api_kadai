import type { RequestHandler } from 'express'
import { prisma } from './db'
import { error, sendErrors } from './http'

export const requireAuth: RequestHandler = async (req, res, next) => {
  const userId = req.session.userId
  if (!userId) {
    sendErrors(res, 401, [error('auth', 'ログインしてください')])
    return
  }

  const user = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null },
    select: { id: true },
  })
  if (!user) {
    sendErrors(res, 401, [error('auth', 'ログインしてください')])
    return
  }
  next()
}
