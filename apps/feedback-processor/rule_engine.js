'use strict'

/*
  This module requires proper test cases and a spec. for rules schema.
  Currently an ad-hoc schema is used for PoC, available in rules.yml

  The matching, transform and action functions need unit testing
*/

const fs = require('fs')
const path = require('path')
const _ = require('lodash')

const YAML = require('yaml')
const jsonpath = require('jsonpath')

// TODO: Move this to an init function to make this module testable
const RULES = YAML.parse(fs.readFileSync(path.resolve(__dirname, "rules.yml")).toString())

/*
  Here we match all keys under rule.match against corresponding regex values
  against message. Refer to rules.yaml for example match rule
*/
function applyMatch(rule, message, data) {
  let matcher = rule.match
  let isMatch = (Object.keys(matcher).length > 0)

  for(let [ruleKey, ruleValue] of Object.entries(matcher)) {
    let mValue = _.get(message, ruleKey, '')
    isMatch = isMatch && (ruleValue && mValue && (new RegExp(ruleValue).test(mValue)))
  }

  return isMatch
}

function applyTransform(rule, message, data) {
  let res = []
  let q = _.get(rule, 'transform.jsonpath', '')

  // console.log(`Applying transform rule: ${q}`)

  if (q) {
    res = jsonpath.query(data, q)
  }

  // console.log(`Rule transform generated ${res.length} items`)
  return res
}

// Simplify this!
function applyActionSingleNATS(action, params) {
  return new Promise(async function (resolve, reject) {
    if (action.on === 'item') {
      params.logger.info(`Enqueue Action: Sending ${params.transforms.length} items to ${action.queue_name}`)
      
      for(let i = 0; i < params.transforms.length; i++) {
        await function() { 
          return new Promise(function (resolve, reject) {
            params.nats.publish(action.queue_name, JSON.stringify({
              asset_type: action.asset_type,
              asset_value: params.transforms[i],
              scan_id: params.message.scan_id
            }), function (err) {
              if (err) {
                params.logger.error(`Enqueue Action: Error sending to NATS: ${err}`)
                return reject()
              }

              params.logger.info(`Enqueue Action: [${action.asset_type}:${params.transforms[i]}] sent to NATS topic: ${action.queue_name}`)
              resolve()
            })
          }) 
        }()
      }
    } else if (action.on === 'bulk') {
      // Not handled currently
      params.logger.warn(`Enqueue Action: Bulk input to enqueue action is not supported`)
      resolve()
    }
  })
}

function applyActionSingle(action, params) {
  if (action.type === 'enqueue') {
    return applyActionSingleNATS(action, params)
  }
  else {
    return new Promise(function (resolve, reject) {
      resolve()
    })
  }
}

// Move this to its own module/submodule with actions
function applyActions(params) {
  return new Promise(async function (resolve, reject) {
    let actions = _.get(params.rule, 'actions', [])
    
    for (let i = 0; i < actions.length; i++) {
      await applyActionSingle(actions[i], params)
    }
    
    resolve()
  })
}

function handleMessage (options) {
  let {logger, nats, message, data} = options

  logger.info(`Applying rules on message from scan_id:${message.scan_id}`)

  return new Promise(async function (resolve, reject) {
    for(let i = 0; i < RULES.rules.length; i++) {
      let rule = RULES.rules[i]
      logger.info(`Matching with rule: ${rule.name}`)

      try {
        if (applyMatch (rule, message, data)) {
          logger.info(`Match success with rule: ${rule.name}, applying transforms`)
          let transforms = applyTransform(rule, message, data)

          logger.info(`Trasform rule generated ${transforms.length} item(s) for action(s)`)
          await applyActions({ nats, rule, message, data, transforms, logger })
        }
      } catch (ex) {
        logger.error(`Error matching rule: ${rule.name} Error: ${ex}`)
      }
    }

    resolve()
  })
}

function initRuleEngine(options) {
  options.logger.info(`Rule engine initialized`)
}

module.exports = {
  initRuleEngine,
  handleMessage
}