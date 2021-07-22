const express = require('express')
const app = express()
const path = require('path')
//const https = require('https')
const cookieParser = require('cookie-parser')
//const url = require('url')
const WS = require('ws')
const port = 4000
const favicon = require('serve-favicon');
const {v4: uuidv4} = require('uuid')
var instances = require("./lib/instances.js")
const passwords = require("./lib/passwords.js")
const dbTools = require("./lib/databaseTools.js")

app.use(cookieParser());
app.use(express.static(__dirname + '/static'));
app.use(favicon(__dirname + '/static/favicon.ico'));

function getDBConnection(secret) {
    let name = getNameFromAuth(secret)
    if (name) {
        if (instances[name].dbConnection) {
            return instances[name].dbConnection
        } else {
            instances[name].dbConnection = new dbTools(instances[name].dbName)
            return instances[name].dbConnection
        }
    }
}

function getDBConnectionFromName(name) {
    if (name) {
        if (instances[name].dbConnection) {
            return instances[name].dbConnection
        } else {
            instances[name].dbConnection = new dbTools(instances[name].dbName)
            return instances[name].dbConnection
        }
    }
}

function getNameFromAuth(secret) {
    for (let i in instances) {
        if (instances[i].tokens?.includes(secret)) {
            return i
        }
    }
    return null
}

//Static HTML pages
app.get('/guests', (req, res) => {
    res.cookie('shop', 'fabLab')
    res.sendFile(path.join(__dirname, '/static/guestView.html'))
})

app.get('/guestsTest', (req, res) => {
    res.cookie('shop', 'test')
    res.sendFile(path.join(__dirname, '/static/guestView.html'))
})

app.get('/staff', (req, res) => {
    for (let i in instances) {
        if (instances[i].tokens?.includes(req.cookies?.token)) {
            res.sendFile(path.join(__dirname, '/static/staffView.html'))
            return
        }
    }
    res.sendFile(path.join(__dirname, '/static/loginView.html'))
})

//Authentication
app.post('/auth', (req, res) => {
    let info = ""
    req.on("data", (chunk) => {
        info += chunk
    })
    req.on('end', async () => {
        let args = JSON.parse(info)
        for (let i in instances) {
            if (args.username == passwords[i].username && args.password == passwords[i].password) {
                if (!instances[i].tokens) {
                    instances[i].tokens = []
                }
                let token = uuidv4()
                instances[i].tokens.push(token)
                res.cookie('token', token, {maxAge: 86400000 * 14})
                res.writeHead(200)
                res.end()
                return
            }
        }
        res.writeHead(401, "Incorrect username or password")
        res.end()
    })
})

//Swipe in (not authentication, what was I thinking)
app.post('/signin', (req, res) => {
    let info = ""
    req.on("data", (chunk) => {
        info += chunk
    })
    req.on('end', async () => {
        let args = JSON.parse(info)
        let dbConnection = getDBConnectionFromName(req.cookies.shop)
        if (!dbConnection) {
            res.writeHead(400, "Invalid shop")
            return
        }
        if (args.type == "swipe") {
            try {
                let toReturn = await dbConnection.userSwipe(args.id)
                broadcastGuest(req.cookies.shop, args.id)
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
                broadcastGuest(req.cookies.shop, args.id)
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
        let args = {}
        try {
            args = JSON.parse(message)
        } catch (e) {
            console.error(e)
            console.error(message)
        }
        if (!getNameFromAuth(ws.secret)) {
            if (args.secret && getNameFromAuth(args.secret)) {
                ws.secret = args.secret
                onAuth(ws)
            }
            return
        }
        let dbConnection = getDBConnection(ws.secret)
        switch (args.type) {
            case "swipe":
                await dbConnection.userSwipe(args.id)
                broadcastGuest(getNameFromAuth(ws.secret), args.id)
                break
            case "addCert":
                await dbConnection.addCert(args.id, args.cert, args.reason)
                broadcastGuest(getNameFromAuth(ws.secret), args.id)
                break
            case "revokeCert":
                await dbConnection.removeCert(args.id, args.cert, args.reason)
                broadcastGuest(getNameFromAuth(ws.secret), args.id)
                break
            case "note":
                await dbConnection.makeNote(args.id, args.level, args.note)
                broadcastGuest(getNameFromAuth(ws.secret), args.id)
                break
            case "resolve":
                await dbConnection.resolve(args.id)
                broadcastGuest(getNameFromAuth(ws.secret), args.user)
                break
            case "addTask":
                await dbConnection.createTask(args.name, args.description, args.period, args.date)
                broadcastTasks(getNameFromAuth(ws.secret))
                break
            case "doTask":
                await dbConnection.doTask(args.id, args.date)
                broadcastTasks(getNameFromAuth(ws.secret))
                break
        }
    })

    
})

async function onAuth(ws) {
    //Send certs information
    let toSend = {
        type: "certs",
        data: instances[getNameFromAuth(ws.secret)]?.certs
    }
    ws.send(JSON.stringify(toSend))
    let dbConnection = getDBConnection(ws.secret)

    //Send information on who's currently here
    let status = await dbConnection.getStatus()
    toSend = {
        type: "guestList",
        data: status
    }
    ws.send(JSON.stringify(toSend))

    //Send history information for each user
    for (var i in status) {
        let history = await dbConnection.getHistory(status[i].guest_id)
        toSend = {
            type: "history",
            user: status[i].guest_id,
            data: history
        }
        ws.send(JSON.stringify(toSend))
    }

    //Send information on what tasks need to be completed
    let tasks = await dbConnection.getTasks()
    toSend = {
        type: "tasks",
        data: tasks
    }
    ws.send(JSON.stringify(toSend))
}

async function broadcastGuest(name, id) {
    let dbConnection = getDBConnectionFromName(name)
    let userData = await dbConnection.getUser(id)
    let toSend = {
        type: "guest",
        user: id,
        data: userData
    }
    WSS.clients.forEach((client) => {
        if (client.readyState === WS.OPEN && getNameFromAuth(client.secret) == name) {
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
        if (client.readyState === WS.OPEN && getNameFromAuth(client.secret) == name) {
            client.send(JSON.stringify(toSend))
        }
    })
}

async function broadcastTasks(name) {
    let dbConnection = getDBConnectionFromName(name)
    let taskData = await dbConnection.getTasks()
    let toSend = {
        type: "tasks",
        data: taskData
    }
    WSS.clients.forEach((client) => {
        if (client.readyState === WS.OPEN && getNameFromAuth(client.secret) == name) {
            client.send(JSON.stringify(toSend))
        }
    })
}

console.log(`Listening on port ${port}!`)
