//Require stack
const fs = require("fs")
const express = require('express')
const app = express()
const path = require('path')
const cookieParser = require('cookie-parser')
const WS = require('ws')
const port = 4000
const favicon = require('serve-favicon');
const {v4: uuidv4} = require('uuid')
const schedule = require('node-schedule');
var instances = require("./lib/instances.json")
const passwords = require("./lib/passwords.json")
const dbTools = require("./lib/databaseTools.js")
const canvasTools = require("./lib/canvasTools.js")

//Enable cookies, static directory, and favicon
app.use(cookieParser());
app.use(express.static(__dirname + '/static'));
app.use(favicon(__dirname + '/static/favicon.ico'));

app.set('views', './static')
app.set('view engine', 'pug')

//Intantialize DB connections and restore tokens
for (let i in instances) {
    instances[i].dbConnection = new dbTools(instances[i].dbName)
    instances[i].dbConnection.getTokens().then((tokens) => {
        instances[i].tokens = tokens
    }).catch((err) => {
        console.error(err)
    })
}


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
                    instances[i].dbConnection.putToken(token)
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
                    res.end(JSON.stringify({ status: "success", message: toReturn ? toReturn : "Goodbye!" }))
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
                    await dbConnection.createUser(args.id, args.name, args.email, args.signin ?? true, instances[req.cookies.shop].strings)
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
                    return
                }
            }
        } catch (e) {
            //Error handling
            console.error("Caught the following error:")
            console.error(e)
            res.writeHead(400, "Bad Request")
            res.end()
            return
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
            let dbConnection = getDBConnection(req.cookies.token)
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

//Search for users
app.post('/search', (req, res) => {
    //Get args
    let info = ""
    req.on("data", (chunk) => {
        info += chunk
    })
    req.on('end', async () => {
        try {
            //Parse args, get db
            let args = JSON.parse(info)
            let dbConnection = getDBConnection(req.cookies.token)
            if (!dbConnection) {
                res.writeHead(400, "Invalid credentials")
                res.end()
                return
            }
            //Get the guest information and send it
            let guests = await dbConnection.search(args.id, args.name, args.email)
            for (let i in guests) {
                guests[i].history = await dbConnection.getHistory(guests[i].guest_id)   
            }
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify(guests))
        } catch (e) {
            console.error("Caught the following error:")
            console.error(e)
            res.writeHead(400, "Bad Request")
            res.end()
        }
    })
})

//Edit a user's info
app.post('/editUser', (req, res) => {
    //Get args
    let info = ""
    req.on("data", (chunk) => {
        info += chunk
    })
    req.on('end', async () => {
        try {
            //Parse args, get db
            let args = JSON.parse(info)
            let dbConnection = getDBConnection(req.cookies.token)
            if (!dbConnection) {
                res.writeHead(400, "Invalid credentials")
                res.end()
                return
            }
            //Get the guest information and send it
            await dbConnection.editUser(args.id, args.name, args.email)
            broadcastGuest(req.cookies.shop, args.id)
            res.writeHead(200)
            res.end()
        } catch (e) {
            console.error("Caught the following error:")
            console.error(e)
            res.writeHead(400, "Bad Request")
            res.end()
        }
    })
})

//Does a data dump
app.get('/dataDump', async (req, res) => {
    try {
        //Get db
        let dbConnection = getDBConnection(req.cookies.token)
        if (!dbConnection) {
            res.writeHead(400, "Invalid credentials")
            res.end()
            return
        }
        //Get the data dump and send it
        let dump = await dbConnection.dataDump()
        let toReturn = ""
        if (dump.length > 0) {
            for (let i in dump[0]) {
                toReturn += i
                toReturn += ","
            }
            toReturn += "\n"
            for (let i in dump) {
                for (let j in dump[i]) {
                    toReturn += dump[i][j]
                    toReturn += ","
                }
                toReturn += "\n"
            }
            res.writeHead(200, { 'Content-Type': 'text/csv' })
            res.end(toReturn)
        } else {
            res.writeHead(200)
            res.end()
        }
    } catch (e) {
        console.error("Caught the following error:")
        console.error(e)
        res.writeHead(400, "Bad Request")
        res.end()
    }
})

