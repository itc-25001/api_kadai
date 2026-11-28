
import { prisma } from '../src/lib/db'
import argon2 from 'argon2'

// Argon2idのパラメータ
const argon2Options: argon2.HashOptions = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
}

// ユーザーの初期（ダミー）データ
const dummyUser = [
  {
    email: 'oda@example.com',
    password: 'oda00623',
    name: 'Nobunaga'
  },
  {
    email: 'hashiba@example.com',
    password: 'hashiba317',
    name: 'Hideyoshi'
  },
  {
    email: 'matsudaira@example.com',
    password: 'matsudaira131',
    name: 'Motoyasu'
  },
]

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('本番環境では実行できません')
  }

  for (const user of dummyUser) {
    const password = await argon2.hash(
      user.password,
      argon2Options
    )

    await prisma.user.upsert({
      where: {
        email: user.email
      },
      update: {
        password,
        name: user.name,
        deletedAt: null
      },
      create: {
        email: user.email,
        password,
        name: user.name
      }
    })
  }

  console.log('ダミーユーザーを登録しました')
}

main()
  .catch(error => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })