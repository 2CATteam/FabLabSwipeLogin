//Require stack
var sqlite = require('sqlite3');
const instances = require('./instances.js')
const fs = require('fs');

//Basically just copied from dbtools
class AddColumn {
    //Open the database, and create it if it didn't exist before
    constructor(filename) {
        if (fs.existsSync(filename)) {
            this.db = new sqlite.Database(filename, sqlite.OPEN_READWRITE | sqlite.OPEN_CREATE);
        } else {
            this.db = new sqlite.Database(filename, sqlite.OPEN_READWRITE | sqlite.OPEN_CREATE);
            this.createDatabase()
        }
    }

    //SQL for making each schema
    createDatabase() {
        this.db.serialize()
        this.db.exec("DROP TABLE IF EXISTS tasks;")
            .exec("DROP TABLE IF EXISTS history;")
            .exec("DROP TABLE IF EXISTS current;")
            .exec("DROP TABLE IF EXISTS guests;")
            .exec(`CREATE TABLE guests (
                guest_id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                email TEXT NOT NULL,
                certs INTEGER DEFAULT 0 CHECK (certs >= 0),
                canvas_id TEXT
            );`)
            .exec(`CREATE TABLE current (
                guest_id TEXT PRIMARY KEY,
                FOREIGN KEY(guest_id) REFERENCES guests(guest_id)
            );`)
            .exec(`CREATE TABLE history (
                event_id INTEGER PRIMARY KEY AUTOINCREMENT,
                guest_id TEXT NOT NULL,
                type INT NOT NULL,
                date TEXT NOT NULL,
                resolved INTEGER DEFAULT 0,
                cert INTEGER,
                note TEXT,
                FOREIGN KEY(guest_id) REFERENCES guests(guest_id)
            )`)
            .exec(`CREATE TABLE tasks (
                task_id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                description TEXT,
                period INTEGER NOT NULL,
                date TEXT
            );`)
            .exec(`CREATE TABLE tokens (
                token_id INTEGER PRIMARY KEY AUTOINCREMENT,
                token TEXT
            );`)
        //I can't remember what this does. Maybe it makes it to where it can process multiple requests at once? Who's to say
        this.db.parallelize()
    }

    //Swipe in/out a user. Returns a boolean indicating if they are now signed in
    userSwipe(id) {
        //Async stuff. Javascript, learn it, it's great
        return new Promise((res, rej) => {
            //Check if there already exists a guest who's signed in
            this.db.get("SELECT * FROM current WHERE guest_id = ?;", id, (err, row) => {
                //Async version of "throw"
                if (err) rej(err);
                //If someone is signed in
                if (row) {
                    //Remove them from the "current" schema
                    this.db.run("DELETE FROM current WHERE guest_id = ?;", id, (err) => {
                        if (err) rej(err)
                        //Resolve Visit and First Visit objects
                        this.db.run("UPDATE history SET resolved = 1, note = ? WHERE guest_id = ? AND resolved = 0 AND type = ? OR type = ?", new Date().toISOString(), id, history_types.VISIT, history_types.FIRST_VISIT, (err) => {
                            if (err) rej(err)
                            res(false)
                        })
                    })
                } else {
                    //Get the guest if they're there
                    this.db.get("SELECT * FROM guests WHERE guest_id = ?", id, (err, row2) => {
                        if (err) rej(err);
                        //If we found them, insert them into the Current schema
                        if (row2) {
                            this.db.run("INSERT INTO current VALUES (?)", id, (err) => {
                                if (err) rej(err)
                                //Add a visit history item
                                this.db.run("INSERT INTO history (guest_id, type, date, resolved) VALUES (?, ?, ?, 0)",
                                    id, history_types.VISIT, new Date().toISOString(), (err) => {
                                        if (err) rej(err)
                                        res(true)
                                    }
                                )
                            })
                        } else {
                            //Custom error to tell them to register
                            rej(new Error("New user"))
                        }
                    })
                }
            })
        })
    }

