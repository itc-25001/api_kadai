/**
 * API動作確認スクリプト。実行するとテスト用ユーザーと投稿がDBに作成されます。
 * 先に bun run dev でサーバーを起動してください。
 */
const base = process.env.API_URL || 'http://localhost:3000/api'
let cookie = ''

type ApiResult = { status: number; data: any }
async function api(method: string, path: string, body?: object, authenticated = true): Promise<ApiResult> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (authenticated && cookie) headers.Cookie = cookie
  const response = await fetch(base + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: 'manual',
  })
  const setCookie = response.headers.get('set-cookie')
  if (setCookie && authenticated) cookie = setCookie.split(';')[0]
  let data: any
  try {
    data = await response.json()
  } catch {
    throw new Error(`${method} ${path}: JSON以外のレスポンス (${response.status})`)
  }
  return { status: response.status, data }
}

function verify(name: string, result: ApiResult, expected: number) {
  if (result.status !== expected) {
    throw new Error(`${name}: HTTP ${result.status} / expected ${expected}\n${JSON.stringify(result.data, null, 2)}`)
  }
  console.log(`✓ ${name} (${result.status})`)
}

function requireValue<T>(condition: T, reason: string): asserts condition is NonNullable<T> {
  if (!condition) throw new Error(reason)
}

const suffix = Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
const owner = `owner-${suffix}@example.com`
const guest = `guest-${suffix}@example.com`
const originalPassword = 'password1234'
const changedPassword = 'password5678'

async function main() {
  const noAuth = await api('GET', '/topic', undefined, false)
  verify('未ログインでは401', noAuth, 401)

  verify('ユーザー登録', await api('POST', '/user/register', {
    email: owner, password: originalPassword, name: 'Taro',
  }), 200)
  verify('パスワード誤りは401', await api('POST', '/user/login', {
    email: owner, password: 'wrongpassword',
  }), 401)
  verify('ログイン', await api('POST', '/user/login', {
    email: owner, password: originalPassword,
  }), 200)
  requireValue(cookie, 'ログインセッションCookieが発行されていません')
  const ownerCookie = cookie

  const created = await api('POST', '/topic/create', {
    title: 'Javaの質問', message: '最初のメッセージ',
  })
  verify('トピック作成', created, 201)
  const topicId = created.data.id as string
  requireValue(topicId, '作成結果にIDがありません')

  const second = await api('POST', '/topic/create', {
    title: 'Reactの質問', message: '別のスレッド',
  })
  verify('別のトピック作成', second, 201)

  const detail = await api('GET', `/topic/${topicId}`)
  verify('メッセージ一覧', detail, 200)
  requireValue(detail.data.posts?.length === 1, '最初のメッセージが見つかりません')

  verify('返信の投稿', await api('POST', `/topic/${topicId}`, {
    message: '追加の返信',
  }), 200)

  const floated = await api('GET', '/topic?page=1')
  verify('トピック一覧', floated, 200)
  requireValue(floated.data.topics?.[0]?.id === topicId, '返信したトピックが先頭に浮上していません')
  console.log('✓ スレッドフロート（新規返信で先頭へ移動）')

  const posts = await api('GET', `/topic/${topicId}`)
  verify('追加後のメッセージ取得', posts, 200)
  const replyId = posts.data.posts.find((post: any) => post.message === '追加の返信')?.id as string | undefined
  requireValue(replyId, '追加した返信が見つかりません')

  // 他人が変更しようとすると403になることを確かめる。
  verify('別ユーザー登録', await api('POST', '/user/register', {
    email: guest, password: originalPassword, name: 'Hanako',
  }), 200)
  cookie = ''
  verify('別ユーザーログイン', await api('POST', '/user/login', {
    email: guest, password: originalPassword,
  }), 200)
  verify('他人のトピック編集は403', await api('PUT', `/topic/${topicId}`, {
    title: '不正な書き換え',
  }), 403)
  verify('他人の投稿削除は403', await api('DELETE', `/post/${replyId}`), 403)

  cookie = ownerCookie
  verify('トピックタイトル編集', await api('PUT', `/topic/${topicId}`, {
    title: 'Javaの質問（編集済み）',
  }), 200)
  verify('投稿編集', await api('PUT', `/post/${replyId}`, {
    message: '返信の内容を編集しました',
  }), 200)
  verify('投稿論理削除', await api('DELETE', `/post/${replyId}`), 200)
  const afterDelete = await api('GET', `/topic/${topicId}`)
  verify('削除後のメッセージ一覧', afterDelete, 200)
  requireValue(!afterDelete.data.posts.some((post: any) => post.id === replyId), '削除済み投稿が表示されています')

  verify('名前・パスワード変更', await api('PUT', '/user/change', {
    name: 'NewTaro', password: changedPassword,
  }), 200)
  verify('ログアウト', await api('POST', '/user/logout'), 200)
  cookie = ''
  verify('ログアウト後は401', await api('GET', '/topic'), 401)
  verify('新パスワードでログイン', await api('POST', '/user/login', {
    email: owner, password: changedPassword,
  }), 200)
  verify('トピック論理削除', await api('DELETE', `/topic/${topicId}`), 200)
  verify('削除済みトピックは404', await api('GET', `/topic/${topicId}`), 404)
  console.log('\nすべてのAPIテストに成功しました。')
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
