const canvasInfo = require("./canvasInfo.js")
const instances = require("./instances.js")
const axios = require('axios')
var sqlite = require('sqlite3');

const instance = axios.create({
    baseURL: 'https://canvas.ou.edu',
    headers: {
        "authorization": "Bearer " + canvasInfo.api_token,
        "content-type": "application/json; charset=UTF-8",
        "x-csrf-token": canvasInfo.api_token,
        "Accept": "application/json+canvas-string-ids"
    },
    timeout: 30000
})

function enrollUser(ouid, email, name) {
    return new Promise((res, rej) => {
        instance.post(`/api/v1/courses/248391/enrollments`, {
            enrollment: {
                user_id: `sis_user_id:${ouid}`,
                type: "StudentEnrollment",
                self_enrolled: true,
                enrollment_state: "active"
            }
        }).then((response) => {
            console.log(response.data)
            messageUser(response.data.user_id, "Welcome to our Canvas course!", `Hey there! You're receiving this message because you recently visited the Tom Love Innovation Hub Fabrication Lab.

You’ve now been enrolled in a Canvas course titled ‘Shop Fundamentals’ that you can access by signing into canvas just like you do for your other courses. This canvas course holds the training videos and quizzes for access to using Fab Lab equipment. This is intended as a replacement for the previous training system of taking quizzes from our YouTube channel.

Unlike the previous training system, before you’ll be allowed to use any of our tools, in addition to the respective trainings, you’ll have to complete our Fab Lab Culture Quiz, which is just a mechanism for making sure you’re aware of how to engage with the shop. It’ll take you all of three minutes – maybe.

This new method of training and keeping up with access is a huge undertaking on our end, so we’re thankful for your patience and feedback! It is new and complex, and again, your insight is helpful; If you run into new issues or challenges, please let us know.

If you have any questions or comments, please email us at:

fablab@ou.edu`)
            res(response.data.user_id)
        }).catch((err) => {
            console.error(err.response.data)
            if (err?.response?.data?.errors?.[0].message == "The specified resource does not exist.") {
                console.log("Creating account and enrolling user")
                createUser(email, name).then((response) => {
                    res(response)
                }).catch((err) => {
                    console.error("Failed to create account")
                    rej(err)
                })
            }
        })
    })
}

function createUser(email, name) {
    return new Promise((res, rej) => {
        instance.post(`/courses/${canvasInfo.course_id}/invite_users`, {
            users: [{
                name: name,
                email: email
            }]
        }).then((response) => {
            res(response.data)
        }).catch((err) => {
            rej(err.response.status)
        })    
    })
}

function checkCerts(studentIds, certs) {
    return new Promise((res, rej) => {
        instance.get(`/api/v1/courses/${canvasInfo.course_id}/students/submissions`, {
            params: {
                student_ids: studentIds,
                grouped: true
            }
        }).then((response) => {
            let toReturn = []
            for (let i in response.data) {
                let certsHave = 0
                for (let j in response.data[i].submissions) {
                    for (let k in certs) {
                        if (certs[k].quizId === response.data[i].submissions[j].assignment_id) {
                            if (response.data[i].submissions[j].score >= certs[k].passingScore) {
                                certsHave |= 1 << certs[k].id
                                //console.log("Passed quiz for", certs[k].name)
                            }
                            break
                        }
                    }
                }
                toReturn.push({id: response.data[i].user_id, certs: certsHave})
            }
            res(toReturn)
        }).catch((err) => {
            rej(err.response.data)
        })
    })
}

function messageUser(canvasId, title, body) {
    return new Promise((res, rej) => {
        instance.post(`/api/v1/conversations`, {
            recipients: [canvasId],
            subject: title,
            body: body,
            mode: "sync"
        }).then((response) => {
            res(response.data)
        }).catch((err) => {
            rej(err.response.data)
        })
    })
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

    massEnroll() {
        this.db.all("SELECT * FROM guests WHERE canvas_id IS NULL", async (err, rows) => {
            if (err) {
                console.error(err)
                return
            }
            for (let i in rows) {
                try {
                    let canvasId = await enrollUser(rows[i].guest_id, rows[i].email, rows[i].name)
                    this.db.run("UPDATE guests SET canvas_id = ? WHERE guest_id = ?", canvasId, rows[i].guest_id, (err) => {
                        if (err) console.error(err)
                    })
                } catch (e) {
                    console.error("Non-OU student assumed:")
                    console.error(e)
                    console.error("See above")
                }
            }
        })
    }
}

let db = new DBTools("fabLab.db")
db.massEnroll()