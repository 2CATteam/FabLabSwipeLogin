const canvasInfo = require("./canvasInfo.js")
const instances = require("./instances.js")
const axios = require('axios')

module.exports = {
    enrollUser: enrollUser,
    createUser: createUser,
    checkCerts: checkCerts,
    messageUser: messageUser
}

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

You’ve now been enrolled in a canvas course titled ‘Shop Fundamentals’ that you can access by signing into canvas just like you do for your other courses. This canvas course holds the training videos and quizzes for access to using Fab Lab equipment.

Keep in mind, before you’ll be allowed to use any of our tools, in addition to the respective trainings, you’ll have to complete our Fab Lab Culture Quiz, which is just a mechanism for making sure you’re aware of how to engage with the shop. It’ll take you all of three minutes – maybe.

This new method of training and keeping up with access is a huge undertaking on our end, so we’re thankful for your patience and feedback! It is new and complex, and again, your insight is helpful; If you run into new issues or challenges, please let us know.

If you have any questions or comments, please email us at:

fablab@ou.edu`)
            res(response.data.user_id)
        }).catch((err) => {
            console.error(err.response.data)
            if (err?.response?.data?.errors?.[0].message == "The specified resource does not exist.") {
                res(null)
                /*
                createUser(email, name).then((response) => {
                    res(response)
                }).catch((err) => {
                    console.error("Failed to create account")
                    rej(err)
                })*/
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
            let toReturn = {}
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
                toReturn[response.data[i].user_id] = certsHave
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