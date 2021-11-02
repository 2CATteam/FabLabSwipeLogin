var sqlite = require('sqlite3');
const canvas = require('./canvasTools.js')
const fs = require('fs');

const history_types = {
    NOTE: 0,
    ATTENTION: 1,
    PROBLEM: 2,
    REVOKE_CERT: 3,
    ADD_CERT: 4,
    VISIT: 5,
    FIRST_VISIT: 6,
    AUTO_ADD: 7,
}

class DBTools {
    constructor(filename) {
        if (fs.existsSync(filename)) {
            this.db = new sqlite.Database(filename, sqlite.OPEN_READWRITE | sqlite.OPEN_CREATE);
        } else {
            this.db = new sqlite.Database(filename, sqlite.OPEN_READWRITE | sqlite.OPEN_CREATE);
            this.createDatabase()
        }
    }

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
        this.db.parallelize()
    }

    userSwipe(id) {
        return new Promise((res, rej) => {
            this.db.get("SELECT * FROM current WHERE guest_id = ?;", id, (err, row) => {
                if (err) rej(err);
                if (row) {
                    this.db.run("DELETE FROM current WHERE guest_id = ?;", id, (err) => {
                        if (err) rej(err)
                        this.db.run("UPDATE history SET resolved = 1, note = ? WHERE guest_id = ? AND resolved = 0 AND type = ? OR type = ?", new Date().toISOString(), id, history_types.VISIT, history_types.FIRST_VISIT, (err) => {
                            if (err) rej(err)
                            res(false)
                        })
                    })
                } else {
                    this.db.get("SELECT * FROM guests WHERE guest_id = ?", id, (err, row2) => {
                        if (err) rej(err);
                        if (row2) {
                            this.db.run("INSERT INTO current VALUES (?)", id, (err) => {
                                if (err) rej(err)
                                this.db.run("INSERT INTO history (guest_id, type, date, resolved) VALUES (?, ?, ?, 0)",
                                    id, history_types.VISIT, new Date().toISOString(), (err) => {
                                        if (err) rej(err)
                                        res(true)
                                    }
                                )
                            })
                        } else {
                            rej(new Error("New user"))
                        }
                    })
                }
            })
        })
    }

    createUser(id, name, email, login) {
        return new Promise(async (res, rej) => {
            console.log(id, name, email, login)
            let canvasId = await canvas.enrollUser(id, email, name)
            this.db.run("INSERT INTO guests(guest_id, name, email, canvas_id) VALUES (?, ?, ?, ?)", id, name, email, canvasId, (err) => {
                if (err) {
                    rej(err)
                    return
                }
                console.log("Created new user")
                this.db.run("INSERT INTO history(guest_id, type, date, resolved) VALUES (?, ?, ?, 0)",
                    id, history_types.FIRST_VISIT, new Date().toISOString(), (err) => {
                        if (err) {
                            rej(err)
                            return
                        }
                        if (login) {
                            this.userSwipe(id).then(res).catch(rej)
                        } else {
                            res()
                        }
                    }
                )
            })
        })
    }

    addCert(user, cert, reason) {
        return new Promise((res, rej) => {
            this.db.get("SELECT certs FROM guests WHERE guest_id = ?", user, (err, row) => {
                if (err) rej(err)
                if (!row) rej("No such guest")
                var toInsert = row.certs;
                toInsert |= 1 << cert
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

    removeCert(user, cert, reason) {
        return new Promise((res, rej) => {
            this.db.get("SELECT certs FROM guests WHERE guest_id = ?", user, (err, row) => {
                if (err) rej(err)
                if (!row) rej("No such guest")
                var toInsert = row.certs;
                toInsert &= ~(1 << cert)
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

    makeNote(user, type, note) {
        return new Promise((res, rej) => {
            let toSet = history_types.NOTE
            if (type == "problem") {
                toSet = history_types.PROBLEM
            } else if (type == "attention") {
                toSet = history_types.ATTENTION
            }
            this.db.run("INSERT INTO history(guest_id, type, date, resolved, note) VALUES (?, ?, ?, 0, ?)",
                user, toSet, new Date().toISOString(), note, (err) => {
                    if (err) rej(err)
                    res()
                }
            )
        })
    }

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

    getStatus() {
        return new Promise((res, rej) => {
            this.db.all("SELECT guests.guest_id, guests.name, guests.email, guests.certs FROM current, guests WHERE current.guest_id = guests.guest_id", (err, rows) => {
                if (err) rej(err)
                res(rows)
            })
        })
    }

    getUser(id) {
        return new Promise((res, rej) => {
            this.db.get("SELECT * FROM guests WHERE guest_id = ?", id, (err, row) => {
                if (err) {
                    rej(err)
                    return
                }
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

    getHistory(id) {
        return new Promise((res, rej) => {
            this.db.all("SELECT * FROM history WHERE guest_id = ?", id, (err, rows) => {
                if (err) rej(err)
                res(rows)
            })
        })
    }

    createTask(name, description, period, date) {
        return new Promise((res, rej) => {
            this.db.run("INSERT INTO tasks(name, description, period, date) VALUES (?, ?, ?, ?)", name, description, period, date, (err) => {
                if (err) rej(err)
                res()
            })
        })
    }

    getTasks() {
        return new Promise((res, rej) => {
            this.db.all("SELECT * FROM tasks", (err, rows) => {
                if (err) rej(err)
                res(rows)
            })
        })
    }

    doTask(id, date) {
        return new Promise((res, rej) => {
            this.db.run("UPDATE tasks SET date = ? WHERE task_id = ?", date, id, (err) => {
                if (err) rej(err)
                res()
            })
        })
    }

    checkCerts(certs) {
        return new Promise(async (res, rej) => {
            let toReturn = false
            this.db.all("SELECT guests.canvas_id, guests.certs FROM current, guests WHERE current.guest_id = guests.guest_id AND guests.canvas_id IS NOT NULL", async (err, rows) => {
                if (err) rej(err)
                let toCheck = []
                for (let i in rows) {
                    toCheck.push(rows[i].canvas_id)
                }
                //console.log(rows)
                let toSet = await canvas.checkCerts(toCheck, certs)
                //console.log(toSet)
                for (let i in rows) {
                    if ((rows[i].certs | toSet[i].certs) > rows[i].certs) {
                        toReturn = true
                        console.log("Found new certification for user", rows[i].canvas_id, "taking certs from", rows[i].certs, "to", rows[i].certs | toSet[i].certs)
                        this.db.run("UPDATE guests SET certs = ? WHERE canvas_id = ?", rows[i].certs | toSet[i].certs, rows[i].canvas_id, (err) => { if (err) rej(err) })
                    }
                }
                res(toReturn)
            })
        })
    }
}

module.exports = DBTools