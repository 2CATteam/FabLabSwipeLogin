//Simple require stack, good on me for so few dependencies
const canvasInfo = require("./canvasInfo.js")
const axios = require('axios')

//I forgot to make this a class until afterwards, so I'm just exporting each function manually. I suck
module.exports = {
    enrollUser: enrollUser,
    createUser: createUser,
    checkCerts: checkCerts,
    messageUser: messageUser,
    getQuizData: getQuizData,
    removeCert: removeCert,
    checkRenewals: checkRenewals,
    getQuizzes: getQuizzes
}

//Template for all requests
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

//Enroll a user in the course and returns the user ID
function enrollUser(ouid, email, name, title, body) {
    return new Promise((res, rej) => {
        //Send the post request to the enrollment endpoint
        instance.post(`/api/v1/courses/248391/enrollments`, {
            enrollment: {
                user_id: `sis_user_id:${ouid}`,
                type: "StudentEnrollment",
                self_enrolled: true,
                enrollment_state: "active"
            }
        }).then((response) => {
            console.log(response.data)
            //Send a message to the user
            messageUser(response.data.user_id, title, body).catch(console.error)
            //Return the user ID
            res(response.data.user_id)
        }).catch((err) => {
            //Error handling - return null value for known errors
            if (err?.response?.data?.errors?.[0].message == "The specified resource does not exist.") {
                res(null)
                /*
                createUser(email, name).then((response) => {
                    res(response)
                }).catch((err) => {
                    console.error("Failed to create account")
                    rej(err)
                })*/
            } else {
                console.error(err.response.data)
            }
        })
    })
}

