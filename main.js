const express = require('express')
const app = express()
const path = require('path')
const https = require('https')
const cookieParser = require('cookie-parser')
const url = require('url')
const WS = require('ws')
const port = 3000
var favicon = require('serve-favicon');
const e = require('express')

app.use(cookieParser());
app.use(express.static(__dirname + '/views'));
app.use(favicon(__dirname + '/views/favicon.ico'));

var dbConnection = new (require("./lib/databaseTools.js"))("./users.db")

//User information
//Store everything in database
//Websocket for sending information
//Normal requests from client

//Static HTML pages
app.get('/guests', (req, res) => {
    res.sendFile(path.join(__dirname, '/views/guestView.html'))
})

app.get('/staff', (req, res) => {
    res.sendFile(path.join(__dirname, '/views/staffView.html'))
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
                    res.writeHead(401, { 'Content-Type': 'application/json' })
                    res.end(JSON.stringify({ status: 'error', message: 'Register' }))
                } else {
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
                res.writeHead(400, { 'Content-Type': 'application/json' })
                res.end(JSON.stringify({ status: "error", message: e.toString() }))
            }
        }
    })
})

const server = app.listen(port)

var WSS = new WS.WebSocketServer({server: server, path: "/staffWS"})

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
        }
    })

    let status = await dbConnection.getStatus()
    ws.send(JSON.stringify(status))
    for (var i in status) {
        ws.send(JSON.stringify(await dbConnection.getHistory(status[i].getStatus())))
    }
})

async function broadcastGuest(id) {
    let userData = await dbConnection.getUser(id)
    WSS.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(userData))
        }
    })
    let historyData = await dbConnection.getHistory()
    WSS.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(historyData))
        }
    })
}