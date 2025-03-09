import WebSocket, { WebSocketServer } from "ws"
import { db } from "./db"
import * as util from "node:util";
import {generateGUID} from "./utils";

const SESSIONIZER_PORT = 8080
const IPS = db.map(r => r.ip)
const IPS_WITH_NO_MAPPINGS = [
  "1.53.143.220",
  "225.87.133.58",
  "4d1d:fc13:f032:69f7:c3e9:d488:342d:9eba",
  "b3b0:7f4b:36c8:f788:830d:f2fb:5fd5:397a",
  "110.178.96.87"
]

const clients: Set<WebSocket> = new Set()
const activeSessions = new Set<string>()

export type EventType = "session-opened" | "session-closed"

export type Message = {
  eventType: EventType
  ip: string,
  guid: string,
  timestamp: string
}

const setTimeoutP = util.promisify(setTimeout)

function sendSessionOpenedMsg(ip: string, guid: string = generateGUID()): string {
  const sessionOpened: Message = {
    eventType: "session-opened",
    ip,
    guid,
    timestamp: new Date().toISOString()
  }
  const jsonString = JSON.stringify(sessionOpened)
  clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(jsonString)
    }
  })
  return guid
}

function getInActiveIP(): string {
  let ip = ""
  while (true) {
    ip = IPS[Math.floor(Math.random() * IPS.length)]
    if (! activeSessions.has(ip)) return ip
  }
}

async function simulateSessionTime(): Promise<void> {
  // session duration: 0-30 seconds
  const sessionDuration = Math.floor(Math.random() * 30 * 1000)
  await setTimeoutP(sessionDuration)
}

async function sessionOpenCloseNormal(ip: string = getInActiveIP()): Promise<void> {
  activeSessions.add(ip)
  const guid = sendSessionOpenedMsg(ip)
  await simulateSessionTime()
  sendSessionClosedMsg(guid, ip)
  activeSessions.delete(ip)
}

async function sessionOpenOpenClosePathology(): Promise<void> {
  const ip = getInActiveIP()
  activeSessions.add(ip)
  const guid = sendSessionOpenedMsg(ip)
  sendSessionOpenedMsg(ip, guid)
  await simulateSessionTime()
  sendSessionClosedMsg(guid, ip)
  activeSessions.delete(ip)
}

async function sessionOpenCloseClosePathology(): Promise<void> {
  const ip = getInActiveIP()
  activeSessions.add(ip)
  const guid = sendSessionOpenedMsg(ip)
  await simulateSessionTime()
  sendSessionClosedMsg(guid, ip)
  sendSessionClosedMsg(guid, ip)
  activeSessions.delete(ip)
}

async function sessionOpenNoClosePathology(): Promise<void> {
  const ip = getInActiveIP()
  activeSessions.add(ip)
  sendSessionOpenedMsg(ip)
  await setTimeoutP(3 * 60 * 1000) // make the session inactive after 3 minutes
  activeSessions.delete(ip)
}

async function sessionNoOpenOnlyClosePathology(): Promise<void> {
  const ip = getInActiveIP()
  const guid = generateGUID()
  sendSessionClosedMsg(guid, ip)
}

async function sessionNoIpMappingPathology(): Promise<void> {
  const inactive = IPS_WITH_NO_MAPPINGS.filter(i => !activeSessions.has(i))
  if (inactive.length === 0) return

  const ip = inactive[Math.random() * inactive.length]
  sessionOpenCloseNormal(ip)
}

async function nextTick(): Promise<void> {
  const rand = Math.random()
  if (rand <= 0.5) {
    sessionOpenCloseNormal()
  } else if (rand <= 0.6) {
    sessionOpenOpenClosePathology()
  } else if (rand <= 0.7) {
    sessionOpenCloseClosePathology()
  } else if (rand <= 0.8) {
    sessionOpenNoClosePathology()
  } else if (rand <= 0.9) {
    sessionNoOpenOnlyClosePathology()
  } else {
    sessionNoIpMappingPathology()
  }

  // new visitors arrive between 0-10 seconds
  const nextVisitorInterval = Math.floor(Math.random() * 10 * 1000)
  await setTimeoutP(nextVisitorInterval)

  nextTick()
}

function sendSessionClosedMsg(guid: string, ip: string): void {
  const sessionClosed: Message = {
    eventType: "session-closed",
    ip,
    guid,
    timestamp: new Date().toISOString()
  }
  const jsonString = JSON.stringify(sessionClosed)
  clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(jsonString)
    }
  })
}

function start(): void {
  const wss = new WebSocketServer({ port: SESSIONIZER_PORT })
  console.log(`Sessionizer server running on ws://localhost:${SESSIONIZER_PORT}`)

  wss.on("connection", (ws) => {
    console.log("New client connected")
    clients.add(ws)

    ws.on("close", () => {
      console.log("Client disconnected")
      clients.delete(ws)
    })
  })

  nextTick()
}


start()

