const canvasInfo = require("./canvasInfo.js")
const instances = require("./instances.js")
const axios = require('axios')
var sqlite = require('sqlite3');
let fs = require('fs')

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
            messageUser(response.data.user_id, "Welcome to our Canvas course!", `Welcome to the Tom Love Innovation Hub Fabrication Lab!

You are a current student in ENGR 1411 with Dr. Dodd, and by merit of that, you’ve now been enrolled in a canvas course titled ‘Shop Fundamentals’ that you can access by signing into canvas just like you do for your other courses. This canvas course holds the training videos and quizzes for access to using Fab Lab equipment.    

You’re in the midst of a project for Dr. Dodd’s class that will effectively require your utilization of the Fabrication Lab. It would behoove you to complete the respective trainings before you come to the shop (likely the 3D printer and laser cutter trainings). There are a large number of you in need of the limited tools we’ve got, so you’ll make the most efficient use of your time by sitting at the computer at home or in the Union, than here in the shop. DO NOT FORGET the ‘Culture quiz’ as it is a barrier between you and entering the shop at all.    

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
        fs.readFile("./lib/data.csv", 'utf-8', async (err, data) => {
            if (err) {
                console.error(err)
                return
            }
            let rows = data.split("\n")
            let headers = rows.shift()
            headers = headers.split(",")
            let toEnroll = []
            for (let i in rows) {
                let toAdd = {}
                let parsed = rows[i].split(",")
                for (let j in headers) {
                    toAdd[headers[j]] = parsed[j]
                }
                toEnroll.push(toAdd)
            }
            console.log(toEnroll)
            toEnroll.pop()
            for (let i in toEnroll) {
                try {
                    let canvasId = await enrollUser(toEnroll[i]["Sooner ID"], toEnroll[i]["Email Address"], toEnroll[i]["First Name"] + toEnroll[i]["Last Name"])
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