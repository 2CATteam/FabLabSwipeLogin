//Require stack
const express = require('express')
const app = express()
const path = require('path')
const cookieParser = require('cookie-parser')
const WS = require('ws')
const port = 4000
const favicon = require('serve-favicon');
const {v4: uuidv4} = require('uuid')
var instances = require("./lib/instances.js")
const passwords = require("./lib/passwords.js")
const dbTools = require("./lib/databaseTools.js")

//Enable cookies, static directory, and favicon
app.use(cookieParser());
app.use(express.static(__dirname + '/static'));
app.use(favicon(__dirname + '/static/favicon.ico'));

//Function to get the DB connection for a shop from a login token
function getDBConnection(secret) {
    //Get the name
    let name = getNameFromAuth(secret)
    //Use the name to get or create the db instance
    if (name) {
        if (instances[name].dbConnection) {
            return instances[name].dbConnection
        } else {
            instances[name].dbConnection = new dbTools(instances[name].dbName)
            return instances[name].dbConnection
        }
    }
}

//Function to get the DB connection for a shop from the name of the shop
function getDBConnectionFromName(name) {
    //Use the name to get or create the db instance
    if (name) {
        if (instances[name].dbConnection) {
            return instances[name].dbConnection
        } else {
            instances[name].dbConnection = new dbTools(instances[name].dbName)
            return instances[name].dbConnection
        }
    }
}

//Get the name of the shop from the token
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
    res.sendFile(path.join(__dirname, '/static/guestViewNew.html'))
})

app.get('/guestsTest', (req, res) => {
    res.cookie('shop', 'test')
    res.sendFile(path.join(__dirname, '/static/guestViewNew.html'))
})

app.get('/enroll/:shop', (req, res) => {
    res.cookie('shop', req.params.shop)
    res.sendFile(path.join(__dirname, '/static/enrollView.html'))
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
    //Get the args
    let info = ""
    req.on("data", (chunk) => {
        info += chunk
    })
    req.on('end', async () => {
        try {
            //Parse the args
            let args = JSON.parse(info)
            //For each instance, check if it's the right username and password
            for (let i in instances) {
                if (args.username == passwords[i].username && args.password == passwords[i].password) {
                    //If this is the right place, make a token and save it to the server as well as the client's cookies.
                    if (!instances[i].tokens) {
                        instances[i].tokens = []
                    }
                    let token = uuidv4()
                    instances[i].tokens.push(token)
                    res.cookie('token', token, {maxAge: 86400000 * 14})
                    res.cookie('shop', i, {maxAge: 86400000 * 14})
                    res.writeHead(200)
                    res.end()
                    return
                }
            }
            //If wrong password, send error
            res.writeHead(401, "Incorrect username or password")
            res.end()
        } catch (e) {
            //Error handling
            console.error("Found the following error:")
            console.error(e)
            res.writeHead(400, "Bad request")
            res.end()
        }
    })
})

//Swipe in (not authentication, what was I thinking with this path name...)
app.post('/signin', (req, res) => {
    //Get args
    let info = ""
    req.on("data", (chunk) => {
        info += chunk
    })
    req.on('end', async () => {
        try {
            //Parse args
            let args = JSON.parse(info)
            //If there is no DB, write a 400 error
            let dbConnection = getDBConnectionFromName(req.cookies.shop)
            if (!dbConnection) {
                res.writeHead(400, "Invalid shop")
                res.end()
                return
            }
            //If Swipe request,
            if (args.type == "swipe") {
                try {
                    //Swipe in user and broadcast the change to all clients
                    let toReturn = await dbConnection.userSwipe(args.id)
                    broadcastGuest(req.cookies.shop, args.id)
                    //Respond
                    res.writeHead(200, { 'Content-Type': 'application/json' })
                    res.end(JSON.stringify({ status: "success", message: toReturn ? "Hello!" : "Goodbye!" }))
                    //Chech this instance's certifications
                    checkCertsForInstance(req.cookies.shop)
                } catch (e) {
                    //If the user dne, tell them to register
                    if (e.message == "New user") {
                        res.writeHead(202, { 'Content-Type': 'application/json' })
                        res.end(JSON.stringify({ status: 'error', message: 'Register' }))
                    } else {
                        //If the request fails, send a 400 error
                        console.error(e)
                        res.writeHead(400, { 'Content-Type': 'application/json' })
                        res.end(JSON.stringify({ status: "error", message: e.toString() }))
                    }
                }
            //If they're trying to register
            } else if (args.type == "register") {
                try {
                    //Make the user and broadcast it
                    await dbConnection.createUser(args.id, args.name, args.email, args.signin ?? true)
                    broadcastGuest(req.cookies.shop, args.id)
                    //Send 200
                    res.writeHead(200, { 'Content-Type': 'application/json' })
                    res.end(JSON.stringify({ status: "success", message: "Registered and logged in" }))
                    //Update certs
                    checkCertsForInstance(req.cookies.shop)
                } catch (e) {
                    //Error handling
                    console.error(e)
                    res.writeHead(400, { 'Content-Type': 'application/json' })
                    res.end(JSON.stringify({ status: "error", message: e.toString() }))
                }
            }
        } catch (e) {
            //Error handling
            console.error("Caught the following error:")
            console.error(e)
            res.writeHead(400, "Bad Request")
            res.end()
        }
    })
})

