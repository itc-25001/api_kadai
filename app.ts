import express from 'express'
import session from 'express-session'
import type { ErrorRequestHandler } from 'express'
import userRouter from './src/routes/user'
import topicRouter from './src/routes/topic'
import postRouter from './src/routes/post'
import { prisma } from './src/lib/db'
import { isUuid } from './src/lib/http'

const sessionSecret = process.env.SESSION_SECRET
if (!sessionSecret || sessionSecret.length < 32) {
  throw new Error('SESSION_SECRET に32文字以上の値を設定してください。')
}

const app = express()
app.use(express.static('public'))
app.set('view engine', 'pug')
app.set('views', './views')
app.disable('x-powered-by')
app.use(express.json({ limit: '20kb' }))

app.use(session({
  name: 'forum.sid',
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 1000,
  },
}))

app.get('/', (_req, res) => {
  res.render('index', {
    title: 'フォーラムシステム'
  })
})
app.get('/topics', (_req, res) => {
  res.render('topics', {
    title: 'トピック一覧'
  })
})

app.get('/topics/:topic_id', async (req, res) => {
  const userId = req.session.userId
  const topicId = req.params.topic_id

  if (!userId) {
    res.redirect('/')
    return
  }

  if (!isUuid(topicId)) {
    res.status(404).send('トピックが見つかりません')
    return
  }

  const topic = await prisma.topic.findFirst({
    where: {
      id: topicId,
      deletedAt: null
    }
  })

  res.render('topic', {
    title: 'トピック詳細',
    canEditTopic: topic?.authorId === userId,
    currentUserId: userId
  })
})


app.use('/api/user', userRouter)
app.use('/api/topic', topicRouter)
app.use('/api/post', postRouter)

// APIはHTML/リダイレクトではなくJSONを返す。
app.use((_req, res) => {
  res.status(404).json({ errors: [{ name: 'route', reason: 'APIが見つかりません' }] })
})

const errorHandler: ErrorRequestHandler = (err: unknown, _req, res, _next) => {
  const badJson = err instanceof SyntaxError
    && typeof err === 'object' && err !== null && 'body' in err
  if (badJson) {
    res.status(400).json({ errors: [{ name: 'body', reason: 'JSONの形式が正しくありません' }] })
    return
  }
  console.error('APIエラー:', err)
  res.status(500).json({ errors: [{ name: 'server', reason: 'サーバー内部でエラーが発生しました' }] })
}
app.use(errorHandler)

const port = Number(process.env.PORT || 3000)
app.listen(port, () => {
  console.log(`Forum REST API: http://localhost:${port}/api`)
})
