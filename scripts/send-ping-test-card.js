#!/usr/bin/env node
require('dotenv').config()

const repo = require('../src/repositories')
const { connectMongo } = require('../db/mongo')
const { sendCard } = require('../src/utils/chatSend')

async function main() {
  const deptId = process.argv[2]
  if (!deptId) {
    console.error('Usage: node scripts/send-ping-test-card.js <department-id>')
    process.exit(1)
  }

  if ((process.env.DB_TYPE || 'sqlite').trim() === 'mongodb') {
    await connectMongo()
  }

  const dept = await repo.dept.findById(deptId, { decrypt: true })
  if (!dept) {
    console.error(`Department not found: ${deptId}`)
    process.exit(1)
  }

  const payload = {
    text: 'ping test card',
    cardsV2: [
      {
        cardId: `ping-${Date.now()}`,
        card: {
          header: {
            title: 'Ping Test',
            subtitle: 'Google Chat callback probe'
          },
          sections: [
            {
              widgets: [
                {
                  textParagraph: {
                    text: 'Press the button below. Expected reply: pong from /chat-callback'
                  }
                }
              ]
            },
            {
              widgets: [
                {
                  buttonList: {
                    buttons: [
                      {
                        text: 'Ping',
                        onClick: {
                          action: {
                            function: 'ping_test',
                            parameters: [
                              { key: 'dept_id', value: dept.id }
                            ]
                          }
                        }
                      }
                    ]
                  }
                }
              ]
            }
          ]
        }
      }
    ]
  }

  const result = await sendCard(dept.space_name, dept.chat_webhook_url, payload)
  console.log(JSON.stringify({
    transport: result.transport,
    status: result.response.status,
    message: result.bodyJson?.name || null,
    thread: result.bodyJson?.thread?.name || null
  }, null, 2))
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