//Make routing trees for each instance
for (let i in instances) {
    //Make the new router
    let router = express.Router()

    //The root for this router should direct users to a directory of cert quizzes
    router.get('/', (req, res) => {
        //Dynamically renders a list of quizzes server-side. Pug is a cool library
        res.render("quizDirectory.pug", {data: instances[i].certs, shopName: i})
    })

    //Convenience path to access the staff page. Same as previous, but in this router
    router.get('/staff', (req, res) => {
        if (instances[i].tokens?.includes(req.cookies?.token)) {
            res.sendFile(path.join(__dirname, '/static/staffView.html'))
            return
        }
        res.sendFile(path.join(__dirname, '/static/loginView.html'))
    })

    //Path to guest page
    router.get('/guests', (req, res) => {
        res.cookie('shop', i)
        res.render('guestView.pug', {
            waiver: instances[i].strings.waiver,
            registrationConfirmation: instances[i].strings.registrationConfirmation,
            welcomeString: instances[i].strings.welcomeString
        })
    })

    //Path to link to enroll
    router.get('/enroll', (req, res) => {
        res.cookie('shop', i)
        res.render('enrollView.pug', {
            waiver: instances[i].strings.waiver,
            registrationConfirmation: instances[i].strings.registrationConfirmation
        })
    })

    //Add quiz pages for each certification with a quizId defined
    for (let j in instances[i].certs) {
        //Add path for this quiz
        router.get(`/${instances[i].certs[j].name.replace(/\W/g, '')}`, (req, res) => {
            //Using Pug (a cool library I just learned), render an HTML page representing the Canvas quiz, and send it to the client
            canvasTools.getQuizData(instances[i].certs[j].quizId).then((data) => {
                res.render("quizTemplate.pug", {data: data, shopName: i})
            }).catch((err) => {
                //Error handling
                console.error(err)
                res.writeHead(500, "Bad request")
                res.end()
            })
        })
    }

    //Tell it to actually use the router as part of this subpath
    app.use(`/${i}`, router)
}

//Lets users change instance data
app.post('/adminChanges', (req, res) => {
    //Get args
    let info = ""
    req.on("data", (chunk) => {
        info += chunk
    })
    req.on('end', () => {
        try {
            let changes = JSON.parse(info)
            if (!getNameFromAuth(req.cookies.token)) {
                res.writeHead(401, "Unauthorized")
                res.end()
                return
            }
            for (let i in changes) {
                let args = changes[i].args
                switch (changes[i].type) {
                    case "addShop":
                        if (instances[args.shopName]) {
                            res.writeHead(409, "Already exists")
                            res.end()
                            return
                        }
                        instances[args.shopName] = {
                            dbName: args.shopName + ".db",
                            certs: [],
                            strings: instances[getNameFromAuth(req.cookies.token)].strings
                        }
                        passwords[args.shopName] = {
                            username: args.username,
                            password: args.password
                        }
                        break
                    case "addCert":
                        let replacing = null
                        for (let j in instances[getNameFromAuth(req.cookies.token)].certs) {
                            if (instances[getNameFromAuth(req.cookies.token)].certs[j].id == args.id) {
                                replacing = j
                            }
                        }
                        if (replacing) {
                            instances[getNameFromAuth(req.cookies.token)].certs.splice(replacing, 1, args)
                        } else {
                            instances[getNameFromAuth(req.cookies.token)].certs.push(args)
                        }
                        break
                    case "setStrings":
                        for (let j in args) {
                            instances[getNameFromAuth(req.cookies.token)].strings[j] = args[j]
                        }
                        break
                }
            }

            //Copy changes to a new object so we can delete the tokens and dbconnections
            let newInstances = instances
            for (let i in newInstances) {
                delete newInstances[i].dbConnection
                delete newInstances[i].tokens
            }
                
            //Save changes and restart
            fs.writeFile("./lib/instances.json", JSON.stringify(instances, null, "\t"), "utf-8", (err) => {
                if (err) {
                    console.error(err)
                    res.writeHead(500, "Internal Server Error")
                    res.end()
                    return
                }
                //Save password too
                fs.writeFile("./lib/passwords.json", JSON.stringify(passwords, null, "\t"), "utf-8", (err) => {
                    if (err) {
                        console.error(err)
                        res.writeHead(500, "Internal Server Error")
                        res.end()
                        return
                    }
                    res.writeHead(200, "Success")
                    res.end()
                    process.kill(process.pid, "SIGINT")
                })
            })
        } catch (e) {
            //Error handling
            console.error("Caught the following error:")
            console.error(e)
            res.writeHead(400, "Bad Request")
            res.end()
        }
    })
})

