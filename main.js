const express = require('express')
const app = express()
const path = require('path')
const https = require('https')
const cookieParser = require('cookie-parser')
const url = require('url')
const WS = require('ws')
const port = 3000
var favicon = require('serve-favicon');
const fs = require('fs')

app.use(cookieParser());
app.use(express.static(__dirname + '/static'));
app.use(favicon(__dirname + '/static/favicon.ico'));

const dbPath = "./users.db"
let dbConnection = null
try {
    if (fs.existsSync(dbPath)) {
        dbConnection = new (require("./lib/databaseTools.js"))(dbPath)
    } else {
        dbConnection = new (require("./lib/databaseTools.js"))(dbPath)
        dbConnection.createDatabase()
    }
} catch (e) {
    console.error(e)
}

//Static HTML pages
app.get('/guests', (req, res) => {
    res.sendFile(path.join(__dirname, '/static/guestView.html'))
})

app.get('/staff', (req, res) => {
    res.sendFile(path.join(__dirname, '/static/staffView.html'))
})

app.post('/signin', (req, res) => {
    let info = ""
    req.on("data", (chunk) => {
        info += chunk
    })
    req.on('end', async () => {
        let args = JSON.parse(info)
        if (args.type == "swipe") {
            try {
                let toReturn = await dbConnection.userSwipe(args.id)
                broadcastGuest(args.id)
                res.writeHead(200, { 'Content-Type': 'application/json' })
                res.end(JSON.stringify({ status: "success", message: toReturn ? "Hello!" : "Goodbye!" }))
            } catch (e) {
                if (e.message == "New user") {
                    res.writeHead(202, { 'Content-Type': 'application/json' })
                    res.end(JSON.stringify({ status: 'error', message: 'Register' }))
                } else {
                    console.error(e)
                    res.writeHead(400, { 'Content-Type': 'application/json' })
                    res.end(JSON.stringify({ status: "error", message: e.toString() }))
                }
            }
        } else if (args.type == "register") {
            try {
                await dbConnection.createUser(args.id, args.name, args.email, true)
                broadcastGuest(args.id)
                res.writeHead(200, { 'Content-Type': 'application/json' })
                res.end(JSON.stringify({ status: "success", message: "Registered and logged in" }))
            } catch (e) {
                console.error(e)
                res.writeHead(400, { 'Content-Type': 'application/json' })
                res.end(JSON.stringify({ status: "error", message: e.toString() }))
            }
        }
    })
})

const server = app.listen(port)

var WSS = new WS.Server({server: server, path: "/staffWS"})

WSS.on('connection', async function(ws) {
    ws.on('message', async function(message) {
        let args = JSON.parse(message.data)
        switch (args.type) {
            case "swipe":
                await dbConnection.userSwipe(args.id)
                broadcastGuest(args.id)
                break
            case "addCert":
                await dbConnection.addCert(args.id, args.cert, args.reason)
                broadcastGuest(args.id)
                break
            case "revokeCert":
                await dbConnection.removeCert(args.id, args.cert, args.reason)
                broadcastGuest(args.id)
                break
            case "note":
                await dbConnection.makeNote(args.id, args.type, args.note)
                broadcastGuest(args.id)
                break
            case "addTask":
                await dbConnection.createTask(args.name, args.description, args.period)
                broadcastTasks()
                break
            case "doTask":
                await dbConnection.doTask(args.id)
                broadcastTasks()
                break
        }
    })

    let status = await dbConnection.getStatus()
    let toSend = {
        type: "guestList",
        data: status
    }
    ws.send(JSON.stringify(toSend))
    for (var i in status) {
        let history = await dbConnection.getHistory(status[i].guest_id)
        toSend = {
            type: "history",
            user: status[i].guest_id,
            data: history
        }
        ws.send(JSON.stringify(toSend))
    }
    let tasks = await dbConnection.getTasks()
    toSend = {
        type: "tasks",
        data: tasks
    }
    ws.send(JSON.stringify(toSend))
})

async function broadcastGuest(id) {
    let userData = await dbConnection.getUser(id)
    let toSend = {
        type: "guest",
        user: id,
        data: userData
    }
    WSS.clients.forEach((client) => {
        if (client.readyState === WS.OPEN) {
            client.send(JSON.stringify(toSend))
        }
    })
    if (!userData.here) return
    let historyData = await dbConnection.getHistory(id)
    toSend = {
        type: "history",
        user: id,
        data: historyData
    }
    WSS.clients.forEach((client) => {
        if (client.readyState === WS.OPEN) {
            client.send(JSON.stringify(toSend))
        }
    })
}

async function broadcastTasks() {
    let taskData = await dbConnection.getTasks()
    let toSend = {
        type: "tasks",
        data: taskData
    }
    WSS.clients.forEach((client) => {
        if (client.readyState === WS.OPEN) {
            client.send(JSON.stringify(toSend))
        }
    })
}

console.log(`Listening on port ${port}!`)