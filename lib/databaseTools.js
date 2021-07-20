var sqlite = require('sqlite3');
const { error } = require('three');

const history_types = {
    NOTE: 0,
    ATTENTION: 1,
    PROBLEM: 2,
    REVOKE_CERT: 3,
    ADD_CERT: 4,
    VISIT: 5,
    FIRST_VISIT: 6
}

class DBTools {
    constructor(filename) {
        this.db = new sqlite.Database(filename, sqlite.OPEN_READWRITE | sqlite.OPEN_CREATE);
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
                certs INT DEFAULT 0 CHECK (certs >= 0)
            );`)
            .exec(`CREATE TABLE current (
                guest_id TEXT PRIMARY KEY,
                FOREIGN KEY(guest_id) REFERENCES guests(guest_id)
            );`)
            .exec(`CREATE TABLE history (
                guest_id TEXT NOT NULL,
                type INT NOT NULL,
                date TEXT NOT NULL,
                resolved INT DEFAULT 0,
                cert INT,
                note TEXT,
                FOREIGN KEY(guest_id) REFERENCES guests(guest_id)
            )`)
            .exec(`CREATE TABLE tasks (
                task_id INT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT,
                period INT NOT NULL,
                remaining INT NOT NULL
            );`)
        this.db.parallelize()
    }

    async userSwipe(id) {
        return new Promise((res, rej) => {
            this.db.get("SELECT * FROM current WHERE guest_id = ?;", id, (err, row) => {
                if (err) rej(err);
                if (row) {
                    this.db.run("DELETE FROM current WHERE guest_id = ?;", id, (err) => {
                        if (err) rej(err)
                        res(false)
                    })
                } else {
                    this.db.get("SELECT * FROM guests WHERE guest_id = ?", id, (err, row2) => {
                        if (err) rej(err);
                        if (row2) {
                            this.db.run("INSERT INTO current VALUES (?)", id, (err) => {
                                if (err) rej(err)
                                res(true)
                            })
                        } else {
                            rej(new Error("New user"))
                        }
                    })
                }
            })
        })
    }

    async createUser(id, name, email, login) {
        return new Promise((res, rej) => {
            console.log(id, name, email, login)
            this.db.run("INSERT INTO guests(guest_id, name, email) VALUES (?, ?, ?)", id, name, email, (err) => {
                if (err) {
                    rej(err)
                    return
                }
                console.log("Created new user")
                this.db.run("INSERT INTO history(guest_id, type, date, resolved) VALUES (?, ?, ?, 1)",
                    id, history_types.FIRST_VISIT, new Date().toISOString(), (err) => {
                        console.log("Query complete")
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

    async addCert(user, cert, reason) {
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

    async removeCert(user, cert, reason) {
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

    async makeNote(user, type, note) {
        return new Promise((res, rej) => {
            let toSet = history_types.NOTE
            if (type == "problem") {
                toSet = history_types.PROBLEM
            } else if (type == "attention") {
                toSet = history_types.ATTENTION
            }
            this.db.run("INSERT INTO history(guest_id, type, date, resolved, note) VALUES (?, ?, ?, 0, ?",
                user, toSet, new Date().toISOString(), note, (err) => {
                    if (err) rej(err)
                    res()
                }
            )
        })
    }

    async getStatus() {
        return new Promise((res, rej) => {
            this.db.all("SELECT guests.guest_id, guests.name, guests.email, guests.certs FROM current, guests WHERE current.guest_id = guests.guest_id", (err, rows) => {
                if (err) rej(err)
                res(rows)
            })
        })
    }

    async getUser(id) {
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

    async getHistory(id) {
        return new Promise((res, rej) => {
            this.db.all("SELECT * FROM history WHERE guest_id = ?", id, (err, rows) => {
                if (err) rej(err)
                res(rows)
            })
        })
    }

    async createTask(name, description, period) {
        return new Promise((res, rej) => {
            this.db.run("INSERT INTO tasks(name, description, period, remaining) VALUES (?, ?, ?, ?)", name, description, period, period, (err) => {
                if (err) rej(err)
                res()
            })
        })
    }

    async getTasks() {
        return new Promise((res, rej) => {
            this.db.all("SELECT * FROM tasks", (err, rows) => {
                if (err) rej(err)
                res(rows)
            })
        })
    }

    async doTask(id) {
        return new Promise((res, rej) => {
            this.db.run("UPDATE tasks SET remaining = period WHERE task_id = ?", id, (err) => {
                if (err) rej(err)
                res()
            })
        })
    }
}

module.exports = DBTools