app.post('/quiz/:quiz(\\d+)/submit', (req, res) => {
    //Get args
    let info = ""
    req.on("data", (chunk) => {
        info += chunk
    })
    req.on('end', async () => {
        try {
            //Parse args
            let args = JSON.parse(info)
            //Tracks whether the email was found in any instance
            let found = false
            //Searches each instance
            for (let i in instances) {
                //Keeps track of who has had changes
                let toBroadcast = null
                //Finds the matching certification to this quiz
                for (let j in instances[i].certs) {
                    if (instances[i].certs[j].quizId == req.params.quiz) {
                        try {
                            //Call the DB method to search for the email and add a cert. Returns an array of users who have had changes
                            let changed = await instances[i].dbConnection.altAddCert(args.email, instances[i].certs[j].id)
                            found = true
                            if (changed) {
                                toBroadcast = changed
                            }
                            //Catch errors. If the error is that the user couldn't be found, nothing needs to happen.
                        } catch (e) {
                            if (e !== "No such user") {
                                console.error("Caught the following error:")
                                console.error(e)
                                res.writeHead(400, "Bad Request")
                                res.end()
                                return
                            }
                        }
                    }
                }
                //Broadcast guests if needed
                for (let j in toBroadcast) {
                    await broadcastGuest(i, toBroadcast[j])
                }
            }
            //If we didn't find anyone with that username, send back an error
            if (!found) {
                res.writeHead(400, "Bad Request")
                res.end("No such user")
                return
            }
            //Otherwise, success!
            res.writeHead(200, "Success")
            res.end()
        } catch (e) {
            //Error handling
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
                await dbConnection.removeCert(args.id, args.cert, args.reason, instances[getNameFromAuth(ws.secret)].certs)
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
                broadcastGuest(getNameFromAuth(ws.secret), args.user).catch(console.error)
                break
            //Add a task to be done and broadcast the updated task list
            case "addTask":
                await dbConnection.createTask(args.name, args.description, args.period, args.date)
                broadcastTasks(getNameFromAuth(ws.secret))
                break
            //Remove a task to be done and broadcast the updated task list
            case "removeTask":
                await dbConnection.deleteTask(args.id)
                broadcastTasks(getNameFromAuth(ws.secret))
                break
            //Mark a task to be done and broadcast the updates task list
            case "doTask":
                await dbConnection.doTask(args.id, args.date)
                broadcastTasks(getNameFromAuth(ws.secret))
                break
            //Ping pong
            case "ping":
                ws.send(JSON.stringify({type: "pong"}))
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

    //Send cache information
    let cache = await dbConnection.getCache()
    toSend = {
        type: "cacheList",
        data: cache
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
    for (var i in cache) {
        let history = await dbConnection.getHistory(cache[i].guest_id)
        toSend = {
            type: "history",
            user: cache[i].guest_id,
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

    //Send the text strings that the shop uses
    let strings = instances[getNameFromAuth(ws.secret)]?.strings
    toSend = {
        type: "strings",
        data: strings
    }
    ws.send(JSON.stringify(toSend))

    //Send canvas info
    let quizzes = await canvasTools.getQuizzes()
    toSend = {
        type: "canvasQuizzes",
        data: quizzes
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
    //Call the below function for each instance
    for (let i in instances) {
        checkCertsForInstance(i)
    }
}

//Check the certifications for a specific instance. Called whenever someone signs in. Same as the inner loop from above.
function checkCertsForInstance(i) {
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

//Sign people out at night
let job = schedule.scheduleJob('30 3 * * *', async () => {
    try {
        for (let i in instances) {
            await instances[i].dbConnection.signAllOut()
            let status = await instances[i].dbConnection.getStatus()
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
    } catch (e) {
        console.error("Error signing people out:")
        console.error(e)
    }
})

async function doExpiration() {
    try {
        for (let i in instances) {
            await instances[i].dbConnection.checkExpirationTimer(instances[i].certs, instances[i].strings, 31, 45, 24 * 60 * 60 * 1000) //Number of milliseconds in a day
            let status = await instances[i].dbConnection.getStatus()
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
    } catch (e) {
        console.error("Error signing people out:")
        console.error(e)
    }
}

//Used for testing
/*setTimeout(() => {
    doExpiration().catch(console.error)
    console.log("Started doing expiration")
}, 5000)*/

//Do cert expiration
let job2 = schedule.scheduleJob('30 14 * * *', doExpiration)

//Regularly check certification expiration

//Check certifications every now and then
setInterval(checkCerts, 5 * 60 * 100)

//Close everything gracefully
process.on('SIGINT', async () => {
    console.log('Stopping gracefully');
    for (let i in instances) {
        await (new Promise((resolve, reject) => {
            instances[i].dbConnection.db.close((err) => {
                if (err) {
                    reject(err)
                } else {
                    resolve()
                }
            })
        }))
    }
    console.log('Closed everything gracefully')
    process.exit(0)
})

//Say that you're up
console.log(`Listening on port ${port}!`)
