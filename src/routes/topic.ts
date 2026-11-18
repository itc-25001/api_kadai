
// =====================================================
// topic.ts : トピック（スレッド）関連のREST API
// ① 共通処理：入力値の検証・ログイン認証・権限チェック
// ② トピック一覧の取得
// ③ トピックの新規作成
// ④ トピック内のメッセージ取得・投稿
// ⑤ トピックのタイトル変更・削除
// =====================================================

import { Router } from 'express'
import { prisma } from '../lib/db'
import { requireAuth } from '../lib/auth'
import { error, forbidden, isRecord, isUuid, notFound, parsePage, sendErrors, validateText } from '../lib/http'

// =====================================================
// ① 入力値の検証・ログイン認証・権限チェック（共通）
// =====================================================
// ExpressのRouterを作成する
const router = Router()

// このファイルの全APIにログイン認証を適用する
// 未ログインの場合は401エラー（requireAuthの処理）
router.use(requireAuth)

// 1ページに表示する最大件数
const PAGE_SIZE = 5

// 入力値の検証に使用する共通関数（../lib/http から読み込み）
//  ・isRecord：リクエストのbodyがオブジェクトか確認
//  ・validateText：必須項目や文字数を確認
//  ・parsePage：ページ番号を確認
//  ・isUuid：URLのIDがUUID形式か確認
//  ・sendErrors：400エラーなどをJSON形式で返す
// 権限チェックは編集・削除API内で作成者IDとログインIDを比較する

// =====================================================
// ② トピック一覧の取得
// =====================================================

// GET /api/topic?page=1
// 削除されていないトピックを最終更新日時の新しい順に5件ずつ取得
router.get('/', async (req, res) => {
  // URLの?page= の値を検証する
  const page = parsePage(req.query.page)
  if (page === null) {
    sendErrors(res, 400, [error('page', 'ページ番号は1以上の整数で指定してください')])
    return
  }

  // PrismaでDBのTopicテーブルからデータを取得する
  const topics = await prisma.topic.findMany({
    where: { deletedAt: null },
    orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    include: { author: { select: { name: true, email: true } } },
  })
  // forum.yamlに定義されたJSON形式に変換して返す
  res.status(200).json({
    topics: topics.map(topic => ({
      id: topic.id,
      title: topic.title,
      author: topic.author.name || topic.author.email,
      created_at: topic.createdAt.toISOString(),
      updated_at: topic.updatedAt.toISOString(),
    })),
  })
})

// =====================================================
// ③ トピックの新規作成
// =====================================================
// POST /api/topic/create
// トピックのタイトルと、最初のメッセージを同時に登録する
router.post('/create', async (req, res) => {
  // 受け取ったJSONを検証する（タイトル最大256文字・本文最大512文字）
  const body = isRecord(req.body) ? req.body : {}
  const title = validateText(body.title, 'title', 256, 'タイトル')
  const message = validateText(body.message, 'message', 512, 'メッセージ')
  const errors = [...title.errors, ...message.errors]
  if (errors.length) {
    sendErrors(res, 400, errors)
    return
  }
  // ログイン中のユーザーIDを作成者IDとして使用
  const userId = req.session.userId!

  // トピック作成と初回投稿を、1つのトランザクションとして実行する
  // 片方だけ保存される状態を防ぐ
  const topic = await prisma.$transaction(async tx => {
    const created = await tx.topic.create({
      data: { title: title.value!, authorId: userId },
      select: { id: true, title: true },
    })
    await tx.post.create({
      data: { topicId: created.id, contributorId: userId, message: message.value! },
    })
    return created
  })
  res.status(201).json(topic)
})