//Create a user. Doesn't work, don't use. It makes a Canvas account for non-OU people, and they don't like that
function createUser(email, name) {
    return new Promise((res, rej) => {
        //This API endpoint doesn't work with our authentication method
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

//Get certifications for a given group of students and a reference certification set. Returns an object mapping IDs to certifications
function checkCerts(studentIds, certs) {
    return new Promise((res, rej) => {
        //Get the grades for these students
        instance.get(`/api/v1/courses/${canvasInfo.course_id}/students/submissions`, {
            params: {
                student_ids: studentIds,
                grouped: true,
                include: ["assignment"]
            }
        }).then((response) => {
            //Make an object to return
            let toReturn = {}
            //For each student in the response
            for (let i in response.data) {
                //Initialize the certs they should have to none
                let certsHave = 0
                //For each assignment
                for (let j in response.data[i].submissions) {
                    //Find the matching certification
                    for (let k in certs) {
                        if (certs[k].assignmentId.toString() === response.data[i].submissions[j].assignment_id.toString()) {
                            //If they passed, add that cert to their list of completed certs
                            if (response.data[i].submissions[j].score >= response.data[i].submissions[j].assignment.points_possible) {
                                certsHave |= 1 << certs[k].id
                                console.log(response.data[i].submissions[j].user_id, "passed quiz for", certs[k].name)
                            }
                            break
                        }
                    }
                }
                //Save the certs had
                toReturn[response.data[i].user_id] = certsHave
            }
            //Return the object containing all the stuff
            res(toReturn)
        }).catch(async (err) => {
            //It's sometimes possible for ONE user to errantly cause failure for EVERYONE else.
            //  So, we want to try each user individually, and if we have any successes, we want to return those.
            if (studentIds.length > 1) {
                let anySuccesses = false
                let toReturn = {}
                for (let i in singleResult) {
                    try {
                        let singleResult = await checkCerts(studentIds[i], certs)
                        Object.assign(toReturn, singleResult)
                        anySuccesses = true
                    } catch (error) {
                        toReturn[studentIds[i]] = 0
                    }
                }
                if (!anySuccesses) {
                    console.error("Tried recovering on bad cert call, but all split calls were bad")
                    rej(err.response ? err.response.data : err)
                } else {
                    res(toReturn)
                }
            } else {
                rej(err.response ? err.response.data : err)
            }
        })
    })
}

//Similar to above, but returns when the users last renewed their certifications, in the order of the certs array
function checkRenewals(studentIds, certs) {
    return new Promise((res, rej) => {
        //Get the grades for these students
        instance.get(`/api/v1/courses/${canvasInfo.course_id}/students/submissions`, {
            params: {
                student_ids: studentIds,
                grouped: true,
                include: ["assignment"]
            }
        }).then((response) => {
            //Make an object to return
            let toReturn = {}
            //For each student in the response
            for (let i in response.data) {
                //Initialize the array of dates to return
                let renewalDates = {}
                //For each certification (switched i,j,k order because I copy-pasted and don't want to mess up)
                for (let k in certs) {
                    if (!certs[k].assignmentId) continue
                    //Find the matching assignment
                    for (let j in response.data[i].submissions) {
                        if (certs[k].assignmentId === response.data[i].submissions[j].assignment_id) {
                            //If they passed, add that cert to their list of completed certs
                            if (response.data[i].submissions[j].score >= response.data[i].submissions[j].assignment.points_possible) {
                                renewalDates[certs[k].id] = new Date(response.data[i].submissions[j].submitted_at)
                                //console.log(response.data[i].submissions[j].user_id, "passed quiz for", certs[k].name)
                            } else {
                                renewalDates[certs[k].id] = null
                            }
                            break
                        }
                    }
                }
                //Save the certs had
                toReturn[response.data[i].user_id] = renewalDates
            }
            //Return the object containing all the stuff
            res(toReturn)
        }).catch(async (err) => {
            //Error handling
            //It's sometimes possible for ONE user to errantly cause failure for EVERYONE else.
            //  So, we want to try each user individually, and if we have any successes, we want to return those.
            if (studentIds.length > 1) {
                let anySuccesses = false
                let toReturn = {}
                for (let i in singleResult) {
                    try {
                        let singleResult = await checkRenewals(studentIds[i], certs)
                        Object.assign(toReturn, singleResult)
                        anySuccesses = true
                    } catch (error) {
                        console.log("The following ID was bad and should be purged:", studentIds[i])
                        renewalDates = {}
                        for (let k in certs) {
                            renewalDates[certs[k].id] = null
                        }
                        toReturn[studentIds[i]] = renewalDates
                    }
                }
                if (!anySuccesses) {
                    console.error("Tried recovering on bad cert call, but all split calls were bad")
                    rej(err.response ? err.response.data : err)
                } else {
                    res(toReturn)
                }
            } else {
                rej(err.response ? err.response.data : err)
            }
        })
    })
}

//Gives the user a 0 in Canvas, to reflect the removal of a certification
function removeCert(studentId, certAssignmentID, reason) {
    return new Promise((res, rej) => {
        //Get the grades for these students
        instance.put(`/api/v1/courses/${canvasInfo.course_id}/assignments/${certAssignmentID}/submissions/${studentId}`, {
            comment: {
                text_comment: reason
            },
            submission: {
                posted_grade: "0"
            }
        }).then((response) => {
            res()
        }).catch((err) => {
            //Error handling
            rej(err.response.data)
        })
    })
}

//Send a message to a user
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

//Return the list of all the quizzes
function getQuizzes() {
    return new Promise((res, rej) => {
        instance.get(`/api/v1/courses/${canvasInfo.course_id}/quizzes`).then(async (response) => {
            //Just make an abbreviated list of all the quizzes with the relevant data
            let toReturn = []
            for (let i in response.data) {
                toReturn.push({
                    name: response.data[i]?.title,
                    quizId: response.data[i].id?.toString(),
                    assignmentId: response.data[i].assignment_id?.toString()
                })
            }
            res(toReturn)
        }).catch((err) => {
            return rej(err)
        })
    })
}

function getQuizData(quizId) {
    return new Promise((res, rej) => {
        instance.get(`/api/v1/courses/${canvasInfo.course_id}/quizzes/${quizId}`).then(async (response) => {
            let toReturn = {}
            toReturn.title = response.data.title
            toReturn.description = response.data.description
            toReturn.quizId = quizId
            toReturn.questions = await getQuizQuestions(quizId)
            res(toReturn)
        }).catch((err) => {
            return rej(err)
        })
    })
}

function getQuizQuestions(quizId) {
    return new Promise((res, rej) => {
        instance.get(`/api/v1/courses/${canvasInfo.course_id}/quizzes/${quizId}/questions?per_page=150`).then((response) => {
            let toReturn = []
            for (let i in response.data) {
                let toAdd = {}
                toAdd.question = response.data[i].question_text
                toAdd.type = response.data[i].question_type
                toAdd.answers = []
                for (let j in response.data[i].answers) {
                    toAdd.answers.push({text: response.data[i].answers[j].text, correct: response.data[i].answers[j].weight > 0})
                }
                //Randomize answers
                toAdd.answers = toAdd.answers.sort((a, b) => 0.5 - Math.random())
                toReturn.push(toAdd)
            }
            return res(toReturn)
        }).catch((err) => {
            return rej(err)
        })
    })
}