//Get information on user
app.post('/guest', (req, res) => {
    //Get args
    let info = ""
    req.on("data", (chunk) => {
        info += chunk
    })
    req.on('end', async () => {
        try {
            //Parse args, get db
            let args = JSON.parse(info)
            let dbConnection = getDBConnectionFromName(req.cookies.shop)
            if (!dbConnection) {
                res.writeHead(400, "Invalid credentials")
                res.end()
                return
            }
            //Get the guest information and send it
            let guest = await dbConnection.getUser(args.user)
            guest.history = await dbConnection.getHistory(args.user)
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify(guest))
        } catch (e) {
            console.error("Caught the following error:")
            console.error(e)
            res.writeHead(400, "Bad Request")
            res.end()
        }
    })
})

//Run the HTTP server
const server = app.listen(port)

//Create the Websocket server
var WSS = new WS.Server({server: server, path: "/staffWS"})

//When a socket connects
WSS.on('connection', async function(ws) {
    //Client message handling
    ws.on('message', async function(message) {
        //Parse the arguments, throwing an error if failed
        let args = {}
        try {
            args = JSON.parse(message)
        } catch (e) {
            console.error(e)
            console.error(message)
        }
        //If there's no token or there's an invalid secret
        if (!getNameFromAuth(ws.secret)) {
            //If the token in the arguments is set and valid, set it on the client object too
            if (args.secret && getNameFromAuth(args.secret)) {
                ws.secret = args.secret
                onAuth(ws)
            }
            return
        }
        //Get the database connectiong from the token
        let dbConnection = getDBConnection(ws.secret)
        //Act differently based on the type of message
        switch (args.type) {
            //Swipe in a guest
            case "swipe":
                await dbConnection.userSwipe(args.id)
                //Broadcast that the guest is here
                broadcastGuest(getNameFromAuth(ws.secret), args.id)
                break
            //Add a certification
            case "addCert":
                await dbConnection.addCert(args.id, args.cert, args.reason)
                //Broadcast the updated guest info
                broadcastGuest(getNameFromAuth(ws.secret), args.id)
                break
            //Revoke a certification
            case "revokeCert":
                await dbConnection.removeCert(args.id, args.cert, args.reason)
                //Broadcast the updated guest info
                broadcastGuest(getNameFromAuth(ws.secret), args.id)
                break
            //Add a note about a user
            case "note":
                await dbConnection.makeNote(args.id, args.level, args.note)
                //Broadcast the new history
                broadcastGuest(getNameFromAuth(ws.secret), args.id)
                break
            //Resolve a history item
            case "resolve":
                await dbConnection.resolve(args.id)
                //Broadcast the updated guest history
                broadcastGuest(getNameFromAuth(ws.secret), args.user)
                break
            //Add a task to be done and broadcast the updated task list
            case "addTask":
                await dbConnection.createTask(args.name, args.description, args.period, args.date)
                broadcastTasks(getNameFromAuth(ws.secret))
                break
            //Mark a task to be done and broadcast the updates task list
            case "doTask":
                await dbConnection.doTask(args.id, args.date)
                broadcastTasks(getNameFromAuth(ws.secret))
                break
        }
    })
})

//First thing that's done when a new client connects and authenticats
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

//Broadcast a guest's information to all clients for a given shop
async function broadcastGuest(name, id) {
    //Get the database connection and the surface-level user data
    let dbConnection = getDBConnectionFromName(name)
    let userData = await dbConnection.getUser(id)
    let toSend = {
        type: "guest",
        user: id,
        data: userData
    }
    //Send to every client
    WSS.clients.forEach((client) => {
        if (client.readyState === WS.OPEN && getNameFromAuth(client.secret) == name) {
            client.send(JSON.stringify(toSend))
        }
    })
    //Get the history data for the user
    let historyData = await dbConnection.getHistory(id)
    toSend = {
        type: "history",
        user: id,
        data: historyData
    }
    //Send to every client
    WSS.clients.forEach((client) => {
        if (client.readyState === WS.OPEN && getNameFromAuth(client.secret) == name) {
            client.send(JSON.stringify(toSend))
        }
    })
}

//Broadcast all the tasks to each relevant client
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

//Check the certifications for every user currently signed in across every shop. Called periodically, as described at the bottom of this program
function checkCerts() {
    //For each shop
    for (let i in instances) {
        console.log("Checking certifications for instance", i)
        //Get the database connection, and check certifications for it
        getDBConnectionFromName(i).checkCerts(instances[i].certs).then(async (changed) => {
            //If there was a change, broadcast the new shallow user data
            if (changed) {
                console.log("Broadcasting that there was a change")
                let status = await getDBConnectionFromName(i).getStatus()
                let toSend = {
                    type: "guestList",
                    data: status
                }
                WSS.clients.forEach((client) => {
                    if (client.readyState === WS.OPEN && getNameFromAuth(client.secret) == i) {
                        client.send(JSON.stringify(toSend))
                    }
                })
            }
        }).catch(console.error)
    }
}

//Check the certifications for a specific instance. Called whenever someone signs in. Same as the inner loop from above.
function checkCertsForInstance(i) {
    console.log("Checking certifications for instance", i)
    getDBConnectionFromName(i).checkCerts(instances[i].certs).then(async (changed) => {
        if (changed) {
            console.log("Broadcasting that there was a change")
            let status = await getDBConnectionFromName(i).getStatus()
            let toSend = {
                type: "guestList",
                data: status
            }
            WSS.clients.forEach((client) => {
                if (client.readyState === WS.OPEN && getNameFromAuth(client.secret) == i) {
                    client.send(JSON.stringify(toSend))
                }
            })
        }
    }).catch(console.error)
}

//Check certifications every now and then
setInterval(checkCerts, 5 * 60 * 1000)

//Say that you're up
console.log(`Listening on port ${port}!`)