// =====================================================
// ④ トピック内のメッセージ取得・投稿
// =====================================================
// 【メッセージ一覧の取得】GET /api/topic/{topic_id}?page=1
router.get('/:topic_id', async (req, res) => {
  // URLに指定されたトピックIDがUUID形式か確認
  const topicId = req.params.topic_id
  if (!isUuid(topicId)) {
    notFound(res)
    return
  }
  const page = parsePage(req.query.page)
  if (page === null) {
    sendErrors(res, 400, [error('page', 'ページ番号は1以上の整数で指定してください')])
    return
  }

  // Topicと、それに関連付くPost（未削除のみ）を取得
  const topic = await prisma.topic.findFirst({
    where: { id: topicId, deletedAt: null },
    include: {
      posts: {
        where: { deletedAt: null },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        include: {
          contributor: { select: { id: true, name: true, email: true } },
        },
      },
    },
  })
  if (!topic) {
    notFound(res)
    return
  }

  res.status(200).json({
    id: topic.id,
    title: topic.title,
    last_update: topic.updatedAt.toISOString(),
    // 投稿者名・本文・日時を含むメッセージ配列
    posts: topic.posts.map(post => ({
      id: post.id,
      contributor: {
        id: post.contributor.id,
        name: post.contributor.name || post.contributor.email,
      },
      message: post.message,
      created_at: post.createdAt.toISOString(),
      updated_at: post.updatedAt.toISOString(),
    })),
  })
})

// 【メッセージの投稿】POST /api/topic/{topic_id}
// 返信を保存すると同時にトピックのupdatedAtを更新（スレッド浮上）
router.post('/:topic_id', async (req, res) => {
  const topicId = req.params.topic_id
  if (!isUuid(topicId)) {
    notFound(res)
    return
  }
  // メッセージが空でないか、512文字以内か検証する
  const body = isRecord(req.body) ? req.body : {}
  const message = validateText(body.message, 'message', 512, 'メッセージ')
  if (message.errors.length) {
    sendErrors(res, 400, message.errors)
    return
  }

  const updated = await prisma.$transaction(async tx => {
    // 返信保存と浮上日時更新を、どちらも成功／どちらも取消にする
    const bumped = await tx.topic.updateMany({
      where: { id: topicId, deletedAt: null },
      data: { updatedAt: new Date() },
    })
    if (bumped.count === 0) return false
    await tx.post.create({
      data: {
        topicId,
        contributorId: req.session.userId!,
        message: message.value!,
      },
    })
    return true
  })
  if (!updated) {
    notFound(res)
    return
  }
  res.status(200).json({ message: 'OK' })
})

// =====================================================
// ⑤ トピックのタイトル変更・削除
// =====================================================
// 【タイトル変更】PUT /api/topic/{topic_id}
// トピック作成者本人のみ変更できる
router.put('/:topic_id', async (req, res) => {
  const topicId = req.params.topic_id
  if (!isUuid(topicId)) {
    notFound(res)
    return
  }
  const topic = await prisma.topic.findFirst({
    where: { id: topicId, deletedAt: null },
    select: { authorId: true },
  })
  if (!topic) {
    notFound(res)
    return
  }
  // 作成者IDとログイン中のIDが違えば403 Forbidden
  if (topic.authorId !== req.session.userId) {
    forbidden(res)
    return
  }
  // 変更するタイトルが空文字でないか、256文字以内か検証する
  const body = isRecord(req.body) ? req.body : {}
  const title = validateText(body.title, 'title', 256, 'タイトル')
  if (title.errors.length) {
    sendErrors(res, 400, title.errors)
    return
  }
  const updated = await prisma.topic.updateMany({
    where: { id: topicId, authorId: req.session.userId!, deletedAt: null },
    data: { title: title.value!, updatedAt: new Date() },
  })
  if (updated.count === 0) {
    notFound(res)
    return
  }
  res.status(200).json({ message: 'OK' })
})

// 【トピック削除】DELETE /api/topic/{topic_id}
// トピック作成者本人のみ削除できる
router.delete('/:topic_id', async (req, res) => {
  const topicId = req.params.topic_id
  if (!isUuid(topicId)) {
    notFound(res)
    return
  }
  const topic = await prisma.topic.findFirst({
    where: { id: topicId, deletedAt: null },
    select: { authorId: true },
  })
  if (!topic) {
    notFound(res)
    return
  }
  // 作成者IDとログイン中のIDが違えば403 Forbidden
  if (topic.authorId !== req.session.userId) {
    forbidden(res)
    return
  }
  // DB上から物理削除せず、deletedAtに日時を記録（論理削除）
  const deleted = await prisma.topic.updateMany({
    where: { id: topicId, authorId: req.session.userId!, deletedAt: null },
    data: { deletedAt: new Date() },
  })
  if (deleted.count === 0) {
    notFound(res)
    return
  }
  res.status(200).json({ message: 'deleted' })
})

export default router