    //Register a new user. No return value
    createUser(id, name, email, login) {
        return new Promise((res, rej) => {
            //Logging for data exploitation purposes /s
            console.log(id, name, email, login)
            this.db.all("SELECT * FROM guests WHERE guest_id = ?", id, async (err, rows) => {
                if (err) {
                    rej(err)
                    return
                }
                if (rows.length != 0) {
                    rej("User already exists")
                    return
                }
                //Enroll them in the Canvas course. Returns null if non-OU person
                let canvasId = await canvas.enrollUser(id, email, name)
                //Add the user to our database
                this.db.run("INSERT INTO guests(guest_id, name, email, canvas_id) VALUES (?, ?, ?, ?)", id, name, email, canvasId, (err) => {
                    if (err) {
                        rej(err)
                        return
                    }
                    console.log("Created new user")
                    //Add the history item
                    this.db.run("INSERT INTO history(guest_id, type, date, resolved) VALUES (?, ?, ?, 0)",
                        id, history_types.FIRST_VISIT, new Date().toISOString(), (err) => {
                            if (err) {
                                rej(err)
                                return
                            }
                            //Log them in
                            if (login) {
                                this.userSwipe(id).then(res).catch(rej)
                            } else {
                                res()
                            }
                        }
                    )
                })
            })
        })
    }

    //Add a certification to a user
    addCert(user, cert, reason) {
        return new Promise((res, rej) => {
            //Check their current certs
            this.db.get("SELECT certs FROM guests WHERE guest_id = ?", user, (err, row) => {
                if (err) rej(err)
                //Error if guest DNE
                if (!row) rej("No such guest")
                //Get the old cert number
                var toInsert = row.certs;
                //Okay so I want to talk about this
                //Basically, certs are stored as a 64-bit integer
                //Each bit represents a certification, 1 or 0
                //This piece of code sets the proper bit of the cert number to 1
                toInsert |= 1 << cert
                //Update the DB with the cert and the history of this being granted
                this.db.run("UPDATE guests SET certs = ? WHERE guest_id = ?", toInsert, user, (err) => {
                    if (err) rej(err)
                    this.db.run("INSERT INTO history(guest_id, type, date, cert, resolved, note) VALUES (?, ?, ?, ?, 0, ?)",
                        user, history_types.ADD_CERT, new Date().toISOString(), cert, reason, (err) => {
                            if (err) rej(err)
                            res()
                        }
                    )
                })
            })
        })
    }

    //Remove a certifications
    removeCert(user, cert, reason) {
        return new Promise((res, rej) => {
            //Get the current guest certs
            this.db.get("SELECT certs FROM guests WHERE guest_id = ?", user, (err, row) => {
                if (err) rej(err)
                if (!row) rej("No such guest")
                //Same as above, but with a bit mask that we AND with
                var toInsert = row.certs;
                toInsert &= ~(1 << cert)
                //Update DB and add history item
                this.db.run("UPDATE guests SET certs = ? WHERE guest_id = ?", toInsert, user, (err) => {
                    if (err) rej(err)
                    this.db.run("INSERT INTO history(guest_id, type, date, cert, resolved, note) VALUES (?, ?, ?, ?, 0, ?)",
                        user, history_types.REVOKE_CERT, new Date().toISOString(), cert, reason, (err) => {
                            if (err) rej(err)
                            res()
                        }
                    )
                })
            })
        })
    }

    //Make a note on a user
    makeNote(user, type, note) {
        return new Promise((res, rej) => {
            //Translate to enum
            let toSet = history_types.NOTE
            if (type == "problem") {
                toSet = history_types.PROBLEM
            } else if (type == "attention") {
                toSet = history_types.ATTENTION
            }
            //Add to the db
            this.db.run("INSERT INTO history(guest_id, type, date, resolved, note) VALUES (?, ?, ?, 0, ?)",
                user, toSet, new Date().toISOString(), note, (err) => {
                    if (err) rej(err)
                    res()
                }
            )
        })
    }

    //Resolve a history item
    resolve(event) {
        return new Promise((res, rej) => {
            this.db.run("UPDATE history SET resolved = 1 WHERE event_id = ?", event, (err) => {
                if (err) {
                    rej(err)
                    return
                }
                res()
            })
        })
    }

    //Get the information of ALL currently-logged in guests
    getStatus() {
        return new Promise((res, rej) => {
            this.db.all("SELECT guests.guest_id, guests.name, guests.email, guests.certs FROM current, guests WHERE current.guest_id = guests.guest_id", (err, rows) => {
                if (err) rej(err)
                res(rows)
            })
        })
    }

