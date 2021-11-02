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
            messageUser(response.data.user_id, "Hey you", "Shut up")
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