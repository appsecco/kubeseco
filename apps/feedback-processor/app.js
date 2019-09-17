'use strict'

const NATS_URL = process.env.NATS_URL
const NATS_TOOL_EVENT_QUEUE = process.env.NATS_CONSUMER_TOPIC
const NATS_QUEUE_GROUP_NAME = process.env.NATS_QUEUE_GROUP_NAME || 'Feedback-Processor-1'

// Endpoint is of format - minio.svc.default.local:9000
const MINIO_ENDPOINT = process.env.MINIO_ENDPOINT
const MINIO_ACCESS_KEY = process.env.MINIO_ACCESS_KEY
const MINIO_SECRET_KEY = process.env.MINIO_SECRET_KEY
const MINIO_BUCKET_NAME = process.env.MINIO_OUTPUT_BUCKET

const NATS = require('nats')
const Minio = require('minio')
const winston = require('winston')

const logger = winston.createLogger({
  level: 'info',
  transports: [
    new winston.transports.Console({ format: winston.format.simple() })
  ]
})

const ruleEngine = require('./rule_engine')

function getMinioFileContent(path) {
  let [host, port] = MINIO_ENDPOINT.split(':')
  port = parseInt(port)

  logger.info(`Connecting to Minio ${host}:${port} to fetch: ${path}`)

  var minioClient = new Minio.Client({
    endPoint: host,
    port: port,
    useSSL: false,
    accessKey: MINIO_ACCESS_KEY,
    secretKey: MINIO_SECRET_KEY
  })

  return new Promise(function (resolve, reject) {
    let content = ''

    minioClient.getObject(MINIO_BUCKET_NAME, path, function (err, dataStream) {
      if (err) {
        logger.error(`Error initiating file fetch from mino path:${path} error:${err}`)
        return reject()
      }

      dataStream.on('data', function (chunk) {
        content += chunk
      })

      dataStream.on('end', function () {
        logger.info(`Finished fetching file of size:${content.length} path:${path} from Minio`)
        return resolve(content)
      })

      dataStream.on('error', function (err) {
        logger.error(`Error downloading file from Minio path:${path} error:${err}`)
        reject()
      })
    })
  })
}

function handleMessage(nats, msg) {
  logger.info(`Handling message for scan_id: ${msg.scan_id} tool: ${msg.tool_name}`)

  return new Promise(async function (resolve, reject) {
    if (msg.status === 'Success') {
      let data = await getMinioFileContent(msg.path)
      data = JSON.parse(data)
      
      await ruleEngine.handleMessage({
        logger: logger,
        message: msg,
        nats: nats,
        data: data
      })
    }
    
    resolve()
  })
}

function startFeedbackProcessor() {
  logger.info(`Connecting to NATS with Queue: ${NATS_TOOL_EVENT_QUEUE} Group Name: ${NATS_QUEUE_GROUP_NAME}`)

  const nats = NATS.connect(NATS_URL, { 'maxReconnectAttempts': 5, 'reconnectTimeWait': 5000 })
  nats.on('error', function (e) {
    logger.error(`NATS error has occurred: ${e}`)
  })

  nats.on('disconnect', function (e) {
    logger.error(`NATS disconnected from server`)
  })

  nats.on('reconnect', function (e) {
    logger.error(`NATS server reconnected`)
  })

  nats.on('close', function (e) {
    logger.error(`NATS closed connection with server`)
    process.exit(-1)
  })

  nats.subscribe(NATS_TOOL_EVENT_QUEUE, { queue: NATS_QUEUE_GROUP_NAME }, async function (msg) {
    logger.info(`Received message from NATS: ${msg}`)

    try {
      let iMsg = JSON.parse(msg)
      await handleMessage(nats, iMsg)
    } catch (ex) {
      logger.error(`Failed to process message: ${ex}`)
    }
  })
}

if (process.mainModule.filename === __filename) {
  logger.info('Running feedback processor')

  ruleEngine.initRuleEngine({ logger })
  startFeedbackProcessor()
}
