// src/queue/queues.ts
import { Queue } from 'bullmq'
import { redis } from '../config/redis'

const connection = redis

export const articleGenerationQueue = new Queue('article-generation', {
  connection,
  defaultJobOptions: {
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 200 },
  },
})

export const wordpressPostingQueue = new Queue('wordpress-posting', {
  connection,
  defaultJobOptions: {
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 200 },
  },
})

export const scheduledExecutionQueue = new Queue('scheduled-execution', {
  connection,
  defaultJobOptions: {
    removeOnComplete: { count: 50 },
    removeOnFail: { count: 100 },
  },
})
