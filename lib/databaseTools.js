//Require stack
var sqlite = require('sqlite3');
const canvas = require('./canvasTools.js')
const mailer = new (require('./emailTools.js'))()
const fs = require('fs');

//Enum of the different types of history items
const history_types = {
    NOTE: 0,
    ATTENTION: 1,
    PROBLEM: 2,
    REVOKE_CERT: 3,
    ADD_CERT: 4,
    VISIT: 5,
    FIRST_VISIT: 6,
    AUTO_ADD: 7,
    MESSAGE: 8
}

class DBTools {
    //Open the database, and create it if it didn't exist before
    constructor(filename) {
        if (fs.existsSync(filename)) {
            this.db = new sqlite.Database(filename, sqlite.OPEN_READWRITE);
        } else {
            this.db = new sqlite.Database(filename, sqlite.OPEN_READWRITE | sqlite.OPEN_CREATE);
            this.createDatabase()
        }
    }

    //SQL for making each schema
    createDatabase() {
        this.db.serialize()
        this.db.exec("DROP TABLE IF EXISTS tokens;")
            .exec("DROP TABLE IF EXISTS tasks;")
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
                        //Resolve Visit and First Visit and cert adding objects
                        this.db.run("UPDATE history SET resolved = 1, note = ? WHERE guest_id = ? AND resolved = 0 AND type = ? OR type = ? OR type = ? OR type = ?",
                            new Date().toISOString(), id, history_types.VISIT, history_types.FIRST_VISIT, history_types.AUTO_ADD, history_types.ADD_CERT, (err) => {
                                if (err) rej(err)
                                res(false)
                            }
                        )
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
                                        //Retrieve, resolve, and return all message objects for the user
                                        this.db.all("SELECT note FROM history WHERE guest_id = ? AND type = ? AND resolved = 0", id, history_types.MESSAGE, (err, rows) => {
                                            if (err) return rej(err)
                                            this.db.run("UPDATE history SET resolved = 1, note = ? WHERE guest_id = ? AND type = ?", "Seen " + new Date().toString(), id, history_types.MESSAGE, (err) => {
                                                if (err) return rej(err)
                                                res(rows)
                                            })
                                        })
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
    createUser(id, name, email, login, strings) {
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
                let canvasId = await canvas.enrollUser(id, email, name, strings.canvasWelcomeTitle, strings.canvasWelcomeBody)
                //Send users an email when they enroll if they aren't OU people
                if (!canvasId) {
                    try {
                        await mailer.sendMessage(email, strings.emailWelcomeTitle, strings.emailWelcomeBody)
                    } catch (e) {
                        return rej(e)
                    }
                }
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

    //Add a certification from a non-Canvas quiz. Returns an array of affected users
    altAddCert(email, cert) {
        return new Promise((res, rej) => {
            //Get users with this email
            this.db.all("SELECT * FROM guests WHERE email = ? COLLATE NOCASE", email, (err, rows) => {
                if (err) {
                    return rej(err)
                }
                //Reject if no users found
                if (rows.length == 0) {
                    rej("No such user")
                }
                //Keeps track of which users have been changed
                let toReturn = []
                for (let i in rows) {
                    //If this user needs to be updated
                    //We don't check for this anymore because we need to keep track of if they renew it
                    //if (rows[i].certs | (1 << cert) > rows[i].certs) {
                        //Mark them as about to be changed
                        toReturn.push(rows[i].guest_id)
                        //Run the update command
                        this.db.run("UPDATE guests SET certs = ? WHERE guest_id = ?", rows[i].certs | (1 << cert), rows[i].guest_id, (err) => {
                            if (err) { return rej(err) }
                            this.db.run("INSERT INTO history(guest_id, type, date, cert, resolved, note) VALUES (?, ?, ?, ?, 0, ?)",
                                rows[i].guest_id, history_types.AUTO_ADD, new Date().toISOString(), cert, "Took non-Canvas quiz", (err) => {
                                if (err) rej(err)
                                res()
                            })
                        })
                    //}
                }
                //Return the list of users which have been changed
                res(toReturn)
            })
        })
    }

    //Remove a certifications
    removeCert(user, cert, reason, certs) {
        return new Promise((res, rej) => {
            console.log(user, cert, reason)
            //Get the current guest certs
            this.db.get("SELECT certs, canvas_id FROM guests WHERE guest_id = ?", user, (err, row) => {
                if (err) return rej(err)
                if (!row) rej("No such guest")
                //Same as above, but with a bit mask that we AND with
                let toInsert = row.certs;
                toInsert &= ~(1 << cert)
                //Update DB and add history item
                this.db.run("UPDATE guests SET certs = ? WHERE guest_id = ?", toInsert, user, (err) => {
                    if (err) rej(err)
                    //Note that we just removed a cert in the history log
                    this.db.run("INSERT INTO history(guest_id, type, date, cert, resolved, note) VALUES (?, ?, ?, ?, 0, ?)",
                        user, history_types.REVOKE_CERT, new Date().toISOString(), cert, reason, (err) => {
                            if (err) rej(err)
                            //If they're in Canvas
                            if (row.canvas_id) {
                                //Find the appropriate cert assignment
                                for (let i in certs) {
                                    if (certs[i].id == cert && certs[i].assignmentId) {
                                        //Remove the cert in Canvas
                                        canvas.removeCert(row.canvas_id, certs[i].assignmentId, reason)
                                        break
                                    }
                                }
                            }
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
            } else if (type == "message") {
                toSet = history_types.NOTE
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

    //Get the information of ALL guests logged in within the past day
    getCache() {
        return new Promise((res, rej) => {
            this.db.all("SELECT guests.guest_id, guests.name, guests.email, guests.certs, MAX(history.date) AS last FROM history, guests WHERE guests.guest_id = history.guest_id AND history.type = ? AND history.date BETWEEN strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 day') AND strftime('%Y-%m-%dT%H:%M:%fZ', 'now') GROUP BY guests.guest_id", history_types.VISIT, (err, rows) => {
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
                if (!row) {
                    return rej("No such user: " + id)
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
            this.db.all("SELECT guests.guest_id, guests.canvas_id, guests.certs FROM current, guests WHERE current.guest_id = guests.guest_id AND guests.canvas_id IS NOT NULL", async (err, rows) => {
                if (err) rej(err)
                //Make an array of student IDs
                let toCheck = []
                for (let i in rows) {
                    if (rows[i].canvas_id) {
                        toCheck.push(rows[i].canvas_id)
                    }
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
                                //I should really add an "AUTO_ADD" event to history but eh
                                //  Note from a later Daniel: Screw you, past self
                                this.db.run("UPDATE guests SET certs = ? WHERE canvas_id = ?", rows[i].certs | toSet[j], rows[i].canvas_id, (err) => {
                                    if (err) rej(err)
                                    //For each cert we've checked
                                    for (let k = 0; 1 << k <= toSet[j]; k++) {
                                        //If we DIDN'T have the cert, and now we DO, add an AUTO_ADD event to history
                                        if (!rows[i].certs & toSet[j] & (1 << k)) {
                                            this.db.run("INSERT INTO history(guest_id, type, date, cert, resolved, note) VALUES (?, ?, ?, ?, 0, ?)",
                                                rows[i].guest_id, history_types.AUTO_ADD, new Date().toISOString(), k, "Passed Canvas quiz", (err) => {
                                                    if (err) rej(err)
                                                }
                                            )
                                        }
                                    }
                                })
                                
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

    //Signs everyone out
    signAllOut() {
        return new Promise((res, rej) => { 
            this.db.all("SELECT * FROM current", (err, rows) => {
                if (err) return rej(err)
                for (let i in rows) {
                    //Remove them from the "current" schema
                    this.db.run("DELETE FROM current WHERE guest_id = ?;", rows[i].guest_id, (err) => {
                        if (err) return rej(err)
                        //Resolve Visit and First Visit objects
                        this.db.run("UPDATE history SET resolved = 1, note = ? WHERE guest_id = ? AND resolved = 0 AND type = ? OR type = ? OR type = ? OR type = ? OR type = ?",
                            new Date().toISOString(), rows[i].guest_id, history_types.VISIT, history_types.FIRST_VISIT, history_types.AUTO_ADD, history_types.ADD_CERT, history_types.MESSAGE, (err) => {
                            if (err) return rej(err)
                            res(false)
                        })
                    })
                }
                if (rows.length == 0) {
                    return res(false)
                }
            })
        })
    }

    //Searches the database on columns
    search(id, name, email) {
        return new Promise((res, rej) => {
            this.db.all("SELECT * FROM guests WHERE guest_id LIKE ? AND name LIKE ? AND email LIKE ? LIMIT 30",
                //Use wildcards to do an "includes" check
                //I think I talked about it earlier, but the ?? syntax is called the Nullish Coalescing Operator. It returns the left thing, unless that's null or undefined, in which case it used the right thing.
                "%" + (id ?? "") + "%",
                "%" + (name ?? "") + "%",
                "%" + (email ?? "") + "%",
                (err, rows) => {
                    if (err) {
                        return rej(err)
                    }
                    res(rows)
                }
            )
        })
    }
    
    editUser(id, name, email) {
        return new Promise((res, rej) => {
            this.db.run("UPDATE guests SET name = ?, email = ? WHERE guest_id = ?", name, email, id, (err) => {
                if (err) {
                    return rej(err)
                }
                res()
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

    //Dump all the data for report purposes
    dataDump() {
        return new Promise((res, rej) => {
            this.db.all("SELECT * FROM guests NATURAL JOIN history", (err, rows) => {
                if (err) return rej(err)
                for (let i in rows) {
                    for (let j in history_types) {
                        if (history_types[j] == rows[i].type) {
                            rows[i].type = j
                            break
                        }
                    }
                    rows[i].resolved = rows[i].resolved ? "True" : "False"
                }
                res(rows)
            })
        })
    }

    //Message the user, either through email or Canvas, depending on whether they're on Canvas
    messageUser(guest_id, title, body) {
        this.getUser(guest_id).then((data) => {
            if (data.canvas_id) {
                canvas.messageUser(data.canvas_id, title, body).catch(console.error)
            } else {
                mailer.sendMessage(data.email, title, body).catch(console.error)
            }
        }).catch(console.error)
    }

    //Check how long it's been since each user either got a cert, or made a visit.
    checkExpirationTimer(certs, strings, warningThreshold, removalThreshold, checkPeriod) {
        return new Promise(async (res, rej) => {
            //Tracks pending users - users who are in Canvas, and so might have renewed their certification recently
            let pending = {}
            let doneCount = 0
            //Check for each guest
            this.db.each("SELECT * FROM guests", (err, row) => {
                if (err) rej(err)
                //Get all the visit and certification events
                this.db.all("SELECT * FROM history WHERE guest_id = ? AND (type = ? OR type = ? OR type = ?) ORDER BY date DESC",
                    row.guest_id, history_types.VISIT, history_types.ADD_CERT, history_types.AUTO_ADD, (err, rows) => {
                        if (err) rej(err)
                        //Make an object tracking all the certification times
                        let certTimes = {}
                        //Go through user history and find the first instance of a visit or certification
                        for (let i in rows) {
                            //A visit resets all certification times
                            if (rows[i].type == history_types.VISIT) {
                                for (let k in certs) {
                                    if (!certTimes[certs[k].id]) {
                                        certTimes[certs[k].id] = new Date(rows[i].date)
                                    }
                                }
                                //Break after this, we've found the most recent refresh for all certs
                                break
                            } else {
                                if (!certTimes[rows[i].cert]) {
                                    certTimes[rows[i].cert] = new Date(rows[i].date)
                                }
                            }
                        }
                        //If the user is on Canvas, save this info to the "pending" object to be cross-referenced with Canvas later
                        if (row.canvas_id) {
                            pending[row.canvas_id] = {
                                times: certTimes,
                                guest_id: row.guest_id,
                                certs: row.certs
                            }
                        } else { //Else, go ahead and check if we need to email them or remove certs
                            this.doExpiration(row.guest_id, row.certs, certTimes, certs, warningThreshold, removalThreshold, checkPeriod, strings)
                        }
                        doneCount++
                    }
                )
            }, async (err, count) => { //Called when done with the above
                if (err) rej(err)
                //Wait until all people have been processed above
                while (doneCount < count) {
                    await (new Promise((resolve, reject) => {
                        setTimeout(resolve, 0)
                    }))
                }
                //Go through Canvas people now
                //Holds a chunk of 10 people, to treat as a batch
                let chunk = []
                for (let i in pending) {
                    chunk.push(i)
                    //If, in the future, we have problems with stuff not working right, check this and make it, like, 5 
                    if (chunk.length >= 10) {
                        //Run the call for the chunk
                        let canvasCertTimes = await canvas.checkCerts(chunk, certs)
                        //Go through and set the time for each cert to the Canvas time, if the Canvas time is later
                        for (let j in canvasCertTimes) {
                            for (let k in canvasCertTimes[j]) {
                                if (pending[j].times[k] && pending[j].times[k] < canvasCertTimes[j][k]) {
                                    pending[j].times[k] = canvasCertTimes[j][k]
                                }
                            }
                        }
                        //Check if we need to email them or remove certs
                        for (let j in chunk) {
                            this.doExpiration(pending[chunk[j]].guest_id, pending[chunk[j]].certs, pending[chunk[j]].times, certs, warningThreshold, removalThreshold, checkPeriod, strings)
                        }
                        chunk = []
                    }
                }
                //Finally, do the stuff once more for any leftover people
                if (chunk.length > 0) {
                    //Run the call for the chunk
                    let canvasCertTimes = await canvas.checkRenewals(chunk, certs)
                    //Go through and set the time for each cert to the Canvas time, if the Canvas time is later
                    for (let j in canvasCertTimes) {
                        for (let k in canvasCertTimes[j]) {
                            if (pending[j].times[k] && pending[j].times[k] < canvasCertTimes[j][k]) {
                                pending[j].times[k] = canvasCertTimes[j][k]
                            }
                        }
                    }
                    //Check if we need to email them or remove certs
                    for (let j in chunk) {
                        this.doExpiration(pending[chunk[j]].guest_id, pending[chunk[j]].certs, pending[chunk[j]].times, certs, warningThreshold, removalThreshold, checkPeriod, strings)
                    }
                    chunk = []
                }
                res()
            })
        })
    }

    async doExpiration(guestId, userCertifications, certTimes, certs, warningThreshold, removalThreshold, checkPeriod, strings) {
        //Date that's now, just so we don't have to initialize one over and over
        let now = new Date()
        //Convert dates into periods ago. i.e. if the checkPeriod is one day, convert the date to the number of days ago it was.
        for (let i in certTimes) {
            certTimes[i] = Math.floor((now - certTimes[i]) / checkPeriod)
        }
        //Prepare an array of which certs are which category
        let warnings = []
        let expired = []
        for (let i in certTimes) {
            //If the user has this cert and it's time to warn them, add that cert to the warning array
            if ((userCertifications & (1 << i)) && certTimes[i] == warningThreshold) {
                warnings.push(i)
            }
            //Same for expiration
            if ((userCertifications & (1 << i)) && certTimes[i] >= removalThreshold) {
                expired.push(i)
            }
        }
        //Now we have to remove any certs that are set as exempt from expiration
        for (let i in certs) {
            if (certs[i].expirationExempt) {
                warnings = warnings.filter(cert => cert != certs[i].id)
                expired = expired.filter(cert => cert != certs[i].id)
            }
        }
        if (expired.length > 0 || warnings.length > 0) {
            console.log(guestId, "has the following warnings and expirations:", warnings, expired)
            console.log(certTimes)
        }
        //We now have an array of cert ids for what to warn users about, and which to remove outright. So, do it!
        if (warnings.length > 0) {
            //Make a text list of expiring things
            let warningCerts = ""
            for (let i in warnings) {
                for (let j in certs) {
                    if (warnings[i] == certs[j].id) {
                        warningCerts += "\n"
                        warningCerts += certs[j].name
                    }
                }
            }
            //Send the warning message
            this.messageUser(guestId, strings.expirationWarningTitle, strings.expirationWarningBody?.replace(/%certs%/g, warningCerts))
        }
        //Same, but for expired stuff
        if (expired.length > 0) {
            //Make a list of expired things as text
            let expiredCerts = ""
            for (let i in expired) {
                for (let j in certs) {
                    if (expired[i] == certs[j].id) {
                        expiredCerts += "\n"
                        expiredCerts += certs[j].name
                        //Do the removal of the certification
                        await this.removeCert(guestId, certs[j].id, "Certification has expired", certs)
                    }
                }
            }
            //Message the user letting them know
            this.messageUser(guestId, strings.expirationHappenedTitle, strings.expirationHappenedBody?.replace(/%certs%/g, expiredCerts))
        }
    }
}

module.exports = DBTools