    //Get a user object from the ID
    getUser(id) {
        return new Promise((res, rej) => {
            //Get the initial object
            this.db.get("SELECT * FROM guests WHERE guest_id = ?", id, (err, row) => {
                if (err) {
                    rej(err)
                    return
                }
                //Find out if they're signed in or not
                this.db.get("SELECT * FROM current WHERE guest_id = ?", id, (err, row2) => {
                    if (err) {
                        rej(err)
                        return
                    }
                    row.here = row2 ? true : false
                    res(row)
                })
            })
        })
    }

    //Get the history for a given user
    getHistory(id) {
        return new Promise((res, rej) => {
            this.db.all("SELECT * FROM history WHERE guest_id = ?", id, (err, rows) => {
                if (err) rej(err)
                res(rows)
            })
        })
    }

    //Create a task
    createTask(name, description, period, date) {
        return new Promise((res, rej) => {
            this.db.run("INSERT INTO tasks(name, description, period, date) VALUES (?, ?, ?, ?)", name, description, period, date, (err) => {
                if (err) rej(err)
                res()
            })
        })
    }

    //Return all tasks
    getTasks() {
        return new Promise((res, rej) => {
            this.db.all("SELECT * FROM tasks", (err, rows) => {
                if (err) rej(err)
                res(rows)
            })
        })
    }

    //Mark a task as done
    doTask(id, date) {
        return new Promise((res, rej) => {
            this.db.run("UPDATE tasks SET date = ? WHERE task_id = ?", date, id, (err) => {
                if (err) rej(err)
                res()
            })
        })
    }

    //Check certifications for everyone currently here
    checkCerts(certs) {
        return new Promise(async (res, rej) => {
            //Returns a boolean indicating if anything was changed
            let toReturn = false
            //Get all the current guests
            this.db.all("SELECT guests.canvas_id, guests.certs FROM current, guests WHERE current.guest_id = guests.guest_id AND guests.canvas_id IS NOT NULL", async (err, rows) => {
                if (err) rej(err)
                //Make an array of student IDs
                let toCheck = []
                for (let i in rows) {
                    toCheck.push(rows[i].canvas_id)
                }
                //console.log(rows)
                //If nothing to check, return
                if (toCheck.length == 0) {
                    res(toReturn)
                    return
                }
                try {
                    //Get the proper certs from Canvas
                    let toSet = await canvas.checkCerts(toCheck, certs)
                    //console.log(toSet)
                    //For each user
                    for (let i in rows) {
                        //Find the matching part of the object
                        for (let j in toSet) {
                            if (rows[i].canvas_id != j) continue
                            //console.log(rows[i].certs, toSet[j], rows[i].certs | toSet[j])
                            //Add the proper certs (Never remove automatically) and save to the db
                            if ((rows[i].certs | toSet[j]) > rows[i].certs) {
                                toReturn = true
                                console.log("Found new certification for user", rows[i].canvas_id, "taking certs from", rows[i].certs, "to", rows[i].certs | toSet[j])
                                this.db.run("UPDATE guests SET certs = ? WHERE canvas_id = ?", rows[i].certs | toSet[j], rows[i].canvas_id, (err) => { if (err) rej(err) })
                            }
                        }
                    }
                    res(toReturn)
                } catch (e) {
                    rej(e)
                }
            })
        })
    }

    //Put a token into the db
    putToken(token) {
        return new Promise((res, rej) => {
            this.db.run("INSERT INTO tokens(token) VALUES (?)", token, (err) => {
                if (err) {
                    rej(err)
                    return
                }
                res()
            })
        })
    }

    //Return all tokens associated with this instance
    getTokens() {
        return new Promise((res, rej) => {
            this.db.all("SELECT token FROM tokens", (err, rows) => {
                if (err) {
                    rej(err)
                    return
                }
                //Convert from array of objects to array of tokens
                let toReturn = []
                for (let i in rows) {
                    toReturn.push(rows[i].token)
                }
                res(toReturn)
            })
        })
    }
}

//Simple script to add the tokens column to an existing database
for (let i in instances) {
    for (let i in instances) {
        instances[i].dbConnection = new AddColumn(instances[i].dbName)
        instances[i].dbConnection.db.exec(`CREATE TABLE tokens (
            token_id INTEGER PRIMARY KEY AUTOINCREMENT,
            token TEXT
        );`)
    }
}