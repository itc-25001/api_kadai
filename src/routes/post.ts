import { Router } from 'express'
import { prisma } from '../lib/db'
import { requireAuth } from '../lib/auth'
import { forbidden, isRecord, isUuid, notFound, sendErrors, validateText } from '../lib/http'

const router = Router()
router.use(requireAuth)

// PUT /api/post/{post_id}  投稿者本人のみ編集可能
router.put('/:post_id', async (req, res) => {
  const postId = req.params.post_id
  if (!isUuid(postId)) {
    notFound(res)
    return
  }
  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: {
      contributorId: true,
      deletedAt: true,
      topic: { select: { deletedAt: true } },
    },
  })
  if (!post || post.deletedAt || post.topic.deletedAt) {
    notFound(res)
    return
  }
  if (post.contributorId !== req.session.userId) {
    forbidden(res)
    return
  }
  const body = isRecord(req.body) ? req.body : {}
  const message = validateText(body.message, 'message', 512, 'メッセージ')
  if (message.errors.length) {
    sendErrors(res, 400, message.errors)
    return
  }
  const updated = await prisma.post.updateMany({
    where: { id: postId, contributorId: req.session.userId!, deletedAt: null },
    data: { message: message.value! },
  })
  if (updated.count === 0) {
    notFound(res)
    return
  }
  res.status(200).json({ message: 'OK' })
})

// DELETE /api/post/{post_id}  投稿者本人のみ論理削除可能
router.delete('/:post_id', async (req, res) => {
  const postId = req.params.post_id
  if (!isUuid(postId)) {
    notFound(res)
    return
  }
  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: {
      contributorId: true,
      deletedAt: true,
      topic: { select: { deletedAt: true } },
    },
  })
  if (!post || post.deletedAt || post.topic.deletedAt) {
    notFound(res)
    return
  }
  if (post.contributorId !== req.session.userId) {
    forbidden(res)
    return
  }
  const deleted = await prisma.post.updateMany({
    where: { id: postId, contributorId: req.session.userId!, deletedAt: null },
    data: { deletedAt: new Date() },
  })
  if (deleted.count === 0) {
    notFound(res)
    return
  }
  res.status(200).json({ message: 'deleted' })
})

export default router
