'use strict'

const NATS = require('nats')
const express = require('express')
const morgan = require('morgan')
const uuid = require('uuid/v4')
const Minio = require('minio')

const app = express()
const bodyParser = require('body-parser')
const port = process.env.NODE_PORT || 3000
const nats_url = process.env.NATS_URL

const minio = new Minio.Client({
  endPoint: process.env.MINIO_ENDPOINT.split(':')[0],
  port: parseInt(process.env.MINIO_ENDPOINT.split(':')[1]),
  useSSL: false,
  accessKey: process.env.MINIO_ACCESS_KEY,
  secretKey: process.env.MINIO_SECRET_KEY
})

const QUEUE_MAPPING = {
  'domain': 'input.domain',
  'host': 'input.host',
  'url': 'input.url'
}

function indexHandler(req, res) {
  res.send("API Service for AppSec Workflow Automation")
}

function listBucketObjects(bucketName, prefix, recursive) {
  return new Promise(function (resolve, reject) {
    let objs = []
    let stream = minio.listObjects(bucketName, prefix, false)

    stream.on('data', function (obj) {
      objs.push(obj)
    })

    stream.on('error', function (err) {
      reject(err)
    })

    stream.on('end', function () {
      resolve(objs)
    })
  })
}

function readBucketObject(bucketName, path) {
  return new Promise(function (resolve, reject) {
    minio.getObject(bucketName, path, function (err, stream) {
      let fileContent = ''
  
      if (err) {
        console.error(`Failed to read object from Minio. Error: ${err}`)
        return reject(err)
      }
  
      stream.on('data', function (chunk) {
        fileContent += chunk
      })
  
      stream.on('error', function (err) {
        console.error(`Error while reading file from Minio: ${err}`)
        return reject(err)
      })
  
      stream.on('end', function () {
        resolve(fileContent)
      })
    })
  })
}

function scanResultHandler(req, res) {
  let scanId = req.params.scan_id
  let bucketName = process.env.MINIO_OUTPUT_BUCKET
  let prefix = `scans/${scanId}/`

  // console.log(`Listing bucket objects on: ${bucketName}`)
  listBucketObjects(bucketName, prefix, false).then(async function (objects) {
    // console.log(`Found ${objects.length} object(s) in ${bucketName}`)
    let response = {}
    for(let i = 0; i < objects.length; i++) {
      let data = await readBucketObject(bucketName, objects[i].name)

      try {
        response[objects[i].name] = JSON.parse(data)
      } catch (err) {
        response[objects[i].name] = data
      }
    }

    res.status(200).json({
      status: 'success',
      response: response
    })
  }).catch(function (err) {
    console.log(`Error occurred: ${err}`)
    res.status(500).json({ status: 'error', error: err })
  })
}

function scanSubmissionHandler(req, res) {
  let scan_params = req.body

  if ((!scan_params) || (!scan_params.asset_type) || (!scan_params.asset_value)) {
    res.status(422).json({ status: 'error', error: 'Input parameters missing' })
    return
  }

  scan_params.scan_id = uuid()

  let topic = QUEUE_MAPPING[scan_params.asset_type]
  if (!topic) {
    res.status(422).json({ status: 'error', error: 'Unsupported asset type' })
    return
  }

  let nats = NATS.connect(nats_url)
  nats.on('error', function (e) {
    res.status(500).json({ error: 'Failed to publish to NATS topic' })
  })

  nats.publish(topic, JSON.stringify(scan_params), function () {
    nats.close()
    res.status(200).json({ status: 'success', response: scan_params })
  })
}

app.use(bodyParser.json())
app.use(morgan('combined'))

app.get('/', indexHandler)
app.get('/scans/:scan_id', scanResultHandler)
app.post('/scans', scanSubmissionHandler)
app.listen(port, () => console.log(`API Service listening on port ${port}!`))


